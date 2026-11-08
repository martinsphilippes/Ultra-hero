import { z } from "zod";
import { VALUE_MODELS, type ValueModel } from "@/lib/value-model/model";
import { PERF_KINDS, parseCompensation, type Compensation, type PerfKind } from "@/lib/compensation/model";
import { compensationDbSchema } from "@/lib/compensation/schema";
import { requestDeliverablesSchema, toZonedIso, type RequestDeliverable } from "@/lib/deals/schemas";
import { DELIVERABLE_KINDS, OBJECTIVES, type Objective } from "@/lib/deals/vocab";
import {
  PROPOSAL_STATUSES,
  publicFromDb,
  publicSchema,
  type ProposalBadge,
  type ProposalStatus,
  type ReplyAction,
  type Side,
  type SponsorshipPublic,
} from "@/lib/sponsorship/negotiation";
import { NETWORKS, type Network } from "@/lib/talent/vocab";

// Chamada da marca (0089): a marca publica a necessidade, as agências mandam propostas negociadas em rodadas (o
// mesmo motor da 0088 com a direção invertida). Lógica pura testada em tests/unit/chamada-marca.test.ts; o banco
// confere tudo de novo (checks e RPCs). Aqui ficam o formulário, as entregas somadas, o alcance somado, a verba
// como a agência vê, quem pode o quê e a leitura das RPCs fechadas.
// 0140: forma de pagamento (valor, permuta e/ou performance) na chamada, na proposta, no acordo e em cada rodada; sem
// dinheiro não há verba nem valor (o acordo pode ser só permuta/performance). Números só para a marca e o Adm.

export const CALL_STATUSES = ["draft", "open", "closed", "contracted", "cancelled"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export const CALL_AUDIENCES = ["my_agencies", "selected", "all"] as const;
export type CallAudience = (typeof CALL_AUDIENCES)[number];
export const BUDGET_DISPLAYS = ["exact", "up_to", "open"] as const;
export type BudgetDisplay = (typeof BUDGET_DISPLAYS)[number];
/** Como a agência vê: aberta, prazo encerrado, venceu, não foi escolhida, encerrada, cancelada. */
export const AGENCY_VIEW_STATUSES = ["open", "expired", "won", "lost", "closed", "cancelled"] as const;
export type AgencyViewStatus = (typeof AGENCY_VIEW_STATUSES)[number];
export const CALL_DECISIONS = ["contract", "close", "cancel"] as const;
export type CallDecision = (typeof CALL_DECISIONS)[number];
export const CALL_APPROVALS = ["none", "pending", "returned"] as const;
export type CallApproval = (typeof CALL_APPROVALS)[number];
export const CALL_ROUND_ACTIONS = ["propose", "counter", "accept", "decline"] as const;
export type CallRoundAction = (typeof CALL_ROUND_ACTIONS)[number];

export const MAX_NICHES = 10;
export const MAX_CREATORS_WANTED = 50;
export const MAX_PROPOSAL_TALENTS = 50;
export const MAX_DELIVERABLE_ITEMS = 30;
/** A marca não tem fuso próprio: o prazo é no horário de Brasília (o mesmo que o banco usa para o fim do período). */
export const CALL_TIMEZONE = "America/Sao_Paulo";

// ---------------------------------------------------------------- nichos
/** Nichos digitados separados por vírgula ou linha → lista limpa (sem repetir, 2 a 40 letras, até 10). */
export function parseNiches(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[,\n;]/)) {
    const item = raw.replace(/\s+/g, " ").trim();
    if (item.length < 2 || item.length > 40 || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
    if (out.length >= MAX_NICHES) break;
  }
  return out;
}

// ---------------------------------------------------------------- entregas
/** Soma as entregas por tipo + rede (ordem da primeira aparição; até 100 por item, até 30 itens), como o banco. */
export function sumDeliverables(list: readonly RequestDeliverable[]): RequestDeliverable[] {
  const order: string[] = [];
  const map = new Map<string, RequestDeliverable>();
  for (const d of list) {
    const key = `${d.kind}|${d.network ?? ""}`;
    const cur = map.get(key);
    if (cur) cur.quantity = Math.min(100, cur.quantity + d.quantity);
    else {
      order.push(key);
      map.set(key, { kind: d.kind, quantity: Math.min(100, d.quantity), network: d.network ?? null });
    }
  }
  return order.slice(0, MAX_DELIVERABLE_ITEMS).map((k) => map.get(k) as RequestDeliverable);
}

