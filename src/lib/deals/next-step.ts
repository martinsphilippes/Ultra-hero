// "Próximo passo" da campanha (pedido do responsável, 04/11: "tem que ter como resolver fácil"). Lógica pura, sem
// banco: dado o estado de um negócio com marca (etapa/resultado, negociação 0106, condições de pagamento 0108, termos e
// aceites, contratação, entregas por herói), diz para CADA lado (agência, marca, herói) o que ele faz agora — ou por
// quem ele está esperando. As três telas (ficha do negócio, campanha da marca, oportunidade do herói) usam a mesma
// regra, então ninguém vê "Em criação" de um lado e "Nada pendente" do outro sem explicação.
//
// Decisões (sem perguntar ao responsável):
//   • Ordem do fluxo: proposta (negociação 0106 → elenco e consulta → confirmação pelo Adm) → termos (condições de
//     pagamento → envio → aceite da marca e de cada herói, em paralelo) → contratação (gestor confirma) → produção
//     (herói cria e envia) → aprovação (marca aprova ou pede ajuste) → publicação (herói publica e envia comprovante;
//     agência conclui a entrega) → concluída (gestor encerra como ganho).
//   • A vez de cada lado respeita o papel: proposta e condições só o Adm; termos, contratação e encerramento o gestor+;
//     aceite dos termos só o dono da marca; quem não pode agir vê "aguardando o Adm/gestor/dono".
//   • Negociação aberta com a vez da marca segura a confirmação (confirmar fecha a negociação).
//   • Em produção, a pendência mostrada é a entrega com o prazo mais próximo (sem prazo vai por último); o herói vê só
//     as dele. Comprovante (publicada → comprovada) não tem prazo próprio.
//   • A barra de progresso marca a fase da entrega MAIS atrasada no fluxo (ainda em criação > aprovação > publicação).
//   • Visões parciais: a marca e o herói não leem tudo (ex.: o herói não sabe quem mais aceitou). Campo desconhecido
//     vem como null e a mensagem cai para a forma genérica ("aguardando a agência confirmar a contratação").
import { deliverableDeadline } from "@/lib/today/logic";
import { stageIndex, type DealOutcome, type DealStage } from "./stages";
import type { DeliverableStatus } from "./vocab";

export const FLOW_STEPS = ["proposal", "terms", "contracting", "production", "approval", "publication", "done"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
export type FlowParty = "agency" | "brand" | "hero";
/** Onde a ação acontece (cada portal traduz para a aba/âncora certa em nextStepHref). */
export type FlowTarget = "offer" | "talents" | "confirm" | "plan" | "terms" | "respond" | "create" | "deliverables" | "stage" | "report";

export type FlowHero = {
  dealTalentId: string;
  name: string;
  status: string;
  respondBy: string | null;
  /** aceitou a versão viva dos termos; null = quem lê não sabe */
  termsAccepted: boolean | null;
  /** cachê definido (Adm); null = quem lê não sabe */
  feeReady: boolean | null;
};
export type FlowDeliverable = { id: string; dealTalentId: string; heroName: string; title: string; kind: string; status: DeliverableStatus; dueAt: string | null; publishAt: string | null };
export type FlowTermsStatus = "none" | "draft" | "sent" | "accepted";
export type FlowInput = {
  stage: DealStage;
  outcome: DealOutcome | null;
  /** negociação da proposta da marca (0106); null = sem negociação ou quem lê não vê */
  offer: { open: boolean; turn: "agency" | "brand" | null; agreed: boolean } | null;
  /** faltam as condições de pagamento (0108) para enviar os termos; null = não se aplica/não se sabe */
  planMissing: boolean | null;
  terms: { status: FlowTermsStatus; brandAccepted: boolean | null; validUntil: string | null };
  /** elenco ativo (sem recusados/removidos/sugeridos não consultados) */
  heroes: FlowHero[];
  contractConfirmed: boolean;
  /** entregas visíveis a quem lê (todas, inclusive canceladas) */
  deliverables: FlowDeliverable[];
};
export type FlowViewer =
  | { party: "agency"; canEdit: boolean; isManager: boolean; isAdmin: boolean; canReplyOffer: boolean; canEditPlan: boolean }
  | { party: "brand"; isOwner: boolean; canAct: boolean }
  | { party: "hero"; dealTalentId: string; status: string; canCreate: boolean };

export const NEXT_ACTIONS = [
  "answerOffer",
  "answerCounter",
  "buildCast",
  "talkToHero",
  "setFees",
  "confirmDeal",
  "setPlan",
  "sendTerms",
  "confirmContract",
  "planDeliverables",
  "closeDeliverable",
  "finishDeal",
  "acceptTerms",
  "respondInvite",
  "createDeliverable",
  "fixDeliverable",
  "publishDeliverable",
  "proofDeliverable",
  "approveDeliverable",
] as const;
export const NEXT_WAITS = [
  "waitAgencyOffer",
  "waitBrandOffer",
  "waitAdminOffer",
  "waitOwnerCounter",
  "waitAgencyProposal",
  "waitHeroesAnswer",
  "waitTeamCast",
  "waitAdminConfirm",
  "waitAdminPlan",
  "waitTerms",
  "waitManagerTerms",
  "waitOwnerTerms",
  "waitAcceptances",
  "waitBrandTerms",
  "waitHeroTerms",
  "waitContract",
  "waitManagerContract",
  "waitDeliverablesPlan",
  "waitHeroDeliverable",
  "waitHeroPublish",
  "waitHeroProof",
  "waitBrandApproval",
  "waitAgencyClose",
  "waitAgencyFinish",
  "waitManagerFinish",
  "waitProposalHero",
  "waitHeroTalk",
] as const;
export const NEXT_DONE = ["won", "closed", "declined"] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];
export type NextWait = (typeof NEXT_WAITS)[number];
export type NextDone = (typeof NEXT_DONE)[number];

