import "server-only";
import { cache } from "react";
import { agencyCan, canWorkDeal, type AgencyRole } from "@/lib/agency/roles";
import { dealPaymentPlan } from "@/lib/finance/queries";
import { canCreateForCampaign } from "@/lib/hero-work/campaign";
import { createClient } from "@/lib/supabase/server";
import { localDay } from "@/lib/today/logic";
import { nextStep } from "./next-step";
import { getDealOffer, listBrandCampaigns, listOpportunities } from "./queries";
import {
  agencyNeedsRefine,
  agencySource,
  brandSource,
  buildTurnQueue,
  heroSource,
  TURN_LIMIT,
  type AcceptanceRow,
  type AgencyAdminData,
  type AgencyDealRow,
  type AgencyRefine,
  type DeliverableRowLite,
  type OfferRoundRow,
  type TermsRow,
  type TurnItem,
} from "./turn-queue";
import type { DeliverableStatus } from "./vocab";

// "Sua vez" das telas iniciais (05/11): leitura EM LOTE por portal — uma consulta por tabela para os até 50 negócios
// abertos mais recentes (nada de chamar a ficha de cada negócio) — e a conta em memória (turn-queue.ts). A RLS de cada
// tabela decide o que entra: o colaborador só lê os negócios dele; a marca, as campanhas dela; o Hero, as oportunidades
// dele. Sem migração nova.
//
// Exceção consciente: gestor/colaborador da agência não leem as rodadas da negociação nem as condições de pagamento (só
// o Adm). Quando isso muda a resposta (ver agencyNeedsRefine), consulta-se a RPC só daquele negócio — poucos casos, em
// paralelo e com teto (REFINE_MAX); acima do teto o item fica de fora em vez de mostrar uma vez que talvez não seja dele.

export type TurnResult = { available: boolean; items: TurnItem[]; timeZone: string };
const REFINE_MAX = 8;
const DEFAULT_TZ = "America/Sao_Paulo";

type Client = Awaited<ReturnType<typeof createClient>>;

async function readTerms(supabase: Client, dealIds: string[], acceptances: { party?: "brand" | "talent"; dealTalentIds?: string[] } = {}) {
  if (dealIds.length === 0) return { terms: [] as TermsRow[], acceptances: [] as AcceptanceRow[] };
  let acc = supabase.from("deal_acceptances").select("terms_id, party, deal_talent_id").in("deal_id", dealIds);
  if (acceptances.party) acc = acc.eq("party", acceptances.party);
  if (acceptances.dealTalentIds) acc = acc.in("deal_talent_id", acceptances.dealTalentIds);
  const [t, a] = await Promise.all([supabase.from("deal_terms").select("id, deal_id, status, valid_until, version").in("deal_id", dealIds), acc]);
  return {
    terms: (t.data ?? []).map((x) => ({ id: x.id, dealId: x.deal_id, status: x.status, validUntil: x.valid_until, version: x.version })),
    acceptances: (a.data ?? []).map((x) => ({ termsId: x.terms_id, party: x.party as AcceptanceRow["party"], dealTalentId: x.deal_talent_id })),
  };
}