/** Quantas peças no total (2 Reels + 5 stories = 7). */
export function deliverablesCount(list: readonly RequestDeliverable[]): number {
  return list.reduce((acc, d) => acc + d.quantity, 0);
}

// ---------------------------------------------------------------- creators e alcance
export type CardNetwork = { network: string; handle: string; followers: number | null };
export type CallTalentCard = { id: string; name: string; photoUrl: string | null; networks: CardNetwork[]; consentMissing: boolean };

/** Alcance somado: seguidores declarados nas redes que o media kit libera (rede sem número não conta). null sem nenhum. */
export function sumReach(cards: readonly Pick<CallTalentCard, "networks">[]): number | null {
  let total = 0;
  let any = false;
  for (const c of cards) {
    for (const n of c.networks) {
      if (typeof n.followers === "number" && Number.isFinite(n.followers) && n.followers > 0) {
        total += n.followers;
        any = true;
      }
    }
  }
  return any ? total : null;
}

/** Link do media kit: vazio ou https (o banco confere de novo). */
export function mediaKitUrlValid(url: string): boolean {
  const u = url.trim();
  return u === "" || (u.length <= 500 && /^https:\/\/[^\s<>"]{3,}$/.test(u));
}

/** O creator usa alguma rede da chamada? (a tela do escritório marca "combina com você") */
export function networksMatch(callNetworks: readonly string[], myNetworks: readonly string[]): boolean {
  return callNetworks.some((n) => myNetworks.includes(n));
}

// ---------------------------------------------------------------- verba
export type BudgetView = { kind: "exact" | "up_to"; cents: number } | { kind: "open" } | { kind: "hidden" };

/**
 * Verba como cada um vê: a marca sempre no próprio valor; a agência só se for Adm e só na forma escolhida pela marca
 * ("a combinar" nunca mostra valor); gestor e creator: "visível só ao Adm" quando há valor, senão "a combinar".
 */
export function budgetView(display: BudgetDisplay, cents: number | null, canValues: boolean): BudgetView {
  if (display === "open") return { kind: "open" };
  if (!canValues || cents === null) return { kind: "hidden" };
  return { kind: display, cents };
}

// ---------------------------------------------------------------- formulário da marca
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const callFormSchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(3).max(120),
  objective: z.union([z.literal(""), z.enum(OBJECTIVES)]),
  description: z.string().trim().max(2000),
  startsOn: isoDate,
  endsOn: z.union([z.literal(""), isoDate]),
  location: z.string().trim().max(200),
  public: publicSchema,
  deliverables: requestDeliverablesSchema,
  creatorsWanted: z.number().int().min(1).max(MAX_CREATORS_WANTED),
  niches: z.array(z.string().trim().min(2).max(40)).max(MAX_NICHES),
  networks: z.array(z.enum(NETWORKS)).max(NETWORKS.length),
  budgetCents: z.number().int().min(1).max(10_000_000_000).nullable(),
  budgetDisplay: z.enum(BUDGET_DISPLAYS),
  /** 0096: fixo = verba total; por_heroi = verba por Hero + máximo de Heros (limita o investimento). */
  valueModel: z.enum(VALUE_MODELS),
  maxHeroes: z.number().int().min(1).max(50).nullable(),
  respondDate: z.union([z.literal(""), isoDate]),
  respondTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
  audience: z.enum(CALL_AUDIENCES),
  agencyIds: z.array(z.uuid()).max(200),
  /** 0101: chamada aberta a partir de um evento da agenda (vínculo gravado no rascunho, antes de publicar). */
  calendarEventId: z.union([z.literal(""), z.uuid()]).optional(),
  /** 0140: forma de pagamento (valor, permuta e/ou performance) no formato do banco; ausente = o banco mantém a atual. */
  compensation: compensationDbSchema.optional(),
});
export type CallFormInput = z.infer<typeof callFormSchema>;

/** Tem dinheiro? Sem a forma de pagamento (formato antigo) é "só valor", como tudo que já existia. */
export function hasMoney(v: { compensation?: { money: boolean } | null }): boolean {
  return v.compensation?.money ?? true;
}

export type CallFormError = "title" | "period" | "budget" | "maxHeroes" | "respond" | "respondAfterPeriod" | "deliverables" | "networks" | "agencies";

