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
import { CREATOR_ACTIONS, MAX_PLAN_CREATORS, NOTE_MIN, planProblem, planToDb, REASON_MAX, REASON_MIN } from "./budget-change";

// Pedido de alteração de verba (0090). Marca: a equipe monta e o dono envia; só o dono confirma ou recusa o
// realinhamento. Agência: só o Adm recusa ou propõe o realinhamento. As RPCs conferem tudo de novo, gravam o
// histórico e geram os avisos (sino e fila de e-mail, que sai depois da resposta).

export type ChangeResult = { ok: true; message: string; status?: string } | { ok: false; error: string };

const uuid = z.uuid();
const cents = z.number().int().min(0).max(10_000_000_000);

function refresh(requestId: string | null, dealId: string | null) {
  if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) revalidatePath(`/marca/campanhas/${requestId}`);
  if (dealId && /^[0-9a-f-]{36}$/i.test(dealId)) revalidatePath(`/agencia/negocios/${dealId}`, "layout");
  revalidatePath("/marca");
}

const createSchema = z.object({
  requestId: uuid,
  cents,
  reason: z.string().trim().min(REASON_MIN).max(REASON_MAX),
  talents: z.array(z.object({ dealTalentId: uuid, cents })).max(MAX_PLAN_CREATORS),
});

/** Marca pede a alteração (dono envia direto; equipe vai para o dono). */
export async function requestBudgetChangeAction(input: z.input<typeof createSchema>): Promise<ChangeResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return agencyFail(parsed.error.issues.some((i) => i.path[0] === "reason") ? "reason_required" : "invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_budget_change_create", {
      p_request: parsed.data.requestId,
      p_cents: parsed.data.cents,
      p_reason: parsed.data.reason,
      p_talents: parsed.data.talents.map((x) => ({ deal_talent_id: x.dealTalentId, cents: x.cents })),
    });
    if (error) return agencyFail(error);
    refresh(parsed.data.requestId, null);
    await dispatchWorkEmails();
    const status = String((data as { status?: string } | null)?.status ?? "");
    const t = await getTranslations("payments.change");
    return { ok: true, status, message: status === "open" ? t("sentToAgency") : t("sentToOwner") };
  } catch (error) {
    return agencyFail(error);
  }
}

const reviewSchema = z.object({ id: uuid, requestId: uuid, decision: z.enum(["send", "return", "withdraw"]), note: z.string().trim().max(1000) });

/** Dono envia ou devolve o pedido da equipe; quem pediu (ou o dono) retira. */
export async function reviewBudgetChangeAction(input: z.input<typeof reviewSchema>): Promise<ChangeResult> {
  await requireBrand();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  if (parsed.data.decision === "return" && parsed.data.note.length < NOTE_MIN) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_budget_change_review", { p_id: parsed.data.id, p_decision: parsed.data.decision, p_note: parsed.data.note || null });
    if (error) return agencyFail(error);
    refresh(parsed.data.requestId, null);
    await dispatchWorkEmails();
    const t = await getTranslations("payments.change");
    return { ok: true, status: String(data), message: t(`done.${parsed.data.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

const answerSchema = z.object({ id: uuid, requestId: uuid, decision: z.enum(["confirm", "decline"]), note: z.string().trim().max(1000) });

/** Dono confirma (aplica) ou recusa o realinhamento da agência. */
export async function answerBudgetChangeAction(input: z.input<typeof answerSchema>): Promise<ChangeResult> {
  await requireBrand();
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  if (parsed.data.decision === "decline" && parsed.data.note.length < NOTE_MIN) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_budget_change_answer", { p_id: parsed.data.id, p_decision: parsed.data.decision, p_note: parsed.data.note || null });
    if (error) return agencyFail(error);
    refresh(parsed.data.requestId, null);
    await dispatchWorkEmails();
    const t = await getTranslations("payments.change");
    return { ok: true, status: String(data), message: t(`done.${parsed.data.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

const planDraftSchema = z.object({
  creators: z
    .array(z.object({ dealTalentId: uuid.nullable(), name: z.string().max(120), action: z.enum(CREATOR_ACTIONS), note: z.string().max(300) }))
    .max(MAX_PLAN_CREATORS),
  changeDeliverables: z.boolean(),
  deliverables: requestDeliverablesSchema,
  periodStart: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  periodEnd: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  scheduleNote: z.string().max(500),
  perksText: z.string().max(3000),
  note: z.string().max(1000),
});
const decideSchema = z.object({
  id: uuid,
  dealId: uuid,
  decision: z.enum(["decline", "propose"]),
  note: z.string().trim().max(1000),
  counterCents: cents.nullable(),
  plan: planDraftSchema.nullable(),
});

/** Adm recusa (com nota) ou aceita e propõe o realinhamento (plano + valor opcional). */
export async function decideBudgetChangeAction(input: z.input<typeof decideSchema>): Promise<ChangeResult> {
  await requireAgency("admin");
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const v = parsed.data;
  if (v.decision === "decline" && v.note.length < NOTE_MIN) return agencyFail("note_required");
  const t = await getTranslations("payments.change");
  if (v.decision === "propose" && v.plan) {
    const problem = planProblem(v.plan);
    if (problem) return { ok: false, error: t(`planErrors.${problem}`) };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_budget_change_decide", {
      p_id: v.id,
      p_decision: v.decision,
      p_note: v.note || null,
      p_plan: v.decision === "propose" ? ((v.plan ? planToDb(v.plan) : {}) as never) : null,
      p_counter_cents: v.decision === "propose" ? v.counterCents : null,
    });
    if (error) return agencyFail(error);
    refresh(null, v.dealId);
    await dispatchWorkEmails();
    return { ok: true, status: String(data), message: t(`done.${v.decision}`) };
  } catch (error) {
    return agencyFail(error);
  }
}
