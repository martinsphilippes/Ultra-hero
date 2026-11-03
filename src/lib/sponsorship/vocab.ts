import { z } from "zod";
import { plusDays } from "@/lib/calendar/ics";
import { toZonedIso } from "@/lib/deals/schemas";
import { NETWORKS, type Network } from "@/lib/talent/vocab";
import {
  MAX_PERKS,
  PROPOSAL_END_REASONS,
  PROPOSAL_STATUSES,
  ROUND_ACTIONS,
  ROUND_STATES,
  perksValid,
  publicFromDb,
  publicSchema,
  tierSchema,
  type ProposalEndReason,
  type ProposalStatus,
  type RoundAction,
  type RoundState,
  type Side,
  type SponsorshipPublic,
} from "./negotiation";

// Oportunidade de patrocínio (0085): lógica pura (testada em tests/unit/patrocinio.test.ts). O banco confere de
// novo (checks e RPCs); aqui ficam o formulário, as datas no fuso da agência e a leitura das RPCs fechadas.

export const SPONSORSHIP_STATUSES = ["open", "closed", "sponsored", "cancelled"] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];
/** Como a marca vê: aberta, prazo encerrado, patrocinada por ela, encerrada (sem dizer quem venceu), cancelada. */
export const BRAND_SPONSORSHIP_STATUSES = ["open", "expired", "won", "closed", "cancelled"] as const;
export type BrandSponsorshipStatus = (typeof BRAND_SPONSORSHIP_STATUSES)[number];
export const SPONSORSHIP_AUDIENCES = ["all", "selected"] as const;
export type SponsorshipAudience = (typeof SPONSORSHIP_AUDIENCES)[number];
export const SPONSORSHIP_DECISIONS = ["sponsor", "close", "cancel"] as const;
export type SponsorshipDecision = (typeof SPONSORSHIP_DECISIONS)[number];
export const SPONSORSHIP_RESPONSES = ["interested", "declined"] as const;
export type SponsorshipResponse = (typeof SPONSORSHIP_RESPONSES)[number];

export { MAX_PERKS, perksValid } from "./negotiation";

/** Contrapartidas digitadas uma por linha → lista limpa (sem vazios, espaços duplos nem repetidas). */
export function parsePerks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
  }
  return out;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]);

/** Formulário da agência: datas e horas locais (fuso da agência), público e contrapartidas. */
export const sponsorshipSchema = z
  .object({
    id: z.uuid().nullable(),
    talentId: z.uuid(),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000),
    location: z.string().trim().max(200),
    date: isoDate,
    endDate: z.union([z.literal(""), isoDate]),
    startTime: time,
    endTime: time,
    allDay: z.boolean(),
    expectedReach: z.string().trim().max(160),
    perks: z.array(z.string()).max(MAX_PERKS),
    networks: z.array(z.enum(NETWORKS)).min(1).max(NETWORKS.length),
    respondDate: isoDate,
    respondTime: z.string().regex(/^\d{2}:\d{2}$/),
    audience: z.enum(SPONSORSHIP_AUDIENCES),
    brandIds: z.array(z.uuid()).max(200),
    // 0088: cotas (1 a 3) e público do evento
    tiers: z.array(tierSchema).min(1).max(3),
    public: publicSchema,
  })
  .refine((v) => v.audience === "all" || v.brandIds.length > 0, { path: ["brandIds"] })
  .refine((v) => perksValid(v.perks), { path: ["perks"] });
export type SponsorshipInput = z.input<typeof sponsorshipSchema>;

/**
 * Instantes do evento e do prazo no fuso da agência. Dia inteiro: fim exclusivo (meia-noite do dia seguinte ao
 * último dia), a mesma convenção da agenda. Sem hora de fim: 2 horas depois do início. null = data inválida ou
 * fim antes do início.
 */
export function sponsorshipInstants(
  v: Pick<SponsorshipInput, "date" | "endDate" | "startTime" | "endTime" | "allDay" | "respondDate" | "respondTime">,
  timeZone: string,
): { startsAt: string; endsAt: string; respondBy: string } | null {
  const endDate = v.endDate || v.date;
  const startsAt = v.allDay ? toZonedIso(v.date, "00:00", timeZone) : toZonedIso(v.date, v.startTime || "09:00", timeZone);
  let endsAt = v.allDay ? toZonedIso(plusDays(endDate, 1), "00:00", timeZone) : v.endTime ? toZonedIso(endDate, v.endTime, timeZone) : null;
  if (!v.allDay && !v.endTime && startsAt) endsAt = new Date(Date.parse(startsAt) + 2 * 3600_000).toISOString();
  const respondBy = toZonedIso(v.respondDate, v.respondTime, timeZone);
  if (!startsAt || !endsAt || !respondBy) return null;
  if (Date.parse(endsAt) < Date.parse(startsAt)) return null;
  return { startsAt, endsAt, respondBy };
}