export type NextParams = { hero?: string; item?: string; kind?: string; names?: string[]; brand?: boolean; count?: number };
export type NextStep =
  | { mode: "action"; code: NextAction; target: FlowTarget; deadline: string | null; params: NextParams }
  | { mode: "waiting"; code: NextWait; target: null; deadline: string | null; params: NextParams }
  | { mode: "done"; code: NextDone; target: FlowTarget | null; deadline: null; params: NextParams };

const act = (code: NextAction, target: FlowTarget, deadline: string | null = null, params: NextParams = {}): NextStep => ({ mode: "action", code, target, deadline, params });
const wait = (code: NextWait, deadline: string | null = null, params: NextParams = {}): NextStep => ({ mode: "waiting", code, target: null, deadline, params });
const done = (code: NextDone, target: FlowTarget | null = null): NextStep => ({ mode: "done", code, target, deadline: null, params: {} });

const OPEN_DONE = new Set<DeliverableStatus>(["done", "cancelled"]);
/** Vez do herói: criar/ajustar, publicar, comprovar. */
const HERO_TURN = new Set<DeliverableStatus>(["planned", "in_production", "changes_requested", "approved", "published"]);
const CREATING = new Set<DeliverableStatus>(["planned", "in_production", "changes_requested"]);
const PUBLISHING = new Set<DeliverableStatus>(["approved", "published", "proof_submitted"]);
const ROSTER = new Set(["proposed", "contracted"]);

export const isOpenDeliverable = (d: Pick<FlowDeliverable, "status">) => !OPEN_DONE.has(d.status);

/** Prazo da pendência: criar → entrega; aprovado → publicação; comprovante e conclusão não têm prazo próprio. */
export function pendingDeadline(d: Pick<FlowDeliverable, "status" | "dueAt" | "publishAt">): string | null {
  if (d.status === "published" || d.status === "proof_submitted") return null;
  return deliverableDeadline(d);
}

const RANK: Partial<Record<DeliverableStatus, number>> = { changes_requested: 0, in_production: 1, planned: 1, submitted: 2, approved: 3, published: 4, proof_submitted: 5 };
const at = (v: string | null) => {
  if (!v) return Number.POSITIVE_INFINITY;
  const t = Date.parse(v);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};
