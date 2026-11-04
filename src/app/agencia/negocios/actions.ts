"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { dispatchWorkEmails } from "@/lib/email/outbox";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { activitySchema, confirmSchema, consultSchema, dealCreateSchema, dealMoveSchema, dealUpdateSchema, deliverablesSchema, feeSchema, recordResponseSchema } from "@/lib/deals/schemas";
import { campaignHeroIds } from "@/lib/deals/client-label";
import { MAX_NEW_PER_SAVE, MAX_SUGGEST, NAME_MAX, PAGE_SIZE, parseHeroSearch, type HeroSearchPage } from "@/lib/deals/hero-suggest";
import { REASON_CODES } from "@/lib/deals/vocab";
import { createClient } from "@/lib/supabase/server";

// Pipeline comercial (0066): cada ação chama uma RPC que confere papel, etapa e escopo. O servidor só
// valida a forma. Cachê (agency_fee_set) é a única ação com valor: a RPC exige Adm.

export type DealResult =
  | { ok: true; message: string; id?: string; count?: number; /** 04/11: negócio criado, mas estes heróis da campanha não entraram */ castFailed?: string[] }
  | { ok: false; error: string };

const uuid = z.uuid();

function revalidateDeal(dealId: string) {
  revalidatePath(`/agencia/negocios/${dealId}`, "layout");
  revalidatePath("/agencia/pipeline");
  revalidatePath("/agencia");
}

export async function createDealAction(input: z.input<typeof dealCreateSchema>): Promise<DealResult> {
  const ctx = await requireAgency("manager");
  const parsed = dealCreateSchema.safeParse(input);
  if (!parsed.success) return agencyFail(parsed.error.issues.some((i) => i.message === "client_required") ? "client_required" : "invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    // 0107: cliente marca e/ou herói + serviço (o roteiro nasce junto); sem a 0107, o caminho antigo (só marca)
    const { data, error } = await supabase.rpc("agency_deal_open", {
      p_agency: ctx.agency.id,
      p_data: {
        brand_id: d.brandId,
        client_talent_id: d.clientTalentId,
        service_id: d.serviceId,
        start_on: d.startOn,
        title: d.title,
        talent_brief: d.talentBrief,
        expected_start: d.expectedStart,
        expected_end: d.expectedEnd,
        owner_id: d.ownerId,
        notes: d.notes,
      },
    });
    if (error) return agencyFail(error);
    if (!data) return agencyFail("generic");
    // 0111: ligado ao negócio de origem (nova venda); falha aqui não desfaz o negócio criado
    if (d.originDealId) await supabase.rpc("deal_origin_set", { p_deal: data, p_origin: d.originDealId });
    // 04/11: heróis da campanha escolhidos no formulário entram pela MESMA ação da aba Heróis (RPC atômica
    // agency_deal_suggest_heroes). Sem migração não dá para criar e escalar numa transação só: se falhar, o negócio
    // fica criado e a tela avisa quais heróis adicionar na aba Heróis. Negócio sem marca não tem aba Heróis: não escala.
    const cast = d.brandId ? campaignHeroIds(d.campaignTalentIds) : [];
    let castFailed: string[] | undefined;
    if (cast.length > 0) {
      const res = await suggestHeroesAction({ dealId: data, items: cast.map((talentId) => ({ kind: "talent" as const, talentId, reasons: [] })) });
      if (!res.ok) castFailed = cast;
    }
    revalidatePath("/agencia/pipeline");
    revalidatePath("/agencia");
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("created"), id: data, ...(castFailed ? { castFailed } : {}) };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function updateDealAction(input: z.input<typeof dealUpdateSchema>): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = dealUpdateSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const payload: Record<string, string> = { title: d.title, talent_brief: d.talentBrief, expected_start: d.expectedStart, expected_end: d.expectedEnd };
    if (d.ownerId !== undefined) payload.owner_id = d.ownerId;
    const { error } = await supabase.rpc("agency_deal_update", { p_deal: d.dealId, p_data: payload });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function setDealTeamAction(input: { dealId: string; userIds: string[] }): Promise<DealResult> {
  await requireAgency("manager");
  const parsed = z.object({ dealId: uuid, userIds: z.array(uuid).max(30) }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deal_team_set", { p_deal: parsed.data.dealId, p_user_ids: parsed.data.userIds });
    if (error) return agencyFail(error);
    revalidateDeal(parsed.data.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("teamSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function moveDealAction(input: z.input<typeof dealMoveSchema>): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = dealMoveSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deal_move", { p_deal: d.dealId, p_to: d.to, p_outcome: d.outcome ?? undefined, p_note: d.note || undefined, p_force: d.force ?? false });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("moved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const shortlistSchema = z.object({
  dealId: uuid,
  items: z
    .array(
      z.object({
        talentId: uuid,
        reasons: z.array(z.object({ code: z.enum(REASON_CODES), met: z.boolean(), detail: z.array(z.string().max(60)).max(5) })).max(10),
      }),
    )
    .max(30),
});

export async function setShortlistAction(input: z.input<typeof shortlistSchema>): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = shortlistSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_shortlist_set", { p_deal: d.dealId, p_items: d.items.map((i) => ({ talent_id: i.talentId, reasons: i.reasons })) });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("shortlistSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

const reasonsSchema = z.array(z.object({ code: z.enum(REASON_CODES), met: z.boolean(), detail: z.array(z.string().max(60)).max(5) })).max(10);

// Sugerir heróis (0093): uma RPC atômica recebe fichas do casting, heróis da plataforma (a ficha nasce ao salvar) e heróis
// digitados (ficha sem herói). Papel, agência do negócio, herói ativo e limites são conferidos no banco.
const suggestSchema = z.object({
  dealId: uuid,
  items: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("talent"), talentId: uuid, reasons: reasonsSchema }),
        z.object({ kind: z.literal("hero"), creatorId: uuid, reasons: reasonsSchema }),
        z.object({ kind: z.literal("typed"), name: z.string().trim().min(2).max(NAME_MAX), profile: z.string().trim().max(200).optional(), email: z.string().trim().max(254).optional(), reasons: reasonsSchema }),
      ]),
    )
    .max(MAX_SUGGEST),
});