/** "YYYY-MM-DD" e "HH:MM" de um instante, no fuso (para preencher o formulário de edição). */
export function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// ---------------------------------------------------------------- leituras (RPCs fechadas)
type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const networks = (v: unknown): Network[] => strings(v).filter((n): n is Network => (NETWORKS as readonly string[]).includes(n));
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly string[]).includes(String(v)) ? (v as T) : fallback);

/** O que toda leitura traz da oportunidade em si. */
export type SponsorshipCore = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  expectedReach: string;
  perks: string[];
  networks: Network[];
  respondBy: string;
  /** público do evento (0088), null se vazio */
  public: SponsorshipPublic | null;
};

function toCore(r: Row): SponsorshipCore {
  return {
    id: text(r.id),
    title: text(r.title),
    description: text(r.description),
    location: text(r.location),
    startsAt: text(r.starts_at),
    endsAt: text(r.ends_at),
    allDay: r.all_day === true,
    expectedReach: text(r.expected_reach),
    perks: strings(r.perks),
    networks: networks(r.networks),
    respondBy: text(r.respond_by),
    public: publicFromDb(r.public),
  };
}

// ---------------------------------------------------------------- 0088: cotas, propostas e rodadas
const cents = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export type SponsorshipTier = { id: string; name: string; priceCents: number | null; perks: string[]; slots: number; full: boolean };

function toTier(r: Row): SponsorshipTier {
  return { id: text(r.id), name: text(r.name), priceCents: cents(r.price_cents), perks: strings(r.perks), slots: num(r.slots) || 1, full: r.full === true };
}

export type NegotiationRound = {
  id: string;
  seq: number;
  side: Side;
  action: RoundAction;
  /** null para quem não lê valor (gestor) e na recusa */
  amountCents: number | null;
  perks: string[] | null;
  audience: SponsorshipPublic | null;
  note: string;
  state: RoundState;
  actorLabel: string;
  createdAt: string;
  reviewedLabel: string;
  reviewedAt: string | null;
  reviewNote: string;
};

function toRounds(v: unknown): NegotiationRound[] {
  return arr(v).map((r) => ({
    id: text(r.id),
    seq: num(r.seq),
    side: r.side === "agency" ? "agency" : "brand",
    action: oneOf(ROUND_ACTIONS, r.action, "propose"),
    amountCents: cents(r.amount_cents),
    perks: Array.isArray(r.perks) ? strings(r.perks) : null,
    audience: publicFromDb(r.audience),
    note: text(r.note),
    state: oneOf(ROUND_STATES, r.state, "sent"),
    actorLabel: text(r.actor_label),
    createdAt: text(r.created_at),
    reviewedLabel: text(r.reviewed_label),
    reviewedAt: str(r.reviewed_at),
    reviewNote: text(r.review_note),
  }));
}

export type NegotiationProposal = {
  id: string;
  tierId: string;
  tierName: string;
  status: ProposalStatus;
  awaiting: Side | null;
  askedCents: number | null;
  amountCents: number | null;
  perks: string[];
  agreedCents: number | null;
  agreedPerks: string[] | null;
  agreedSide: Side | null;
  agreedAt: string | null;
  endedAt: string | null;
  endReason: ProposalEndReason | null;
  sentAt: string | null;
  requestId: string | null;
  history: NegotiationRound[];
  /** só na agência */
  brandId: string;
  brandName: string;
};

function toProposal(r: Row): NegotiationProposal {
  return {
    id: text(r.id),
    tierId: text(r.tier_id),
    tierName: text(r.tier_name),
    status: oneOf(PROPOSAL_STATUSES, r.status, "closed"),
    awaiting: r.awaiting === "agency" || r.awaiting === "brand" ? r.awaiting : null,
    askedCents: cents(r.asked_cents),
    amountCents: cents(r.amount_cents),
    perks: strings(r.perks),
    agreedCents: cents(r.agreed_cents),
    agreedPerks: Array.isArray(r.agreed_perks) ? strings(r.agreed_perks) : null,
    agreedSide: r.agreed_side === "agency" || r.agreed_side === "brand" ? r.agreed_side : null,
    agreedAt: str(r.agreed_at),
    endedAt: str(r.ended_at),
    endReason: (PROPOSAL_END_REASONS as readonly string[]).includes(String(r.end_reason)) ? (r.end_reason as ProposalEndReason) : null,
    sentAt: str(r.sent_at),
    requestId: str(r.request_id),
    history: toRounds(r.history),
    brandId: text(r.brand_id),
    brandName: text(r.brand_name),
  };
}

/** Há rodada da equipe esperando o dono? */
export function hasPendingOwner(p: Pick<NegotiationProposal, "history">): boolean {
  return p.history.some((r) => r.state === "pending_owner");
}

