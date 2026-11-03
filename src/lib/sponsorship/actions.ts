"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { requireBrand } from "@/lib/brand-portal/server";
import { dispatchWorkEmails } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";
import { REPLY_ACTIONS, amountValid, proposalPerksValid, publicSchema, publicToDb } from "./negotiation";
import { SPONSORSHIP_DECISIONS, SPONSORSHIP_RESPONSES, sponsorshipInstants, sponsorshipSchema, type SponsorshipInput } from "./vocab";

// Oportunidade de patrocínio (0085): a agência (gestor+) publica e decide; a marca (dono ou equipe) responde.
// As RPCs conferem tudo de novo e geram os avisos (sino e fila de e-mail, que sai depois da resposta).

export type SponsorshipResult = { ok: true; message: string; id?: string; requestId?: string | null } | { ok: false; error: string };

export async function saveSponsorshipAction(input: SponsorshipInput): Promise<SponsorshipResult> {
  const ctx = await requireAgency("manager");
  const parsed = sponsorshipSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  const when = sponsorshipInstants(d, ctx.agency.timezone || "America/Sao_Paulo");
  if (!when) return agencyFail("invalid_date");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_sponsorship_save", {
      p_agency: ctx.agency.id,
      p_id: d.id,
      p_data: {
        talent_id: d.talentId,
        title: d.title,
        description: d.description,
        location: d.location,
        starts_at: when.startsAt,
        ends_at: when.endsAt,
        all_day: d.allDay,
        expected_reach: d.expectedReach,
        perks: d.perks,
        networks: d.networks,
        respond_by: when.respondBy,
        audience: d.audience,
        brand_ids: d.audience === "selected" ? d.brandIds : [],
        // 0088: cotas (o banco ignora o valor de quem não é Adm) e público do evento
        tiers: d.tiers.map((x) => ({ id: x.id, name: x.name, price_cents: x.priceCents, perks: x.perks, slots: x.slots })),
        target_audience: d.public.targetAudience,
        target_age_bands: d.public.targetAgeBands,
        target_states: d.public.targetStates,
        region_note: d.public.regionNote,
      },
    });
    if (error) return agencyFail(error);
    if (!data) return agencyFail("generic");
    revalidatePath("/agencia/oportunidades", "layout");
    revalidatePath("/agencia/agenda");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.agency");
    return { ok: true, message: d.id ? t("saved") : t("published"), id: data };
  } catch (error) {
    return agencyFail(error);
  }
}

const decideSchema = z.object({
  id: z.uuid(),
  action: z.enum(SPONSORSHIP_DECISIONS),
  brandIds: z.array(z.uuid()).max(200),
  note: z.string().trim().max(500),
});

export async function decideSponsorshipAction(input: z.input<typeof decideSchema>): Promise<SponsorshipResult> {
  await requireAgency("manager");
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.action === "sponsor" && d.brandIds.length === 0) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_sponsorship_decide", {
      p_id: d.id,
      p_action: d.action,
      p_brands: d.action === "sponsor" ? d.brandIds : [],
      p_note: d.note,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/oportunidades", "layout");
    revalidatePath("/agencia/agenda");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.agency.decide");
    return { ok: true, message: t(`done.${d.action}`) };
  } catch (error) {
    return agencyFail(error);
  }
}

const respondSchema = z.object({ id: z.uuid(), response: z.enum(SPONSORSHIP_RESPONSES), message: z.string().trim().max(500) });

export async function respondSponsorshipAction(input: z.input<typeof respondSchema>): Promise<SponsorshipResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_sponsorship_respond", {
      p_id: d.id,
      p_brand: ctx.brand.id,
      p_response: d.response,
      p_message: d.message,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.brand");
    return { ok: true, message: d.response === "interested" ? t("interestSent") : t("declineSent"), requestId: data ?? null };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- negociação (0088)
const termsSchema = z.object({
  amountCents: z.number().int().nullable(),
  perks: z.array(z.string().trim()).max(10),
  note: z.string().trim().max(500),
  public: publicSchema.nullable(),
});