async function readDeliverables(supabase: Client, dealIds: string[]): Promise<DeliverableRowLite[]> {
  if (dealIds.length === 0) return [];
  const { data } = await supabase
    .from("deliverables")
    .select("id, deal_id, deal_talent_id, title, kind, status, due_at, publish_at, talent:talent_profiles!deliverables_talent_fk(display_name)")
    .in("deal_id", dealIds)
    .neq("status", "cancelled");
  type Row = { id: string; deal_id: string; deal_talent_id: string; title: string; kind: string; status: string; due_at: string | null; publish_at: string | null; talent: { display_name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((x) => ({
    id: x.id,
    dealId: x.deal_id,
    dealTalentId: x.deal_talent_id,
    heroName: x.talent?.display_name ?? "",
    title: x.title ?? "",
    kind: x.kind,
    status: x.status as DeliverableStatus,
    dueAt: x.due_at,
    publishAt: x.publish_at,
  }));
}

async function readRounds(supabase: Client, dealIds: string[]): Promise<OfferRoundRow[]> {
  if (dealIds.length === 0) return [];
  const { data } = await supabase.from("deal_offer_rounds").select("deal_id, seq, side, action").in("deal_id", dealIds);
  return (data ?? []).map((r) => ({ dealId: r.deal_id, seq: r.seq, side: r.side as OfferRoundRow["side"], action: r.action as OfferRoundRow["action"] }));
}

// ---------------------------------------------------------------- agência
export async function agencyTurns(input: { agencyId: string; role: AgencyRole | null; platformAdmin: boolean; userId: string | null; timeZone?: string }): Promise<TurnResult> {
  const timeZone = input.timeZone || DEFAULT_TZ;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, title, stage, outcome, stage_changed_at, owner_id, request_id, brand_visible, contract_confirmed_at, brand:brands!deals_brand_fk(name), request:campaign_requests!deals_request_fk(origin), deal_team(user_id), deal_talents(id, status, respond_by, terms_ready, talent:talent_profiles!deal_talents_talent_fk(display_name))",
    )
    .eq("agency_id", input.agencyId)
    .neq("stage", "closed")
    .not("brand_id", "is", null)
    .order("stage_changed_at", { ascending: false })
    .limit(TURN_LIMIT);
  if (error) return { available: false, items: [], timeZone };
  type Row = {
    id: string; title: string; stage: string; outcome: string | null; stage_changed_at: string | null; owner_id: string | null; request_id: string | null; brand_visible: boolean | null;
    contract_confirmed_at: string | null; brand: { name: string } | null; request: { origin: string } | null; deal_team: { user_id: string }[] | null;
    deal_talents: { id: string; status: string; respond_by: string | null; terms_ready: boolean; talent: { display_name: string } | null }[] | null;
  };
  const deals: AgencyDealRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    stage: r.stage,
    outcome: r.outcome,
    stageChangedAt: r.stage_changed_at,
    ownerId: r.owner_id,
    team: (r.deal_team ?? []).map((x) => x.user_id),
    requestId: r.request_id,
    brandName: r.brand?.name ?? "",
    brandVisible: r.brand_visible ?? false,
    origin: r.request?.origin ?? null,
    contractConfirmedAt: r.contract_confirmed_at,
    talents: (r.deal_talents ?? []).map((x) => ({ id: x.id, status: x.status, respondBy: x.respond_by, termsReady: x.terms_ready, name: x.talent?.display_name ?? "" })),
  }));
  const ids = deals.map((d) => d.id);
  const isAdmin = agencyCan(input.role, "admin", input.platformAdmin);
  const viewer = { userId: input.userId, isManager: agencyCan(input.role, "manager", input.platformAdmin), isAdmin, canWork: (own: boolean) => canWorkDeal(input.role, own, input.platformAdmin) };
  const [terms, deliverables, admin] = await Promise.all([
    readTerms(supabase, ids),
    readDeliverables(supabase, ids),
    isAdmin && ids.length > 0
      ? Promise.all([readRounds(supabase, ids), supabase.from("deal_payment_plans").select("deal_id").in("deal_id", ids)]).then(([rounds, plans]): AgencyAdminData => ({ rounds, planDealIds: new Set((plans.data ?? []).map((p) => p.deal_id)) }))
      : Promise.resolve(null),
  ]);
  const rows = { ...terms, deliverables };
  let sources = deals.map((d) => agencySource(d, rows, viewer, admin));
  if (!isAdmin) {
    // gestor/colaborador: confirmar pela RPC do negócio só onde a negociação/condições mudariam a resposta
    const need = deals.map((d, i) => ({ d, i, n: agencyNeedsRefine(d, nextStep(sources[i].flow, sources[i].viewer)) })).filter((x) => x.n.offer || x.n.plan);
    const checked = need.slice(0, REFINE_MAX);
    const skipped = new Set(need.slice(REFINE_MAX).map((x) => x.d.id));
    const refined = await Promise.all(
      checked.map(async ({ d, n }) => {
        const refine: AgencyRefine = {};
        const [offer, plan] = await Promise.all([n.offer ? getDealOffer(d.id) : Promise.resolve(undefined), n.plan ? dealPaymentPlan(d.id) : Promise.resolve(undefined)]);
        if (offer !== undefined) refine.offer = offer && offer.enabled ? { open: offer.open, turn: offer.turn, agreed: offer.agreed, canReply: offer.canReply } : null;
        if (plan !== undefined) refine.plan = plan && plan.enabled ? { hasPlan: plan.hasPlan, canEdit: plan.canEdit } : null;
        return [d.id, agencySource(d, rows, viewer, null, refine)] as const;
      }),
    );
    const byId = new Map(refined);
    sources = sources.filter((s) => !skipped.has(s.dealId)).map((s) => byId.get(s.dealId) ?? s);
  }
  return { available: true, items: buildTurnQueue("agency", sources, { today: localDay(new Date(), timeZone), timeZone }), timeZone };
}