export type BrandNegotiation = { role: "owner" | "staff"; canPropose: boolean; tiers: SponsorshipTier[]; proposals: NegotiationProposal[] };

export function toBrandNegotiation(data: unknown): BrandNegotiation | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Row;
  return {
    role: d.role === "owner" ? "owner" : "staff",
    canPropose: d.can_propose === true,
    tiers: arr(d.tiers).map(toTier),
    proposals: arr(d.proposals).map(toProposal),
  };
}

export type AgencyTier = { id: string; position: number; name: string; perks: string[]; slots: number; priceCents: number | null; hasPrice: boolean; agreed: number; hasProposals: boolean };

export type AgencySponsorshipRow = Pick<SponsorshipCore, "id" | "title" | "location" | "startsAt" | "endsAt" | "allDay" | "respondBy"> & {
  talentId: string;
  talentName: string;
  status: SponsorshipStatus;
  closedReason: "deadline" | "decision" | null;
  audience: SponsorshipAudience;
  decidedAt: string | null;
  audienceCount: number;
  interested: number;
  declined: number;
  winners: string[];
  negotiating: number;
  awaitingAgency: number;
  agreed: number;
  missingPrice: number;
};

export function toAgencySponsorships(data: unknown): AgencySponsorshipRow[] {
  return arr(data).map((r) => ({
    id: text(r.id),
    title: text(r.title),
    location: text(r.location),
    startsAt: text(r.starts_at),
    endsAt: text(r.ends_at),
    allDay: r.all_day === true,
    respondBy: text(r.respond_by),
    talentId: text(r.talent_id),
    talentName: text(r.talent_name),
    status: oneOf(SPONSORSHIP_STATUSES, r.status, "open"),
    closedReason: r.closed_reason === "deadline" || r.closed_reason === "decision" ? r.closed_reason : null,
    audience: oneOf(SPONSORSHIP_AUDIENCES, r.audience, "all"),
    decidedAt: str(r.decided_at),
    audienceCount: num(r.audience_count),
    interested: num(r.interested),
    declined: num(r.declined),
    winners: strings(r.winners),
    negotiating: num(r.negotiating),
    awaitingAgency: num(r.awaiting_agency),
    agreed: num(r.agreed),
    missingPrice: num(r.missing_price),
  }));
}

export type AgencySponsorshipBrand = {
  brandId: string;
  name: string;
  response: SponsorshipResponse | null;
  message: string;
  respondedLabel: string;
  respondedAt: string | null;
  outcome: "won" | "lost" | null;
  requestId: string | null;
  requestStatus: string | null;
  dealId: string | null;
};

export type AgencySponsorshipDetail = SponsorshipCore & {
  agencyId: string;
  talentId: string;
  talentName: string;
  audience: SponsorshipAudience;
  status: SponsorshipStatus;
  closedReason: "deadline" | "decision" | null;
  decisionNote: string;
  decidedAt: string | null;
  decidedLabel: string;
  targetIds: string[];
  brands: AgencySponsorshipBrand[];
  /** 0088: só o Adm lê valores */
  canValues: boolean;
  tiers: AgencyTier[];
  proposals: NegotiationProposal[];
};

export function toAgencySponsorshipDetail(data: unknown): AgencySponsorshipDetail | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Row;
  const o = (d.opportunity ?? null) as Row | null;
  if (!o || typeof o !== "object") return null;
  return {
    ...toCore(o),
    agencyId: text(o.agency_id),
    talentId: text(o.talent_id),
    talentName: text(o.talent_name),
    audience: oneOf(SPONSORSHIP_AUDIENCES, o.audience, "all"),
    status: oneOf(SPONSORSHIP_STATUSES, o.status, "open"),
    closedReason: o.closed_reason === "deadline" || o.closed_reason === "decision" ? o.closed_reason : null,
    decisionNote: text(o.decision_note),
    decidedAt: str(o.decided_at),
    decidedLabel: text(o.decided_label),
    targetIds: strings(o.target_ids),
    canValues: d.can_values === true,
    tiers: arr(d.tiers).map((z) => ({
      id: text(z.id),
      position: num(z.position),
      name: text(z.name),
      perks: strings(z.perks),
      slots: num(z.slots) || 1,
      priceCents: cents(z.price_cents),
      hasPrice: z.has_price === true,
      agreed: num(z.agreed),
      hasProposals: z.has_proposals === true,
    })),
    proposals: arr(d.proposals).map(toProposal),
    brands: arr(d.brands).map((b) => ({
      brandId: text(b.brand_id),
      name: text(b.name),
      response: b.response === "interested" || b.response === "declined" ? b.response : null,
      message: text(b.message),
      respondedLabel: text(b.responded_label),
      respondedAt: str(b.responded_at),
      outcome: b.outcome === "won" || b.outcome === "lost" ? b.outcome : null,
      requestId: str(b.request_id),
      requestStatus: str(b.request_status),
      dealId: str(b.deal_id),
    })),
  };
}