/** Fim do período (exclusivo): meia-noite do dia seguinte ao último dia, horário de Brasília (igual ao banco). */
export function periodEndIso(endsOn: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return null;
  const [y, m, d] = endsOn.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const day = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const iso = toZonedIso(day, "00:00", CALL_TIMEZONE);
  return iso ? new Date(iso).toISOString() : null;
}

/** Prazo para propostas em ISO (horário de Brasília); null se vazio/ inválido. */
export function respondByIso(date: string, time: string): string | null {
  if (!date) return null;
  const iso = toZonedIso(date, time || "18:00", CALL_TIMEZONE);
  return iso ? new Date(iso).toISOString() : null;
}

/**
 * Confere o formulário. forPublish = o que o banco exige para publicar (prazo no futuro e dentro do período, entregas,
 * redes, agências escolhidas). O rascunho só precisa de título, período e verba coerente.
 * 0140: sem dinheiro (só permuta e/ou performance) não há verba nem modelo de valor a conferir.
 */
export function validateCall(v: CallFormInput, forPublish: boolean, now: Date = new Date()): CallFormError | null {
  if (v.title.trim().length < 3) return "title";
  const end = v.endsOn || v.startsOn;
  if (!v.startsOn || end < v.startsOn) return "period";
  if (hasMoney(v)) {
    if (v.budgetDisplay !== "open" && v.budgetCents === null) return "budget";
    if (v.valueModel === "por_heroi") {
      if (v.budgetCents === null || v.budgetCents < 1 || v.budgetDisplay === "open") return "budget";
      if (v.maxHeroes === null) return "maxHeroes";
    }
  }
  if (!forPublish) return null;
  if (v.deliverables.length === 0) return "deliverables";
  if (v.networks.length === 0) return "networks";
  if (v.audience === "selected" && v.agencyIds.length === 0) return "agencies";
  const respond = respondByIso(v.respondDate, v.respondTime);
  if (!respond || Date.parse(respond) <= now.getTime()) return "respond";
  const limit = periodEndIso(end);
  if (limit && Date.parse(respond) > Date.parse(limit)) return "respondAfterPeriod";
  return null;
}

/** p_data de brand_call_save (snake_case). Sem dinheiro: sem verba, "a combinar", fixo e sem máximo (o banco força o mesmo). */
export function callToDb(v: CallFormInput): Record<string, unknown> {
  const money = hasMoney(v);
  return {
    title: v.title.replace(/\s+/g, " ").trim(),
    objective: v.objective,
    description: v.description.trim(),
    starts_on: v.startsOn,
    ends_on: v.endsOn || v.startsOn,
    location: v.location.trim(),
    target_audience: v.public.targetAudience.trim(),
    target_age_bands: v.public.targetAgeBands,
    target_states: v.public.targetStates,
    region_note: v.public.regionNote.trim(),
    deliverables: v.deliverables.map((d) => (d.network ? { kind: d.kind, quantity: d.quantity, network: d.network } : { kind: d.kind, quantity: d.quantity })),
    creators_wanted: v.creatorsWanted,
    niches: v.niches,
    networks: v.networks,
    budget_cents: money ? v.budgetCents : null,
    budget_display: money ? v.budgetDisplay : "open",
    value_model: money ? v.valueModel : "fixo",
    max_heroes: money && v.valueModel === "por_heroi" ? v.maxHeroes : null,
    respond_by: respondByIso(v.respondDate, v.respondTime),
    audience: v.audience,
    agency_ids: v.audience === "selected" ? v.agencyIds : [],
    ...(v.compensation ? { compensation: v.compensation } : {}),
  };
}

/** Contraproposta: pelo menos uma entrega; valor só quando há dinheiro; por Hero pede o máximo (também só com dinheiro). */
export function counterTermsOk(d: { money: boolean; amountCents: number | null; deliverables: readonly unknown[]; valueModel?: ValueModel | null; maxHeroes?: number | null }): boolean {
  if (d.deliverables.length === 0) return false;
  if (!d.money) return true;
  if (d.amountCents === null) return false;
  return d.valueModel !== "por_heroi" || (d.maxHeroes ?? null) !== null;
}

// ---------------------------------------------------------------- quem pode o quê
export type CallProposalState = { status: ProposalStatus; awaiting: Side | null; pendingOwner: boolean };

