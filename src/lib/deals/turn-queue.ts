// "Sua vez" na tela inicial (pedido do responsável, 05/11: "ficou difícil de achar esse próximo passo… o botão para
// confirmar o passo tem que ir para a tela inicial"). Lógica pura, sem banco: recebe as linhas lidas EM LOTE por portal
// (src/lib/deals/turn-queries.ts), monta o FlowInput de cada negócio com as mesmas regras das três telas e passa pelo
// motor do NextStepCard (next-step.ts). Só entra o que é AÇÃO de quem lê ("Sua vez"), do mais urgente para o menos.
//
// Decisões (sem perguntar ao responsável):
//   • Urgência: prazo vencido primeiro, depois o prazo mais próximo (dia no fuso de quem lê); sem prazo vai por último,
//     o que está parado há mais tempo antes (quem espera há mais tempo é mais urgente). Desempate pelo título.
//   • Ação de um clique na tela inicial só onde o NextStepCard/termos já executam sem formulário: "Confirmar a
//     contratação" (agency_contract_confirm) e "Encerrar como ganha" (mover para fechado/ganho, sem forçar). As duas
//     pedem confirmação curta. O resto leva direto à aba/âncora certa (nextStepHref).
//   • Os adaptadores abaixo espelham o que cada tela monta (ficha do negócio, campanha da marca, oportunidade do Hero),
//     mas com o que a RLS deixa ler direto em lote. O que fica de fora vira null e a regra cai na forma conservadora
//     (ex.: o Hero não lê o aceite da marca → só espera; a marca não lê o elenco → só as esperas mudam de texto).
import { localDay } from "@/lib/today/logic";
import { flowStep, flowTerms, isActiveHero, nextStep, nextStepHref, stageFromBrandStatus, stageFromOpportunity, type FlowDeliverable, type FlowInput, type FlowParty, type FlowStep, type FlowViewer, type NextAction, type NextStep } from "./next-step";
import { isDealStage, stageIndex, type DealOutcome, type DealStage } from "./stages";
import type { DeliverableStatus } from "./vocab";

/** Quantos negócios abertos (mais recentes) entram na conta de cada tela inicial. */
export const TURN_LIMIT = 50;
/** Quantos aparecem antes do "Ver todos". */
export const TURN_PREVIEW = 3;

export type TurnQuick = "confirmContract" | "finishDeal";
const QUICK: Partial<Record<NextAction, TurnQuick>> = { confirmContract: "confirmContract", finishDeal: "finishDeal" };

export type TurnSource = {
  /** chave estável (negócio na agência/marca; oportunidade no Hero) */
  key: string;
  dealId: string;
  requestId?: string | null;
  dealTalentId?: string | null;
  /** nome do negócio/campanha */
  title: string;
  /** a outra ponta: marca (agência e Hero) ou Hero(s) (marca) */
  counterpart: string;
  /** última mudança (etapa/consulta): desempate de quem não tem prazo */
  updatedAt: string | null;
  flow: FlowInput;
  viewer: FlowViewer;
};

export type TurnItem = {
  key: string;
  dealId: string;
  title: string;
  counterpart: string;
  step: Extract<NextStep, { mode: "action" }>;
  flow: FlowStep;
  href: string | null;
  /** dia do prazo (AAAA-MM-DD no fuso de quem lê) */
  day: string | null;
  late: boolean;
  quick: TurnQuick | null;
  updatedAt: string | null;
};