/** Quantas marcas quiseram, recusaram e ainda não responderam. */
export function responseCounts(brands: readonly Pick<AgencySponsorshipBrand, "response">[]): { interested: number; declined: number; pending: number } {
  const out = { interested: 0, declined: 0, pending: 0 };
  for (const b of brands) {
    if (b.response === "interested") out.interested += 1;
    else if (b.response === "declined") out.declined += 1;
    else out.pending += 1;
  }
  return out;
}

/** A agência ainda decide? Aberta, ou encerrada pelo prazo sem decisão (a mesma regra da RPC). */
export function canDecide(o: { status: SponsorshipStatus; decidedAt: string | null }): boolean {
  return (o.status === "open" || o.status === "closed") && o.decidedAt === null;
}

export type BrandSponsorship = SponsorshipCore & {
  status: BrandSponsorshipStatus;
  agencyName: string;
  timezone: string;
  talent: { id: string; name: string; inCatalog: boolean; photoUrl: string | null };
  myResponse: { response: SponsorshipResponse; message: string; respondedLabel: string; respondedAt: string | null; requestId: string | null; outcome: "won" | "lost" | null } | null;
  /** 0088: cotas com o valor PEDIDO e o resumo da própria negociação */
  tiers: SponsorshipTier[];
  negotiation: { id: string; status: ProposalStatus; awaiting: Side | null; tierName: string; pendingOwner: boolean } | null;
};

export function toBrandSponsorships(data: unknown): BrandSponsorship[] {
  return arr(data).map((r) => {
    const t = (r.talent ?? {}) as Row;
    const m = r.my_response && typeof r.my_response === "object" ? (r.my_response as Row) : null;
    return {
      ...toCore(r),
      status: oneOf(BRAND_SPONSORSHIP_STATUSES, r.status, "closed"),
      agencyName: text(r.agency_name),
      timezone: text(r.timezone) || "America/Sao_Paulo",
      talent: { id: text(t.id), name: text(t.name), inCatalog: t.in_catalog === true, photoUrl: str(t.photo_url) },
      tiers: arr(r.tiers).map(toTier),
      negotiation:
        r.negotiation && typeof r.negotiation === "object"
          ? (() => {
              const n = r.negotiation as Row;
              return {
                id: text(n.id),
                status: oneOf(PROPOSAL_STATUSES, n.status, "closed"),
                awaiting: n.awaiting === "agency" || n.awaiting === "brand" ? n.awaiting : null,
                tierName: text(n.tier_name),
                pendingOwner: n.pending_owner === true,
              };
            })()
          : null,
      myResponse:
        m && (m.response === "interested" || m.response === "declined")
          ? {
              response: m.response,
              message: text(m.message),
              respondedLabel: text(m.responded_label),
              respondedAt: str(m.responded_at),
              requestId: str(m.request_id),
              outcome: m.outcome === "won" || m.outcome === "lost" ? m.outcome : null,
            }
          : null,
    };
  });
}

/** A marca ainda pode responder? Aberta, no prazo e sem resposta (recusa pode virar interesse). */
export function brandCanRespond(s: Pick<BrandSponsorship, "status" | "myResponse">): { interested: boolean; declined: boolean } {
  if (s.status !== "open") return { interested: false, declined: false };
  if (!s.myResponse) return { interested: true, declined: true };
  return { interested: s.myResponse.response === "declined", declined: false };
}

export type TalentSponsorship = Pick<SponsorshipCore, "id" | "title" | "location" | "startsAt" | "endsAt" | "allDay" | "respondBy" | "expectedReach" | "perks" | "public"> & {
  status: SponsorshipStatus;
  sponsors: string[];
  /** 0088: o que ficou combinado com cada marca (o que o creator vai fazer). Nunca valor. */
  agreements: { brand: string; tier: string; perks: string[] }[];
};

export function toTalentSponsorships(data: unknown): TalentSponsorship[] {
  return arr(data).map((r) => ({
    id: text(r.id),
    title: text(r.title),
    location: text(r.location),
    startsAt: text(r.starts_at),
    endsAt: text(r.ends_at),
    allDay: r.all_day === true,
    respondBy: text(r.respond_by),
    expectedReach: text(r.expected_reach),
    perks: strings(r.perks),
    status: oneOf(SPONSORSHIP_STATUSES, r.status, "open"),
    sponsors: strings(r.sponsors),
    public: publicFromDb(r.public),
    agreements: arr(r.agreements).map((a) => ({ brand: text(a.brand), tier: text(a.tier), perks: strings(a.perks) })),
  }));
}