/** Mais urgente primeiro: prazo mais cedo (sem prazo por último), depois a fase mais atrasada, depois o título. */
export function byUrgency(a: FlowDeliverable, b: FlowDeliverable): number {
  return at(pendingDeadline(a)) - at(pendingDeadline(b)) || (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

const inProduction = (x: FlowInput) => x.contractConfirmed || (x.stage !== "closed" && stageIndex(x.stage) >= 10);
const preConfirmation = (x: FlowInput) => x.stage !== "closed" && stageIndex(x.stage) < 8;
const item = (d: FlowDeliverable): NextParams => ({ hero: d.heroName, item: d.title, kind: d.kind });

/** Fase atual da campanha para a barra de progresso. */
export function flowStep(x: FlowInput): FlowStep {
  if (x.stage === "closed") return "done";
  if (preConfirmation(x)) return "proposal";
  if (!inProduction(x)) {
    const pending = x.terms.status !== "sent" || x.terms.brandAccepted === false || x.heroes.some((h) => ROSTER.has(h.status) && h.termsAccepted === false);
    return pending ? "terms" : "contracting";
  }
  const open = x.deliverables.filter(isOpenDeliverable);
  if (open.some((d) => CREATING.has(d.status))) return "production";
  if (open.some((d) => d.status === "submitted")) return "approval";
  if (open.some((d) => PUBLISHING.has(d.status))) return "publication";
  return open.length === 0 && x.deliverables.some((d) => d.status !== "cancelled") ? "done" : "production";
}

/** Espera por uma entrega (de quem é a vez dela). */
function waitFor(d: FlowDeliverable): NextStep {
  const deadline = pendingDeadline(d);
  if (CREATING.has(d.status)) return wait("waitHeroDeliverable", deadline, item(d));
  if (d.status === "submitted") return wait("waitBrandApproval", deadline, item(d));
  if (d.status === "approved") return wait("waitHeroPublish", deadline, item(d));
  if (d.status === "published") return wait("waitHeroProof", null, item(d));
  return wait("waitAgencyClose", null, item(d));
}

function proposalStep(x: FlowInput, v: FlowViewer): NextStep {
  const offerOpen = x.offer && x.offer.open && !x.offer.agreed ? x.offer.turn : null;
  if (v.party === "hero") {
    if (v.status === "consulted") {
      const me = x.heroes.find((h) => h.dealTalentId === v.dealTalentId);
      return act("respondInvite", "respond", me?.respondBy ?? null);
    }
    if (v.status === "talk_requested") return wait("waitHeroTalk");
    return wait("waitProposalHero");
  }
  if (v.party === "brand") {
    if (offerOpen === "brand") return v.isOwner ? act("answerCounter", "offer") : wait("waitOwnerCounter");
    if (offerOpen === "agency") return wait("waitAgencyOffer");
    return wait("waitAgencyProposal");
  }
  if (offerOpen === "agency") return v.canReplyOffer ? act("answerOffer", "offer") : wait("waitAdminOffer");
  if (offerOpen === "brand") return wait("waitBrandOffer");
  const talk = x.heroes.find((h) => h.status === "talk_requested");
  if (talk) return v.canEdit ? act("talkToHero", "talents", null, { hero: talk.name }) : wait("waitTeamCast");
  const ready = x.heroes.filter((h) => h.status === "interested" || h.status === "proposed");
  if (ready.length > 0) {
    const noFee = ready.filter((h) => h.feeReady === false);
    if (noFee.length > 0) return v.isAdmin && v.canEdit ? act("setFees", "talents", null, { names: noFee.map((h) => h.name), count: noFee.length }) : wait("waitAdminConfirm");
    return v.isAdmin && v.canEdit ? act("confirmDeal", "confirm", null, { count: ready.length }) : wait("waitAdminConfirm");
  }
  const consulted = x.heroes.filter((h) => h.status === "consulted");
  if (consulted.length > 0) {
    const first = consulted.map((h) => h.respondBy).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
    return wait("waitHeroesAnswer", first, { count: consulted.length, names: consulted.map((h) => h.name) });
  }
  return v.canEdit ? act("buildCast", "talents") : wait("waitTeamCast");
}

function termsStep(x: FlowInput, v: FlowViewer): NextStep {
  const roster = x.heroes.filter((h) => ROSTER.has(h.status));
  const unsent = x.terms.status === "none" || x.terms.status === "draft";
  if (v.party === "agency") {
    if (unsent) {
      if (x.planMissing === true) return v.canEditPlan ? act("setPlan", "plan") : wait("waitAdminPlan");
      return v.isManager && v.canEdit ? act("sendTerms", "terms") : wait("waitManagerTerms");
    }
    const heroes = roster.filter((h) => h.termsAccepted === false).map((h) => h.name);
    const brand = x.terms.brandAccepted === false;
    if (brand || heroes.length > 0) return wait("waitAcceptances", x.terms.validUntil, { names: heroes, brand, count: heroes.length + (brand ? 1 : 0) });
    return v.isManager && v.canEdit ? act("confirmContract", "terms") : wait("waitManagerContract");
  }
  if (unsent) return wait("waitTerms");
  if (v.party === "brand") {
    if (x.terms.brandAccepted === false) return v.isOwner ? act("acceptTerms", "terms", x.terms.validUntil) : wait("waitOwnerTerms", x.terms.validUntil);
    const heroes = roster.filter((h) => h.termsAccepted === false).map((h) => h.name);
    return heroes.length > 0 ? wait("waitHeroTerms", x.terms.validUntil, { names: heroes, count: heroes.length }) : wait("waitContract");
  }
  const me = x.heroes.find((h) => h.dealTalentId === v.dealTalentId);
  if (me && me.termsAccepted === false) return act("acceptTerms", "terms", x.terms.validUntil);
  return x.terms.brandAccepted === false ? wait("waitBrandTerms", x.terms.validUntil) : wait("waitContract");
}

function productionStep(x: FlowInput, v: FlowViewer): NextStep {
  const live = x.deliverables.filter((d) => d.status !== "cancelled");
  if (v.party === "hero") {
    const mine = live.filter((d) => d.dealTalentId === v.dealTalentId);
    if (mine.length === 0) return wait("waitDeliverablesPlan");
    const open = mine.filter(isOpenDeliverable).sort(byUrgency);
    const next = open.find((d) => HERO_TURN.has(d.status));
    if (next) {
      const deadline = pendingDeadline(next);
      if (next.status === "changes_requested") return act("fixDeliverable", "deliverables", deadline, item(next));
      if (next.status === "approved") return act("publishDeliverable", "deliverables", deadline, item(next));
      if (next.status === "published") return act("proofDeliverable", "deliverables", null, item(next));
      return act("createDeliverable", v.canCreate ? "create" : "deliverables", deadline, item(next));
    }
    if (open[0]) return waitFor(open[0]);
    return wait("waitAgencyFinish");
  }
  if (live.length === 0) return v.party === "agency" && v.canEdit ? act("planDeliverables", "deliverables") : wait("waitDeliverablesPlan");
  const open = live.filter(isOpenDeliverable).sort(byUrgency);
  if (v.party === "brand") {
    const toApprove = open.find((d) => d.status === "submitted");
    if (toApprove) return v.canAct ? act("approveDeliverable", "deliverables", pendingDeadline(toApprove), item(toApprove)) : waitFor(toApprove);
    return open[0] ? waitFor(open[0]) : wait("waitAgencyFinish");
  }
  const toClose = open.find((d) => d.status === "proof_submitted");
  if (toClose && v.canEdit) return act("closeDeliverable", "deliverables", null, item(toClose));
  if (open[0]) return waitFor(open[0]);
  return v.isManager ? act("finishDeal", "stage") : wait("waitManagerFinish");
}

/** O que este lado faz agora (ou por quem espera). */
export function nextStep(x: FlowInput, v: FlowViewer): NextStep {
  if (x.stage === "closed") return x.outcome === "won" ? done("won", v.party === "brand" ? "report" : null) : done("closed");
  if (v.party === "hero" && (v.status === "declined" || v.status === "removed")) return done("declined");
  if (preConfirmation(x)) return proposalStep(x, v);
  if (!inProduction(x)) return termsStep(x, v);
  return productionStep(x, v);
}

/** O que falta para encerrar como ganho sem atropelar ninguém (aviso do MoveForm e da RPC 0109). */
export type CloseWonPending = { termsPending: boolean; contractPending: boolean; deliverables: FlowDeliverable[] };
export function closeWonPending(x: FlowInput): CloseWonPending {
  const termsPending = x.terms.status !== "accepted" && !x.contractConfirmed;
  return { termsPending, contractPending: !inProduction(x), deliverables: x.deliverables.filter(isOpenDeliverable).sort(byUrgency) };
}
export const hasCloseWonPending = (p: CloseWonPending) => p.termsPending || p.contractPending || p.deliverables.length > 0;

/** Link da ação no portal de quem lê (abas da agência; âncoras da campanha e da oportunidade). */
export function nextStepHref(party: FlowParty, target: FlowTarget | null, ids: { dealId: string; requestId?: string | null; dealTalentId?: string | null }): string | null {
  if (!target) return null;
  if (party === "agency") {
    const base = `/agencia/negocios/${ids.dealId}`;
    const map: Partial<Record<FlowTarget, string>> = {
      offer: `${base}#deal-offer`,
      talents: `${base}/herois`,
      confirm: `${base}#deal-confirm`,
      plan: `${base}#payment-plan`,
      terms: `${base}/termos`,
      deliverables: `${base}/entregas`,
      stage: `${base}#deal-stage`,
    };
    return map[target] ?? null;
  }
  if (party === "brand") {
    if (!ids.requestId) return null;
    const base = `/marca/campanhas/${ids.requestId}`;
    const map: Partial<Record<FlowTarget, string>> = { offer: `${base}#deal-offer`, plan: `${base}#payment-plan`, terms: `${base}#camp-terms`, deliverables: `${base}#camp-deliverables`, report: `${base}/relatorio` };
    return map[target] ?? null;
  }
  if (!ids.dealTalentId) return null;
  const base = `/heroi/oportunidades/${ids.dealTalentId}`;
  const map: Partial<Record<FlowTarget, string>> = { respond: `${base}#opp-respond`, terms: `${base}#opp-terms`, create: `${base}#campaign-create`, deliverables: `${base}#entregas` };
  return map[target] ?? null;
}

// ---------------------------------------------------------------- adaptadores (dados de cada portal → FlowInput)
type TermsLike = { status: string; validUntil: string | null; acceptances: { party: "brand" | "talent"; dealTalentId: string | null }[] };
type DelivLike = { id: string; dealTalentId: string; talentName: string; title: string; kind: string; status: DeliverableStatus; dueAt: string | null; publishAt: string | null };

/** Versão viva dos termos (enviada/aceita), senão o rascunho. */
export function flowTerms(terms: TermsLike[] | null | undefined, canSeeBrand = true): FlowInput["terms"] & { acceptedBy: (dealTalentId: string) => boolean | null } {
  const list = terms ?? [];
  const live = list.find((t) => t.status === "sent" || t.status === "accepted") ?? null;
  if (!live) return { status: list.some((t) => t.status === "draft") ? "draft" : "none", brandAccepted: null, validUntil: null, acceptedBy: () => null };
  return {
    status: live.status === "accepted" ? "accepted" : "sent",
    brandAccepted: live.status === "accepted" ? true : canSeeBrand ? live.acceptances.some((a) => a.party === "brand") : null,
    validUntil: live.validUntil,
    acceptedBy: (id) => live.status === "accepted" || live.acceptances.some((a) => a.party === "talent" && a.dealTalentId === id),
  };
}

export function flowDeliverables(list: DelivLike[] | null | undefined): FlowDeliverable[] {
  return (list ?? []).map((d) => ({ id: d.id, dealTalentId: d.dealTalentId, heroName: d.talentName, title: d.title, kind: d.kind, status: d.status, dueAt: d.dueAt, publishAt: d.publishAt }));
}

const ACTIVE_HERO = new Set(["consulted", "interested", "talk_requested", "proposed", "contracted"]);
export const isActiveHero = (status: string) => ACTIVE_HERO.has(status);

/** Etapa aproximada para quem não lê a etapa (marca antes da execução; herói antes da contratação). */
export function stageFromBrandStatus(status: string): { stage: DealStage; outcome: DealOutcome | null } {
  if (status === "done") return { stage: "closed", outcome: "won" };
  if (status === "cancelled") return { stage: "closed", outcome: "cancelled" };
  if (status === "contracting") return { stage: "contracting", outcome: null };
  if (status === "running") return { stage: "production", outcome: null };
  return { stage: "negotiation", outcome: null };
}
export function stageFromOpportunity(status: string): { stage: DealStage; outcome: DealOutcome | null } {
  if (status === "won") return { stage: "closed", outcome: "won" };
  if (status === "lost" || status === "cancelled") return { stage: "closed", outcome: status };
  if (status === "running") return { stage: "production", outcome: null };
  if (status === "confirmed") return { stage: "approved", outcome: null };
  return { stage: "consultation", outcome: null };
}