const ts = (v: string | null) => {
  if (!v) return Number.POSITIVE_INFINITY;
  const t = Date.parse(v);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/** Dia do prazo no fuso (data pura fica como está). */
export function deadlineDay(deadline: string | null, timeZone: string): string | null {
  if (!deadline) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline;
  const t = Date.parse(deadline);
  return Number.isNaN(t) ? null : localDay(new Date(t), timeZone);
}

/** Mais urgente primeiro: vencido / prazo mais cedo; sem prazo por último (parado há mais tempo antes). */
export function compareTurn(a: Pick<TurnItem, "day" | "step" | "updatedAt" | "title" | "key">, b: Pick<TurnItem, "day" | "step" | "updatedAt" | "title" | "key">): number {
  if (a.day && b.day) {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    const d = ts(a.step.deadline) - ts(b.step.deadline);
    if (d !== 0 && Number.isFinite(d)) return d;
  } else if (a.day || b.day) return a.day ? -1 : 1;
  const u = ts(a.updatedAt) - ts(b.updatedAt);
  if (u !== 0 && !Number.isNaN(u)) return u;
  return a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
}

/** Passa cada negócio pelo motor e fica só com o que é a vez de quem lê, ordenado por urgência. */
export function buildTurnQueue(party: FlowParty, sources: TurnSource[], opts: { today: string; timeZone: string }): TurnItem[] {
  const items: TurnItem[] = [];
  for (const s of sources) {
    const step = nextStep(s.flow, s.viewer);
    if (step.mode !== "action") continue;
    const day = deadlineDay(step.deadline, opts.timeZone);
    items.push({
      key: s.key,
      dealId: s.dealId,
      title: s.title,
      counterpart: s.counterpart,
      step,
      flow: flowStep(s.flow),
      href: nextStepHref(party, step.target, { dealId: s.dealId, requestId: s.requestId, dealTalentId: s.dealTalentId }),
      day,
      late: day !== null && day < opts.today,
      quick: party === "agency" ? (QUICK[step.code] ?? null) : null,
      updatedAt: s.updatedAt,
    });
  }
  return items.sort(compareTurn);
}

// ---------------------------------------------------------------- linhas lidas em lote → FlowInput
export type TermsRow = { id: string; dealId: string; status: string; validUntil: string | null; version: number };
export type AcceptanceRow = { termsId: string; party: "brand" | "talent"; dealTalentId: string | null };
export type DeliverableRowLite = { id: string; dealId: string; dealTalentId: string; heroName: string; title: string; kind: string; status: DeliverableStatus; dueAt: string | null; publishAt: string | null };
export type OfferRoundRow = { dealId: string; seq: number; side: "agency" | "brand"; action: "accept" | "counter" | "decline" };

const groupBy = <T, K extends string>(rows: T[], key: (r: T) => K | null | undefined) => {
  const map = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
};

/** Termos do negócio no formato de flowTerms (versão mais nova primeiro, com os aceites lidos). */
export function termsFor(dealId: string, terms: TermsRow[], acceptances: AcceptanceRow[]) {
  const accByTerms = groupBy(acceptances, (a) => a.termsId);
  return terms
    .filter((t) => t.dealId === dealId)
    .sort((a, b) => b.version - a.version)
    .map((t) => ({ status: t.status, validUntil: t.validUntil, acceptances: (accByTerms.get(t.id) ?? []).map((a) => ({ party: a.party, dealTalentId: a.dealTalentId })) }));
}

/** Vez da negociação (0106, deal_offer_state): sem rodadas → agência; aceite → acordado; última da agência → marca. */
export function offerState(rounds: OfferRoundRow[]): { turn: "agency" | "brand" | null; agreed: boolean; hasRounds: boolean } {
  const last = [...rounds].sort((a, b) => b.seq - a.seq)[0];
  if (!last) return { turn: "agency", agreed: false, hasRounds: false };
  if (last.action === "accept") return { turn: null, agreed: true, hasRounds: true };
  return { turn: last.side === "agency" ? "brand" : "agency", agreed: false, hasRounds: true };
}

const toFlowDeliverable = (d: DeliverableRowLite): FlowDeliverable => ({ id: d.id, dealTalentId: d.dealTalentId, heroName: d.heroName, title: d.title, kind: d.kind, status: d.status, dueAt: d.dueAt, publishAt: d.publishAt });

// ---- agência
export type AgencyDealRow = {
  id: string;
  title: string;
  stage: string;
  outcome: string | null;
  stageChangedAt: string | null;
  ownerId: string | null;
  team: string[];
  requestId: string | null;
  brandName: string;
  brandVisible: boolean;
  /** origem do pedido (só 'brand' tem negociação 0106) */
  origin: string | null;
  contractConfirmedAt: string | null;
  talents: { id: string; status: string; respondBy: string | null; termsReady: boolean; name: string }[];
};
export type AgencyViewer = { userId: string | null; isManager: boolean; isAdmin: boolean; canWork: (isOwnerOrTeam: boolean) => boolean };
/** O que só o Adm lê em lote (rodadas da negociação e condições de pagamento). Para os demais: undefined (desconhecido). */
export type AgencyAdminData = { rounds: OfferRoundRow[]; planDealIds: Set<string> };
/** Situação lida pela RPC de cada negócio (gestor/colaborador), quando a resposta depende dela. */
export type AgencyRefine = { offer?: { open: boolean; turn: "agency" | "brand" | null; agreed: boolean; canReply: boolean } | null; plan?: { hasPlan: boolean; canEdit: boolean } | null };

export function offerOpen(d: Pick<AgencyDealRow, "stage" | "outcome" | "origin" | "brandVisible">): boolean {
  return isDealStage(d.stage) && d.stage !== "closed" && !d.outcome && stageIndex(d.stage) < 8 && d.origin === "brand" && d.brandVisible;
}

export function agencySource(
  d: AgencyDealRow,
  rows: { terms: TermsRow[]; acceptances: AcceptanceRow[]; deliverables: DeliverableRowLite[] },
  viewer: AgencyViewer,
  admin: AgencyAdminData | null,
  refine: AgencyRefine = {},
): TurnSource {
  const stage: DealStage = isDealStage(d.stage) ? d.stage : "briefing_received";
  const terms = flowTerms(termsFor(d.id, rows.terms, rows.acceptances));
  const isOwner = Boolean(viewer.userId && (d.ownerId === viewer.userId || d.team.includes(viewer.userId)));
  const canEdit = viewer.canWork(isOwner) && stage !== "closed";
  // negociação: o Adm lê as rodadas; os demais só pela RPC (refine) — sem ela, desconhecida (null)
  let offer: FlowInput["offer"] = null;
  let canReplyOffer = false;
  if (refine.offer !== undefined) {
    offer = refine.offer ? { open: refine.offer.open, turn: refine.offer.turn, agreed: refine.offer.agreed } : null;
    canReplyOffer = refine.offer?.canReply ?? false;
  } else if (admin && d.origin === "brand") {
    const open = offerOpen(d);
    const st = offerState(admin.rounds.filter((r) => r.dealId === d.id));
    offer = { open, turn: open ? st.turn : null, agreed: st.agreed };
    canReplyOffer = open && viewer.isAdmin && st.turn === "agency";
  }
  // condições de pagamento (0108): idem
  let planMissing: boolean | null = null;
  let canEditPlan = false;
  if (refine.plan !== undefined) {
    planMissing = refine.plan ? !refine.plan.hasPlan : null;
    canEditPlan = refine.plan?.canEdit ?? false;
  } else if (admin) {
    planMissing = !admin.planDealIds.has(d.id);
    canEditPlan = viewer.isAdmin && stage !== "closed";
  }
  const flow: FlowInput = {
    stage,
    outcome: (d.outcome as DealOutcome | null) ?? null,
    offer,
    planMissing,
    terms,
    heroes: d.talents
      .filter((x) => isActiveHero(x.status))
      .map((x) => ({ dealTalentId: x.id, name: x.name, status: x.status, respondBy: x.respondBy, termsAccepted: terms.acceptedBy(x.id), feeReady: x.termsReady })),
    contractConfirmed: Boolean(d.contractConfirmedAt),
    deliverables: rows.deliverables.filter((x) => x.dealId === d.id).map(toFlowDeliverable),
  };
  return {
    key: d.id,
    dealId: d.id,
    requestId: d.requestId,
    title: d.title,
    counterpart: d.brandName,
    updatedAt: d.stageChangedAt,
    flow,
    viewer: { party: "agency", canEdit, isManager: viewer.isManager, isAdmin: viewer.isAdmin, canReplyOffer, canEditPlan },
  };
}

/**
 * Gestor/colaborador não leem as rodadas nem as condições (só o Adm, RLS). Quando a resposta sem elas é uma ação que
 * elas mudariam, a tela inicial consulta a RPC só daquele negócio: elenco/conversa com a negociação possivelmente
 * aberta (a vez seria "aguardando o Adm"/"a marca") e "Enviar os termos" (sem condições seria "aguardando o Adm").
 */
export function agencyNeedsRefine(d: AgencyDealRow, step: NextStep): { offer: boolean; plan: boolean } {
  if (step.mode !== "action") return { offer: false, plan: false };
  return { offer: offerOpen(d) && (step.code === "buildCast" || step.code === "talkToHero"), plan: step.code === "sendTerms" };
}

// ---- marca
export type BrandCampaignRow = { requestId: string; dealId: string; title: string; status: string; updatedAt: string | null; talentName: string | null };
export function brandSource(c: BrandCampaignRow, rows: { terms: TermsRow[]; acceptances: AcceptanceRow[]; deliverables: DeliverableRowLite[]; rounds: OfferRoundRow[] }, viewer: { isOwner: boolean; canAct: boolean }): TurnSource {
  // a marca não lê a etapa interna: mesma aproximação da campanha (contratação/execução pela situação da marca)
  const fallback = stageFromBrandStatus(c.status);
  const pre = isDealStage(fallback.stage) && fallback.stage !== "closed" && stageIndex(fallback.stage) < 8;
  const rounds = rows.rounds.filter((r) => r.dealId === c.dealId);
  // só há rodadas em pedido da marca com o negócio visível para ela; sem rodadas a vez é da agência (espera)
  const st = offerState(rounds);
  const offer: FlowInput["offer"] = rounds.length > 0 ? { open: pre, turn: pre ? st.turn : null, agreed: st.agreed } : null;
  const flow: FlowInput = {
    stage: fallback.stage,
    outcome: fallback.outcome,
    offer,
    planMissing: null,
    terms: flowTerms(termsFor(c.dealId, rows.terms, rows.acceptances)),
    heroes: [],
    contractConfirmed: false,
    deliverables: rows.deliverables.filter((x) => x.dealId === c.dealId).map(toFlowDeliverable),
  };
  return {
    key: c.dealId,
    dealId: c.dealId,
    requestId: c.requestId,
    title: c.title,
    counterpart: c.talentName ?? "",
    updatedAt: c.updatedAt,
    flow,
    viewer: { party: "brand", isOwner: viewer.isOwner, canAct: viewer.canAct && c.status !== "cancelled" },
  };
}

// ---- Hero
export type HeroOpportunityRow = {
  id: string;
  status: string;
  respondBy: string | null;
  consultedAt: string | null;
  deal: { id: string; title: string; status: string };
  brandName: string;
  deliverables: { id: string; kind: string; title: string; dueAt: string | null; publishAt: string | null; status: string }[];
};
const DELIVERABLE_STATUSES = new Set<string>(["planned", "in_production", "submitted", "changes_requested", "approved", "published", "proof_submitted", "done", "cancelled"]);

export function heroSource(o: HeroOpportunityRow, rows: { terms: TermsRow[]; acceptances: AcceptanceRow[] }, canCreate: boolean): TurnSource {
  const fallback = stageFromOpportunity(o.deal.status);
  // o Hero não lê o aceite da marca (RLS): só o dele conta
  const terms = flowTerms(termsFor(o.deal.id, rows.terms, rows.acceptances), false);
  const flow: FlowInput = {
    stage: fallback.stage,
    outcome: fallback.outcome,
    offer: null,
    planMissing: null,
    terms,
    heroes: [{ dealTalentId: o.id, name: "", status: o.status, respondBy: o.respondBy, termsAccepted: terms.acceptedBy(o.id), feeReady: null }],
    contractConfirmed: false,
    deliverables: o.deliverables
      .filter((d) => DELIVERABLE_STATUSES.has(d.status))
      .map((d) => ({ id: d.id, dealTalentId: o.id, heroName: "", title: d.title, kind: d.kind, status: d.status as DeliverableStatus, dueAt: d.dueAt, publishAt: d.publishAt })),
  };
  return {
    key: o.id,
    dealId: o.deal.id,
    dealTalentId: o.id,
    title: o.deal.title,
    counterpart: o.brandName,
    updatedAt: o.consultedAt,
    flow,
    viewer: { party: "hero", dealTalentId: o.id, status: o.status, canCreate },
  };
}