/** Ações da marca numa proposta (dono ou equipe; aceitar e contrapropor da equipe vão para o dono). */
export function brandCallActions(p: CallProposalState, decided: boolean, hasRole: boolean): ReplyAction[] {
  if (!hasRole || decided || p.status !== "open" || p.awaiting !== "brand" || p.pendingOwner) return [];
  return ["accept", "counter", "decline"];
}

/** Ações da agência: só o Adm, na vez dela, antes da decisão. */
export function agencyCallActions(p: Pick<CallProposalState, "status" | "awaiting">, decided: boolean, canValues: boolean): ReplyAction[] {
  if (!canValues || decided || p.status !== "open" || p.awaiting !== "agency") return [];
  return ["accept", "counter", "decline"];
}

/** A proposta pode ser escolhida como vencedora? (já acordada, ou aberta na vez da marca sem rodada esperando o dono) */
export function canPickWinner(p: CallProposalState): boolean {
  return p.status === "agreed" || (p.status === "open" && p.awaiting === "brand" && !p.pendingOwner);
}

/** Selo da proposta (os mesmos selos da negociação do patrocínio). */
export function callProposalBadge(p: CallProposalState): ProposalBadge {
  if (p.status === "draft" || p.pendingOwner) return "waitingOwner";
  if (p.status === "open") return p.awaiting === "agency" ? "waitingAgency" : "waitingBrand";
  if (p.status === "agreed") return "agreed";
  if (p.status === "declined") return "declined";
  return "closed";
}

/** O que a marca pode fazer com a chamada como um todo. */
export function callBrandControls(c: { status: CallStatus; approval: CallApproval; decidedAt: string | null }, role: "owner" | "staff" | null) {
  const draft = c.status === "draft";
  const decidable = c.decidedAt === null && (c.status === "open" || c.status === "closed");
  return {
    edit: draft && role !== null && (role === "owner" || c.approval !== "pending"),
    submit: draft && role !== null && c.approval !== "pending",
    review: draft && role === "owner" && c.approval === "pending",
    withdraw: draft && role !== null && c.approval === "pending",
    decide: decidable && role === "owner",
    cancel: role === "owner" && c.decidedAt === null && (draft || decidable),
  };
}

// ---------------------------------------------------------------- comparação lado a lado
export type ProposalTerms = { model: ValueModel; amountCents: number | null; maxHeroes: number | null; compensation: Compensation };

/**
 * O que vale numa proposta: o acordo congela modelo, valor, máximo e forma de pagamento (0096/0140). Sem dinheiro (só
 * permuta e/ou performance) não há valor: fica fora de "menor valor", da diferença para a verba e do custo por mil.
 */
export function proposalTerms(
  p: Pick<CallProposal, "status" | "valueModel" | "amountCents" | "maxHeroes" | "compensation" | "agreedValueModel" | "agreedCents" | "agreedMaxHeroes" | "agreedCompensation">,
): ProposalTerms {
  const agreed = p.status === "agreed";
  const compensation = (agreed ? p.agreedCompensation : null) ?? p.compensation;
  if (!compensation.money) return { model: "fixo", amountCents: null, maxHeroes: null, compensation };
  return agreed && p.agreedValueModel
    ? { model: p.agreedValueModel, amountCents: p.agreedCents, maxHeroes: p.agreedMaxHeroes, compensation }
    : { model: p.valueModel, amountCents: p.amountCents, maxHeroes: p.maxHeroes, compensation };
}

export type CompareInput = { id: string; amountCents: number | null; reach: number | null; creators: number; pieces: number; deliverBy: string | null };
export type CompareFlags = { cheapest: boolean; widestReach: boolean; mostPieces: boolean; costPerThousand: number | null };

/** Destaques da comparação: menor valor, maior alcance, mais peças e custo por mil seguidores (centavos). */
export function compareFlags(list: readonly CompareInput[]): Record<string, CompareFlags> {
  const amounts = list.map((p) => p.amountCents).filter((x): x is number => x !== null);
  const reaches = list.map((p) => p.reach).filter((x): x is number => x !== null);
  const minAmount = amounts.length > 1 ? Math.min(...amounts) : null;
  const maxReach = reaches.length > 1 ? Math.max(...reaches) : null;
  const maxPieces = list.length > 1 ? Math.max(...list.map((p) => p.pieces)) : null;
  const out: Record<string, CompareFlags> = {};
  for (const p of list) {
    out[p.id] = {
      cheapest: minAmount !== null && p.amountCents === minAmount,
      widestReach: maxReach !== null && p.reach === maxReach,
      mostPieces: maxPieces !== null && p.pieces === maxPieces && list.filter((x) => x.pieces === maxPieces).length < list.length,
      costPerThousand: p.amountCents !== null && p.reach ? Math.round((p.amountCents / p.reach) * 1000) : null,
    };
  }
  return out;
}