export async function suggestHeroesAction(input: z.input<typeof suggestSchema>): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  if (d.items.filter((i) => i.kind !== "talent").length > MAX_NEW_PER_SAVE) return agencyFail("too_many_new_talents");
  try {
    const supabase = await createClient();
    const items = d.items.map((i) =>
      i.kind === "talent"
        ? { kind: "talent", talent_id: i.talentId, reasons: i.reasons }
        : i.kind === "hero"
          ? { kind: "hero", creator_id: i.creatorId, reasons: i.reasons }
          : { kind: "typed", name: i.name, profile: i.profile ?? "", email: i.email ?? "", reasons: i.reasons },
    );
    const { data, error } = await supabase.rpc("agency_deal_suggest_heroes", { p_deal: d.dealId, p_items: items });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    revalidatePath("/agencia/casting");
    const created = typeof (data as { created?: unknown } | null)?.created === "number" ? ((data as { created: number }).created) : 0;
    const t = await getTranslations("agency.deal");
    return { ok: true, message: created > 0 ? t("heroesSavedCreated", { count: created }) : t("shortlistSaved"), count: created };
  } catch (error) {
    return agencyFail(error);
  }
}

export type HeroSearchResult = ({ ok: true } & HeroSearchPage) | { ok: false; error: string };

/** Busca no servidor dos heróis ativos da plataforma que ainda não são do casting (20 por página). */
export async function searchHeroesAction(input: { dealId: string; q: string; offset?: number }): Promise<HeroSearchResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, q: z.string().max(200), offset: z.number().int().min(0).max(5000).optional() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_hero_search", { p_deal: parsed.data.dealId, p_q: parsed.data.q, p_limit: PAGE_SIZE, p_offset: parsed.data.offset ?? 0 });
    if (error) return agencyFail(error);
    return { ok: true, ...parseHeroSearch(data) };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function addActivityAction(input: z.input<typeof activitySchema> & { dealId: string }): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = activitySchema.extend({ dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_activity_add", { p_subject_type: d.subjectType, p_subject_id: d.subjectId, p_kind: d.kind, p_body: d.body });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("activityAdded"), id: data ?? undefined };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Cachê do creator no negócio (só o Adm; a RPC recusa os demais). */
export async function setFeeAction(input: z.input<typeof feeSchema> & { dealId: string }): Promise<DealResult> {
  await requireAgency("admin");
  const parsed = feeSchema.extend({ dealId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_fee_set", { p_deal_talent: d.dealTalentId, p_fee_cents: d.feeCents });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("feeSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function saveDeliverablesAction(input: z.input<typeof deliverablesSchema>): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = deliverablesSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deliverables_save", {
      p_deal: d.dealId,
      p_items: d.items.map((i) => ({ id: i.id, deal_talent_id: i.dealTalentId, kind: i.kind, network: i.network, title: i.title, brief: i.brief, due_at: i.dueAt, publish_at: i.publishAt })),
    });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("deliverablesSaved") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function consultTalentsAction(input: z.input<typeof consultSchema>): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = consultSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const respondBy = new Date(Date.now() + d.days * 86_400_000).toISOString();
    // exclusividade vigente (0079): sem confirmação o banco recusa (exclusivity_conflict); com ela, registra em activities
    const args = { p_deal: d.dealId, p_deal_talent_ids: d.dealTalentIds, p_respond_by: respondBy, p_message: d.message || undefined };
    const { data, error } = d.confirmConflicts ? await supabase.rpc("agency_consult_talents_confirmed", args) : await supabase.rpc("agency_consult_talents", args);
    if (error) return agencyFail(error);
    // oferta nova para o influenciador também por e-mail (0084), depois da resposta
    await dispatchWorkEmails();
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("consulted", { count: data ?? 0 }), count: data ?? 0 };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function recordResponseAction(input: z.input<typeof recordResponseSchema> & { dealId: string; documentId?: string | null }): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = recordResponseSchema.extend({ dealId: uuid, documentId: uuid.nullable().optional() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_record_talent_response", { p_deal_talent: d.dealTalentId, p_response: d.response, p_note: d.note, p_document: d.documentId ?? undefined });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("responseRecorded") };
  } catch (error) {
    return agencyFail(error);
  }
}

export async function removeDealTalentAction(input: { dealId: string; dealTalentId: string }): Promise<DealResult> {
  await requireAgency("staff");
  const parsed = z.object({ dealId: uuid, dealTalentId: uuid }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deal_talent_set_status", { p_deal_talent: parsed.data.dealTalentId, p_status: "removed" });
    if (error) return agencyFail(error);
    revalidateDeal(parsed.data.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("talentRemoved") };
  } catch (error) {
    return agencyFail(error);
  }
}

/** Confirmação dos termos (só o Adm): a campanha vira "aprovada" e a marca e os creators são avisados. */
export async function confirmDealAction(input: z.input<typeof confirmSchema>): Promise<DealResult> {
  await requireAgency("admin");
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const d = parsed.data;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_deal_confirm", { p_deal: d.dealId, p_note: d.note || undefined, p_force: d.force });
    if (error) return agencyFail(error);
    revalidateDeal(d.dealId);
    const t = await getTranslations("agency.deal");
    return { ok: true, message: t("confirmed") };
  } catch (error) {
    return agencyFail(error);
  }
}