// ---------------------------------------------------------------- marca
const BRAND_OPEN = new Set(["received", "building", "proposal", "contracting", "running"]);
/** As campanhas da marca numa leitura só por requisição (a tela inicial também as lista). */
export const listBrandCampaignsOnce = cache((brandId: string) => listBrandCampaigns(brandId));

export async function brandTurns(input: { brandId: string; role: "owner" | "staff" | null }): Promise<TurnResult> {
  const timeZone = DEFAULT_TZ;
  const list = await listBrandCampaignsOnce(input.brandId);
  if (!list.available) return { available: false, items: [], timeZone };
  const campaigns = list.items
    .filter((c) => c.dealId && BRAND_OPEN.has(c.status))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, TURN_LIMIT)
    .map((c) => ({ requestId: c.requestId, dealId: c.dealId as string, title: c.title, status: c.status, updatedAt: c.updatedAt || null, talentName: c.talentName }));
  const ids = campaigns.map((c) => c.dealId);
  const supabase = await createClient();
  const [terms, deliverables, rounds] = await Promise.all([readTerms(supabase, ids, { party: "brand" }), readDeliverables(supabase, ids), readRounds(supabase, ids)]);
  const rows = { ...terms, deliverables, rounds };
  const viewer = { isOwner: input.role === "owner", canAct: Boolean(input.role) };
  const sources = campaigns.map((c) => brandSource(c, rows, viewer));
  return { available: true, items: buildTurnQueue("brand", sources, { today: localDay(new Date(), timeZone), timeZone }), timeZone };
}

// ---------------------------------------------------------------- Hero
/** As oportunidades do Hero numa leitura só por requisição (a tela inicial também lista as pendentes). */
export const listMyOpportunitiesOnce = cache(() => listOpportunities());

export async function heroTurns(): Promise<TurnResult> {
  const timeZone = DEFAULT_TZ;
  const list = await listMyOpportunitiesOnce();
  if (!list.available) return { available: false, items: [], timeZone };
  const opps = list.items
    .filter((o) => !["won", "lost", "cancelled"].includes(o.deal.status) && !["declined", "removed"].includes(o.status))
    .slice(0, TURN_LIMIT);
  // termos só existem para quem foi confirmado no elenco (RLS: my_talent_contract_deal_ids)
  const contracted = opps.filter((o) => ["proposed", "contracted"].includes(o.status));
  const supabase = await createClient();
  const terms = await readTerms(
    supabase,
    contracted.map((o) => o.deal.id),
    { party: "talent", dealTalentIds: contracted.map((o) => o.id) },
  );
  const sources = opps.map((o) =>
    heroSource(
      { id: o.id, status: o.status, respondBy: o.respondBy, consultedAt: o.consultedAt, deal: { id: o.deal.id, title: o.deal.title, status: o.deal.status }, brandName: o.brand.name, deliverables: o.deliverables },
      terms,
      canCreateForCampaign({ status: o.status, dealStatus: o.deal.status }),
    ),
  );
  return { available: true, items: buildTurnQueue("hero", sources, { today: localDay(new Date(), timeZone), timeZone }), timeZone };
}