// ---------------------------------------------------------------- leitura das RPCs
type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const cents = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly string[]).includes(String(v)) ? (v as T) : fallback);
const networksOf = (v: unknown): Network[] => strings(v).filter((n): n is Network => (NETWORKS as readonly string[]).includes(n));
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);

/** Regra da performance sem o número (quem não lê valores): o tipo e como mede continuam, o número não. */
const HIDDEN_RATE = 0;

/**
 * Forma de pagamento lida do banco (0140). Quem não lê valores recebe a regra sem os números (compensation_public:
 * rate e estimativas nulos): a performance continua aparecendo (tipo e como mede), só sem o número.
 */
export function compensationOf(v: unknown): Compensation {
  const c = parseCompensation(v);
  const r = obj(v);
  const p = obj(r?.performance);
  if (c.performance || !r || !p || (p.rate !== null && p.rate !== undefined) || !(PERF_KINDS as readonly string[]).includes(String(p.kind))) return c;
  return {
    money: typeof r.money === "boolean" ? r.money : true,
    barter: c.barter,
    performance: { kind: p.kind as PerfKind, rate: HIDDEN_RATE, measure: typeof p.measure === "string" ? p.measure.trim() : "", estimateCents: null },
  };
}

/** Para quem não lê valores (gestor, equipe da agência, Hero): o tipo e as descrições, nunca os números (R$ ou %). */
export function compensationWithoutValues(c: Compensation): Compensation {
  return {
    money: c.money,
    barter: c.barter ? { offer: c.barter.offer, valueCents: null } : null,
    performance: c.performance ? { kind: c.performance.kind, rate: HIDDEN_RATE, measure: c.performance.measure, estimateCents: null } : null,
  };
}

export function toDeliverables(v: unknown): RequestDeliverable[] {
  return arr(v)
    .filter((d) => (DELIVERABLE_KINDS as readonly string[]).includes(String(d.kind)))
    .map((d) => ({
      kind: d.kind as RequestDeliverable["kind"],
      quantity: Math.max(1, Math.min(100, num(d.quantity) || 1)),
      network: (NETWORKS as readonly string[]).includes(String(d.network)) ? (d.network as Network) : null,
    }));
}

export type BrandCall = {
  id: string;
  brandName: string;
  brandLogoUrl: string | null;
  title: string;
  objective: Objective | null;
  description: string;
  startsOn: string;
  endsOn: string;
  location: string;
  public: SponsorshipPublic | null;
  deliverables: RequestDeliverable[];
  creatorsWanted: number;
  niches: string[];
  networks: Network[];
  budgetDisplay: BudgetDisplay;
  /** 0096: modelo do valor e máximo de Heros (a agência gestora lê; o Hero não) */
  valueModel: ValueModel;
  maxHeroes: number | null;
  /** só para a marca e o Adm da agência (na forma escolhida); null para os outros */
  budgetCents: number | null;
  /** 0140: forma de pagamento (valor, permuta, performance); gestor e Hero recebem sem os números */
  compensation: Compensation;
  respondBy: string | null;
  status: CallStatus;
  closedReason: "deadline" | "decision" | null;
  publishedAt: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
};

