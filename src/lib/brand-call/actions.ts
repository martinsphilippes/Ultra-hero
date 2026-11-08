"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireBrand } from "@/lib/brand-portal/server";
import { requestDeliverablesSchema } from "@/lib/deals/schemas";
import { dispatchWorkEmails } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";
import { linkToEvent } from "@/lib/culture/link";
import { VALUE_MODELS } from "@/lib/value-model/model";
import { compensationDbSchema } from "@/lib/compensation/schema";
import { getTalentContext } from "@/lib/talent/server";
import { CALL_DECISIONS, MAX_PROPOSAL_TALENTS, callFormSchema, callToDb, counterTermsOk, hasMoney, mediaKitUrlValid, validateCall, type CallFormInput } from "./logic";

// Chamada da marca (0089). Marca: a equipe monta e pede ao dono; o dono publica, decide e aprova rodadas. Agência:
// gestor+ monta a proposta, só o Adm grava valor, envia e responde. Creator: "Tenho interesse". As RPCs conferem
// tudo de novo e geram os avisos (sino e fila de e-mail, que sai depois da resposta).
// 0140: chamada, proposta e contraproposta levam a forma de pagamento (valor, permuta e/ou performance); sem dinheiro
// não vai valor nem modelo por Hero, e o acordo pode sair só com permuta/performance.

export type BrandCallResult = { ok: true; message: string; id?: string; status?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/marca/oportunidades", "layout");
  revalidatePath("/agencia/oportunidades", "layout");
  revalidatePath("/agencia/agenda");
  revalidatePath("/heroi/oportunidades");
}

const isoDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable();

// ---------------------------------------------------------------- marca
/** Salva o rascunho; com publish, pede a publicação (dono publica direto; equipe vai para o dono). */
export async function saveBrandCallAction(input: CallFormInput, publish: boolean): Promise<BrandCallResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  // 0140: forma de pagamento inválida tem mensagem própria (o banco confere de novo)
  if (input?.compensation !== undefined && !compensationDbSchema.safeParse(input.compensation).success) return agencyFail("invalid_compensation");
  const parsed = callFormSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const v = parsed.data;
  const t = await getTranslations("brandCall.form");
  const problem = validateCall(v, publish);
  if (problem) return { ok: false, error: t(`errors.${problem}`) };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_call_save", { p_brand: ctx.brand.id, p_id: v.id, p_data: callToDb(v) as never });
    if (error) return agencyFail(error);
    if (!data) return agencyFail("generic");
    let status = "draft";
    // 0101: chamada a partir de um evento da agenda — o vínculo é gravado no rascunho, antes de publicar
    if (v.calendarEventId && !(await linkToEvent("brand_call", data, v.calendarEventId)).ok) {
      refresh();
      return { ok: true, id: data, status, message: (await getTranslations("culture.link"))("failed") };
    }
    if (publish) {
      const sent = await supabase.rpc("brand_call_submit", { p_id: data, p_note: "" });
      if (sent.error) {
        refresh();
        return agencyFail(sent.error);
      }
      status = String(sent.data ?? "draft");
    }
    refresh();
    await dispatchWorkEmails();
    return { ok: true, id: data, status, message: status === "published" ? t("published") : status === "pending_owner" ? t("toOwner") : t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const submitSchema = z.object({ id: z.uuid(), note: z.string().trim().max(500) });

export async function submitBrandCallAction(input: z.input<typeof submitSchema>): Promise<BrandCallResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_call_submit", { p_id: parsed.data.id, p_note: parsed.data.note });
    if (error) return agencyFail(error);
    refresh();
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.form");
    return { ok: true, status: String(data), message: data === "published" ? t("published") : t("toOwner") };
  } catch (error) {
    return agencyFail(error);
  }
}

const reviewSchema = z.object({ id: z.uuid(), decision: z.enum(["approve", "return", "withdraw"]), note: z.string().trim().max(500) });