const proposeSchema = termsSchema.extend({ id: z.uuid(), tierId: z.uuid(), action: z.enum(["accept_asked", "propose"]) });

/** Marca: aceitar a cota pelo valor pedido ou fazer proposta. Equipe: vai para o dono aprovar. */
export async function proposeSponsorshipAction(input: z.input<typeof proposeSchema>): Promise<SponsorshipResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = proposeSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.action === "propose" && (!amountValid(d.amountCents) || !proposalPerksValid(d.perks))) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("brand_sponsorship_propose", {
      p_id: d.id,
      p_brand: ctx.brand.id,
      p_tier: d.tierId,
      p_action: d.action,
      p_amount_cents: d.action === "propose" ? d.amountCents : null,
      p_perks: d.action === "propose" ? d.perks : null,
      p_note: d.note,
      p_audience: d.action === "propose" ? publicToDb(d.public) : null,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.negotiation.done");
    return { ok: true, message: ctx.role === "owner" ? t(d.action === "accept_asked" ? "agreed" : "sent") : t("toOwner") };
  } catch (error) {
    return agencyFail(error);
  }
}

const replySchema = termsSchema.extend({ proposalId: z.uuid(), action: z.enum(REPLY_ACTIONS) });

function replyValid(d: z.infer<typeof replySchema>): boolean {
  if (d.action !== "counter") return true;
  return amountValid(d.amountCents) && proposalPerksValid(d.perks);
}

/** Marca responde à contraproposta da agência. */
export async function brandReplySponsorshipAction(input: z.input<typeof replySchema>): Promise<SponsorshipResult> {
  const ctx = await requireBrand();
  if (!ctx.role) return agencyFail("forbidden");
  const parsed = replySchema.safeParse(input);
  if (!parsed.success || !replyValid(parsed.data)) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_sponsorship_reply", {
      p_proposal: d.proposalId,
      p_action: d.action,
      p_amount_cents: d.action === "counter" ? d.amountCents : null,
      p_perks: d.action === "counter" ? d.perks : null,
      p_note: d.note,
      p_audience: d.action === "counter" ? publicToDb(d.public) : null,
    });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.negotiation.done");
    return { ok: true, message: data === "pending_owner" ? t("toOwner") : t(data === "agreed" ? "agreed" : data === "declined" ? "declined" : "sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

const reviewSchema = z.object({ roundId: z.uuid(), decision: z.enum(["approve", "return"]), note: z.string().trim().max(500) });

/** Dono da marca aprova (envia à agência) ou devolve a rodada da equipe. */
export async function reviewSponsorshipRoundAction(input: z.input<typeof reviewSchema>): Promise<SponsorshipResult> {
  const ctx = await requireBrand();
  if (ctx.role !== "owner") return agencyFail("forbidden");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.decision === "return" && d.note.length < 3) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("brand_sponsorship_round_review", { p_round: d.roundId, p_decision: d.decision, p_note: d.note });
    if (error) return agencyFail(error);
    revalidatePath("/marca", "layout");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.negotiation.done");
    return { ok: true, message: d.decision === "return" ? t("returned") : t(data === "agreed" ? "agreed" : "sent") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Agência (só Adm): aceitar, recusar (com nota) ou contrapropor. */
export async function agencyReplySponsorshipAction(input: z.input<typeof replySchema>): Promise<SponsorshipResult> {
  await requireAgency("admin");
  const parsed = replySchema.safeParse(input);
  if (!parsed.success || !replyValid(parsed.data)) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.action === "decline" && d.note.length < 3) return agencyFail("note_required");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_sponsorship_reply", {
      p_proposal: d.proposalId,
      p_action: d.action,
      p_amount_cents: d.action === "counter" ? d.amountCents : null,
      p_perks: d.action === "counter" ? d.perks : null,
      p_note: d.note,
    });
    if (error) return agencyFail(error);
    revalidatePath("/agencia/oportunidades", "layout");
    await dispatchWorkEmails();
    const t = await getTranslations("sponsorship.negotiation.done");
    return { ok: true, message: t(data === "agreed" ? "agreed" : data === "declined" ? "declined" : "sent") };
  } catch (error) {
    return agencyFail(error);
  }
}