export function toCall(r: Row): BrandCall {
  return {
    id: text(r.id),
    brandName: text(r.brand_name),
    brandLogoUrl: str(r.brand_logo_url),
    title: text(r.title),
    objective: (OBJECTIVES as readonly string[]).includes(String(r.objective)) ? (r.objective as Objective) : null,
    description: text(r.description),
    startsOn: text(r.starts_on),
    endsOn: text(r.ends_on),
    location: text(r.location),
    public: publicFromDb(r.public),
    deliverables: toDeliverables(r.deliverables),
    creatorsWanted: num(r.creators_wanted) || 1,
    niches: strings(r.niches),
    networks: networksOf(r.networks),
    budgetDisplay: oneOf(BUDGET_DISPLAYS, r.budget_display, "open"),
    valueModel: r.value_model === "por_heroi" ? "por_heroi" : "fixo",
    maxHeroes: r.value_model === "por_heroi" && cents(r.max_heroes) !== null ? num(r.max_heroes) : null,
    budgetCents: cents(r.budget_cents),
    compensation: compensationOf(r.compensation),
    respondBy: str(r.respond_by),
    status: oneOf(CALL_STATUSES, r.status, "draft"),
    closedReason: r.closed_reason === "deadline" || r.closed_reason === "decision" ? r.closed_reason : null,
    publishedAt: str(r.published_at),
    decidedAt: str(r.decided_at),
    decisionNote: text(r.decision_note),
    createdAt: text(r.created_at),
  };
}

export type CallRound = {
  id: string;
  seq: number;
  side: Side;
  action: CallRoundAction;
  amountCents: number | null;
  valueModel: ValueModel | null;
  maxHeroes: number | null;
  /** 0140: forma de pagamento da rodada (sem os números para quem não lê valores) */
  compensation: Compensation;
  deliverables: RequestDeliverable[] | null;
  deliverBy: string | null;
  note: string;
  state: "sent" | "pending_owner" | "returned";
  actorLabel: string;
  createdAt: string;
  reviewedLabel: string;
  reviewedAt: string | null;
  reviewNote: string;
};

function toRounds(v: unknown): CallRound[] {
  return arr(v).map((r) => ({
    id: text(r.id),
    seq: num(r.seq),
    side: r.side === "agency" ? "agency" : "brand",
    action: oneOf(CALL_ROUND_ACTIONS, r.action, "propose"),
    amountCents: cents(r.amount_cents),
    valueModel: r.value_model === "por_heroi" ? "por_heroi" : r.value_model === "fixo" ? "fixo" : null,
    maxHeroes: cents(r.max_heroes),
    compensation: compensationOf(r.compensation),
    deliverables: Array.isArray(r.deliverables) ? toDeliverables(r.deliverables) : null,
    deliverBy: str(r.deliver_by),
    note: text(r.note),
    state: oneOf(["sent", "pending_owner", "returned"] as const, r.state, "sent"),
    actorLabel: text(r.actor_label),
    createdAt: text(r.created_at),
    reviewedLabel: text(r.reviewed_label),
    reviewedAt: str(r.reviewed_at),
    reviewNote: text(r.review_note),
  }));
}

function toCard(v: unknown, fallbackId: string): CallTalentCard {
  const r = (v && typeof v === "object" ? v : {}) as Row;
  return {
    id: text(r.id) || fallbackId,
    name: text(r.name),
    photoUrl: str(r.photo_url),
    networks: arr(r.networks).map((n) => ({ network: text(n.network), handle: text(n.handle), followers: n.followers === undefined || n.followers === null ? null : num(n.followers) })),
    consentMissing: r.consent_missing === true,
  };
}

export type CallProposalTalent = { talentId: string; position: number; deliverables: RequestDeliverable[]; mediaKitUrl: string; card: CallTalentCard };

function toTalents(v: unknown): CallProposalTalent[] {
  return arr(v).map((t) => ({
    talentId: text(t.talent_id),
    position: num(t.position),
    deliverables: toDeliverables(t.deliverables),
    mediaKitUrl: text(t.media_kit_url),
    card: toCard(t.card, text(t.talent_id)),
  }));
}

export type CallProposal = {
  id: string;
  agencyId: string;
  agencyName: string;
  status: ProposalStatus;
  awaiting: Side | null;
  amountCents: number | null;
  /** 0096: modelo de valor da proposta (e o que foi acordado, congelado) */
  valueModel: ValueModel;
  maxHeroes: number | null;
  agreedValueModel: ValueModel | null;
  agreedMaxHeroes: number | null;
  /** 0140: forma de pagamento da proposta (começa com a da chamada) e a acordada, congelada */
  compensation: Compensation;
  agreedCompensation: Compensation | null;
  hasAmount: boolean;
  deliverables: RequestDeliverable[];
  deliverBy: string | null;
  note: string;
  rounds: number;
  sentAt: string | null;
  agreedCents: number | null;
  agreedDeliverables: RequestDeliverable[] | null;
  agreedDeliverBy: string | null;
  agreedSide: Side | null;
  agreedAt: string | null;
  endReason: string | null;
  requestId: string | null;
  pendingOwner: boolean;
  talents: CallProposalTalent[];
  history: CallRound[];
};