/** Dono aprova (publica) ou devolve; quem pediu retira o pedido. */
export async function reviewBrandCallAction(input: z.input<typeof reviewSchema>): Promise<BrandCallResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.decision !== "withdraw" && ctx.role !== "owner") return agencyFail("forbidden");
  if (d.decision === "return" && d.note.length < 3) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_call_review", { p_id: d.id, p_decision: d.decision, p_note: d.note });
    if (error) return agencyFail(error);
    refresh();
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.approval");
    return { ok: true, message: t(`done.${d.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

const decideSchema = z.object({ id: z.uuid(), action: z.enum(CALL_DECISIONS), proposalIds: z.array(z.uuid()).max(100), note: z.string().trim().max(500) });

/** Só o dono: contratar as escolhidas, encerrar sem contratar ou cancelar. */
export async function decideBrandCallAction(input: z.input<typeof decideSchema>): Promise<BrandCallResult> {
  const ctx = await requireBrand();
  if (ctx.role !== "owner") return agencyFail("forbidden");
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.action === "contract" && d.proposalIds.length === 0) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_call_decide", { p_id: d.id, p_action: d.action, p_proposals: d.action === "contract" ? d.proposalIds : [], p_note: d.note });
    if (error) return agencyFail(error);
    refresh();
    revalidatePath("/marca/campanhas");
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.decide");
    return { ok: true, message: t(`done.${d.action}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

const termsSchema = z.object({
  proposalId: z.uuid(),
  action: z.enum(["accept", "decline", "counter"]),
  amountCents: z.number().int().min(1).max(10_000_000_000).nullable(),
  deliverables: requestDeliverablesSchema,
  deliverBy: isoDate,
  note: z.string().trim().max(500),
  /** 0096: a contraproposta pode mudar o modelo de valor e o máximo de Heros (sem informar, ficam como estão). */
  valueModel: z.enum(VALUE_MODELS).nullable().optional(),
  maxHeroes: z.number().int().min(1).max(50).nullable().optional(),
  /** 0140: a contraproposta pode mudar a forma de pagamento (sem informar, fica a atual). Sem dinheiro, sem valor. */
  compensation: compensationDbSchema.nullable().optional(),
});

function termsValid(d: z.infer<typeof termsSchema>): boolean {
  if (d.action !== "counter") return true;
  return counterTermsOk({ money: hasMoney(d), amountCents: d.amountCents, deliverables: d.deliverables, valueModel: d.valueModel, maxHeroes: d.maxHeroes });
}

/** Argumentos da resposta (marca ou agência): só a contraproposta leva termos; sem dinheiro, sem valor nem modelo por Hero. */
function replyArgs(d: z.infer<typeof termsSchema>) {
  const counter = d.action === "counter";
  const money = hasMoney(d);
  return {
    p_proposal: d.proposalId,
    p_action: d.action,
    p_amount_cents: counter && money ? d.amountCents : null,
    p_deliverables: counter ? (d.deliverables as never) : null,
    p_deliver_by: counter && d.deliverBy ? d.deliverBy : null,
    p_note: d.note,
    p_value_model: counter ? (money ? (d.valueModel ?? null) : "fixo") : null,
    p_max_heroes: counter && money && d.valueModel === "por_heroi" ? (d.maxHeroes ?? null) : null,
    p_compensation: counter ? ((d.compensation ?? null) as never) : null,
  };
}

/** Erro de validação: forma de pagamento inválida tem mensagem própria. */
function termsFail(input: unknown) {
  const c = input && typeof input === "object" ? (input as { compensation?: unknown }).compensation : undefined;
  return agencyFail(c !== undefined && c !== null && !compensationDbSchema.safeParse(c).success ? "invalid_compensation" : "invalid_input");
}

/** Marca responde à proposta da agência (equipe: aceitar/contrapropor vão para o dono). */
export async function brandCallReplyAction(input: z.input<typeof termsSchema>): Promise<BrandCallResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = termsSchema.safeParse(input);
  if (!parsed.success) return termsFail(input);
  if (!termsValid(parsed.data)) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_call_reply", replyArgs(d));
    if (error) return agencyFail(error);
    refresh();
    revalidatePath("/marca/campanhas");
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.negotiation.done");
    return { ok: true, message: data === "pending_owner" ? t("toOwner") : t(data === "agreed" ? "agreed" : data === "declined" ? "declined" : "sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

const roundReviewSchema = z.object({ roundId: z.uuid(), decision: z.enum(["approve", "return"]), note: z.string().trim().max(500) });

export async function brandCallRoundReviewAction(input: z.input<typeof roundReviewSchema>): Promise<BrandCallResult> {
  const ctx = await requireBrand();
  if (ctx.role !== "owner") return agencyFail("forbidden");
  const parsed = roundReviewSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.decision === "return" && d.note.length < 3) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_call_round_review", { p_round: d.roundId, p_decision: d.decision, p_note: d.note });
    if (error) return agencyFail(error);
    refresh();
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.negotiation.done");
    return { ok: true, message: d.decision === "return" ? t("returned") : t(data === "agreed" ? "agreed" : "sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- agência
const proposalSchema = z.object({
  callId: z.uuid(),
  talents: z
    .array(z.object({ talentId: z.uuid(), deliverables: requestDeliverablesSchema.min(1), mediaKitUrl: z.string().trim().max(500) }))
    .min(1)
    .max(MAX_PROPOSAL_TALENTS),
  amountCents: z.number().int().min(1).max(10_000_000_000).nullable(),
  /** 0096: modelo do valor da proposta (só o Adm muda): fixo = total; por Hero = valor por Hero + máximo de Heros. */
  valueModel: z.enum(VALUE_MODELS).default("fixo"),
  maxHeroes: z.number().int().min(1).max(50).nullable().default(null),
  deliverBy: isoDate,
  note: z.string().trim().max(1000),
  send: z.boolean(),
  /** 0140: forma de pagamento da proposta (só o Adm muda; sem ela o banco mantém a da proposta ou a da chamada). */
  compensation: compensationDbSchema.nullable().optional(),
});

/** Gestor+ salva o rascunho; o Adm grava o valor e a forma de pagamento e, com send, envia à marca. */
export async function saveCallProposalAction(input: z.input<typeof proposalSchema>): Promise<BrandCallResult> {
  const ctx = await requireAgency("manager");
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return termsFail(input);
  if (parsed.data.talents.some((x) => !mediaKitUrlValid(x.mediaKitUrl))) return agencyFail("invalid_input");
  const d = parsed.data;
  // sem dinheiro (só permuta/performance): sem valor, modelo fixo e sem máximo (o banco força o mesmo)
  const money = hasMoney(d);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_brand_call_proposal_save", {
      p_call: d.callId,
      p_agency: ctx.agency.id,
      p_data: {
        talents: d.talents.map((x) => ({ talent_id: x.talentId, deliverables: x.deliverables, media_kit_url: x.mediaKitUrl })),
        amount_cents: money ? d.amountCents : null,
        value_model: money ? d.valueModel : "fixo",
        max_heroes: money && d.valueModel === "por_heroi" ? d.maxHeroes : null,
        deliver_by: d.deliverBy || null,
        note: d.note,
        ...(d.compensation ? { compensation: d.compensation } : {}),
      } as never,
    });
    if (error) return agencyFail(error);
    const t = await getTranslations("brandCall.agency.proposal");
    if (d.send) {
      const sent = await supabase.rpc("agency_brand_call_proposal_send", { p_proposal: data });
      if (sent.error) {
        refresh();
        return agencyFail(sent.error);
      }
    }
    refresh();
    await dispatchWorkEmails();
    return { ok: true, id: data ?? undefined, message: d.send ? t("sent") : t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const proposalIdSchema = z.object({ proposalId: z.uuid() });

export async function discardCallProposalAction(input: z.input<typeof proposalIdSchema>): Promise<BrandCallResult> {
  await requireAgency("manager");
  const parsed = proposalIdSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_brand_call_proposal_discard", { p_proposal: parsed.data.proposalId });
    if (error) return agencyFail(error);
    refresh();
    const t = await getTranslations("brandCall.agency.proposal");
    return { ok: true, message: t("discarded") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Agência (só Adm): aceitar, recusar (com nota) ou contrapropor. */
export async function agencyCallReplyAction(input: z.input<typeof termsSchema>): Promise<BrandCallResult> {
  await requireAgency("admin");
  const parsed = termsSchema.safeParse(input);
  if (!parsed.success) return termsFail(input);
  if (!termsValid(parsed.data)) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.action === "decline" && d.note.length < 3) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_brand_call_reply", replyArgs(d));
    if (error) return agencyFail(error);
    refresh();
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.negotiation.done");
    return { ok: true, message: t(data === "agreed" ? "agreed" : data === "declined" ? "declined" : "sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- creator
const interestSchema = z.object({ callId: z.uuid(), message: z.string().trim().max(300) });

export async function callInterestAction(input: z.input<typeof interestSchema>): Promise<BrandCallResult> {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return agencyFail("forbidden");
  const parsed = interestSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("talent_brand_call_interest", { p_call: parsed.data.callId, p_message: parsed.data.message });
    if (error) return agencyFail(error);
    revalidatePath("/heroi/oportunidades");
    revalidatePath("/agencia/oportunidades", "layout");
    await dispatchWorkEmails();
    const t = await getTranslations("brandCall.talent");
    return { ok: true, message: t("interestSent") };
  } catch (error) {
    return agencyFail(error);
  }
}