function toProposal(q: Row): CallProposal {
  return {
    id: text(q.id),
    agencyId: text(q.agency_id),
    agencyName: text(q.agency_name),
    status: oneOf(PROPOSAL_STATUSES, q.status, "closed"),
    awaiting: q.awaiting === "agency" || q.awaiting === "brand" ? q.awaiting : null,
    amountCents: cents(q.amount_cents),
    valueModel: q.value_model === "por_heroi" ? "por_heroi" : "fixo",
    maxHeroes: cents(q.max_heroes),
    agreedValueModel: q.agreed_value_model === "por_heroi" ? "por_heroi" : q.agreed_value_model === "fixo" ? "fixo" : null,
    agreedMaxHeroes: cents(q.agreed_max_heroes),
    compensation: compensationOf(q.compensation),
    agreedCompensation: obj(q.agreed_compensation) ? compensationOf(q.agreed_compensation) : null,
    hasAmount: q.has_amount === true || cents(q.amount_cents) !== null,
    deliverables: toDeliverables(q.deliverables),
    deliverBy: str(q.deliver_by),
    note: text(q.note),
    rounds: num(q.rounds),
    sentAt: str(q.sent_at),
    agreedCents: cents(q.agreed_cents),
    agreedDeliverables: Array.isArray(q.agreed_deliverables) ? toDeliverables(q.agreed_deliverables) : null,
    agreedDeliverBy: str(q.agreed_deliver_by),
    agreedSide: q.agreed_side === "agency" || q.agreed_side === "brand" ? q.agreed_side : null,
    agreedAt: str(q.agreed_at),
    endReason: str(q.end_reason),
    requestId: str(q.request_id),
    pendingOwner: q.pending_owner === true,
    talents: toTalents(q.talents),
    history: toRounds(q.history),
  };
}

export type BrandCallRow = BrandCall & {
  audience: CallAudience;
  approval: CallApproval;
  proposals: number;
  awaitingBrand: number;
  pendingOwner: number;
  agreed: number;
  requestIds: string[];
};

export function toBrandCalls(v: unknown): BrandCallRow[] {
  return arr(v).map((r) => ({
    ...toCall(r),
    audience: oneOf(CALL_AUDIENCES, r.audience, "my_agencies"),
    approval: oneOf(CALL_APPROVALS, r.approval_status, "none"),
    proposals: num(r.proposals),
    awaitingBrand: num(r.awaiting_brand),
    pendingOwner: num(r.pending_owner),
    agreed: num(r.agreed),
    requestIds: strings(r.request_ids),
  }));
}

export type BrandCallDetail = {
  role: "owner" | "staff";
  call: BrandCall & {
    audience: CallAudience;
    approval: CallApproval;
    approvalRequestedLabel: string;
    approvalRequestedAt: string | null;
    approvalRequestNote: string;
    approvalRequestedByMe: boolean;
    approvalDecidedLabel: string;
    approvalDecidedAt: string | null;
    approvalDecisionNote: string;
  };
  targets: { id: string; name: string }[];
  proposals: CallProposal[];
};

export function toBrandCallDetail(v: unknown): BrandCallDetail | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Row;
  const c = (d.call ?? {}) as Row;
  if (!c.id) return null;
  return {
    role: d.role === "owner" ? "owner" : "staff",
    call: {
      ...toCall(c),
      audience: oneOf(CALL_AUDIENCES, c.audience, "my_agencies"),
      approval: oneOf(CALL_APPROVALS, c.approval_status, "none"),
      approvalRequestedLabel: text(c.approval_requested_label),
      approvalRequestedAt: str(c.approval_requested_at),
      approvalRequestNote: text(c.approval_request_note),
      approvalRequestedByMe: c.approval_requested_by_me === true,
      approvalDecidedLabel: text(c.approval_decided_label),
      approvalDecidedAt: str(c.approval_decided_at),
      approvalDecisionNote: text(c.approval_decision_note),
    },
    targets: arr(d.targets).map((t) => ({ id: text(t.id), name: text(t.name) })),
    proposals: arr(d.proposals).map(toProposal),
  };
}

export type AgencyOption = { id: string; name: string; serves: boolean };
export function toAgencyOptions(v: unknown): AgencyOption[] {
  return arr(v).map((a) => ({ id: text(a.id), name: text(a.name), serves: a.serves === true }));
}

export type AgencyBrandCallRow = BrandCall & {
  viewStatus: AgencyViewStatus;
  interests: number;
  proposal: { id: string; status: ProposalStatus; awaiting: Side | null } | null;
};

/** Lista da agência. canValues = false (gestor): a forma de pagamento chega sem os números, mesmo que o banco mande. */
export function toAgencyBrandCalls(v: unknown, canValues = true): AgencyBrandCallRow[] {
  return arr(v).map((r) => {
    const p = r.proposal && typeof r.proposal === "object" ? (r.proposal as Row) : null;
    const call = toCall(r);
    return {
      ...call,
      compensation: canValues ? call.compensation : compensationWithoutValues(call.compensation),
      viewStatus: oneOf(AGENCY_VIEW_STATUSES, r.view_status, "closed"),
      interests: num(r.interests),
      proposal: p ? { id: text(p.id), status: oneOf(PROPOSAL_STATUSES, p.status, "closed"), awaiting: p.awaiting === "agency" || p.awaiting === "brand" ? p.awaiting : null } : null,
    };
  });
}

export type CallCandidate = { id: string; name: string; networks: string[]; interested: boolean };
export type CallInterest = { talentId: string; name: string; message: string; createdAt: string };

export type AgencyBrandCallDetail = {
  canValues: boolean;
  call: BrandCall;
  proposals: CallProposal[];
  interests: CallInterest[];
  candidates: CallCandidate[];
};

/** Sem permissão para valores: a forma de pagamento da proposta, do acordo e de cada rodada sem os números. */
function proposalWithoutValues(p: CallProposal): CallProposal {
  return {
    ...p,
    compensation: compensationWithoutValues(p.compensation),
    agreedCompensation: p.agreedCompensation ? compensationWithoutValues(p.agreedCompensation) : null,
    history: p.history.map((r) => ({ ...r, compensation: compensationWithoutValues(r.compensation) })),
  };
}

export function toAgencyBrandCallDetail(v: unknown): AgencyBrandCallDetail | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Row;
  const c = (d.call ?? {}) as Row;
  if (!c.id) return null;
  const canValues = d.can_values === true;
  const call = toCall(c);
  const proposals = arr(d.proposals).map(toProposal);
  // o banco já tira os números do gestor; aqui de novo, para nunca chegarem à tela
  return {
    canValues,
    call: canValues ? call : { ...call, compensation: compensationWithoutValues(call.compensation) },
    proposals: canValues ? proposals : proposals.map(proposalWithoutValues),
    interests: arr(d.interests).map((i) => ({ talentId: text(i.talent_id), name: text(i.name), message: text(i.message), createdAt: text(i.created_at) })),
    candidates: arr(d.candidates).map((t) => ({ id: text(t.id), name: text(t.name), networks: strings(t.networks), interested: t.interested === true })),
  };
}

export type TalentBrandCall = BrandCall & { myNetworks: string[]; myInterest: { message: string; at: string } | null; chosen: boolean };

/** Pedidos vistos pelo Hero: nunca a verba nem os números da forma de pagamento (só o tipo e as descrições). */
export function toTalentBrandCalls(v: unknown): TalentBrandCall[] {
  return arr(v).map((r) => {
    const i = r.my_interest && typeof r.my_interest === "object" ? (r.my_interest as Row) : null;
    const call = toCall(r);
    return {
      ...call,
      budgetCents: null,
      compensation: compensationWithoutValues(call.compensation),
      myNetworks: strings(r.my_networks),
      myInterest: i ? { message: text(i.message), at: text(i.at) } : null,
      chosen: r.chosen === true,
    };
  });
}

/** Situação da chamada vista pelo creator. */
export function talentCallStatus(c: Pick<TalentBrandCall, "status" | "respondBy" | "chosen">, now: Date = new Date()): "open" | "expired" | "chosen" | "closed" {
  if (c.chosen) return "chosen";
  if (c.status === "open" && c.respondBy && Date.parse(c.respondBy) >= now.getTime()) return "open";
  if (c.status === "open") return "expired";
  return "closed";
}
