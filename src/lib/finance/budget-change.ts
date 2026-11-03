import { requestDeliverablesSchema, type RequestDeliverable } from "@/lib/deals/schemas";

// Pedido de alteração de verba (0090), lógica pura (testada em tests/unit/verba-pagamentos.test.ts). O banco confere
// tudo de novo (budget_change_plan_valid e as RPCs); aqui ficam a leitura do JSON das RPCs, o plano de realinhamento
// montado pela tela e quem pode fazer o quê em cada situação.

export const CHANGE_STATUSES = ["pending_owner", "open", "proposed", "confirmed", "agency_declined", "brand_declined", "returned", "withdrawn"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const OPEN_CHANGE_STATUSES: readonly ChangeStatus[] = ["pending_owner", "open", "proposed"];
export const CREATOR_ACTIONS = ["keep", "remove", "add"] as const;
export type CreatorAction = (typeof CREATOR_ACTIONS)[number];
export const CHANGE_ACTIONS = ["created", "sent", "returned", "withdrawn", "declined", "proposed", "confirmed", "rejected"] as const;
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

export const REASON_MIN = 5;
export const REASON_MAX = 1000;
export const NOTE_MIN = 5;
export const MAX_PERKS = 10;
export const MAX_PLAN_CREATORS = 30;

export type PlanCreator = { dealTalentId: string | null; name: string; action: CreatorAction; note: string };
export type ChangePlan = {
  creators: PlanCreator[];
  /** null = entregas sem mudança */
  deliverables: RequestDeliverable[] | null;
  periodStart: string | null;
  periodEnd: string | null;
  scheduleNote: string;
  perks: string[];
  note: string;
};
export type ChangeEvent = { side: "brand" | "agency"; action: ChangeAction; label: string; at: string; note: string };
export type BudgetChange = {
  id: string;
  status: ChangeStatus;
  requestId: string;
  dealId: string;
  createdLabel: string;
  createdAt: string;
  createdByMe: boolean;
  sentAt: string | null;
  agencyLabel: string;
  agencyAt: string | null;
  brandLabel: string;
  brandAt: string | null;
  events: ChangeEvent[];
  /** null quando quem lê não vê valores (gestor/colaborador da agência) */
  values: {
    requestedCents: number;
    reason: string;
    counterCents: number | null;
    finalCents: number | null;
    beforeOfferedCents: number | null;
    beforeCommittedCents: number | null;
    /** só a marca (reserva interna) */
    beforeReservedCents: number | null;
    plan: ChangePlan | null;
    agencyNote: string;
    brandNote: string;
    talents: { dealTalentId: string; name: string; cents: number }[];
  } | null;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const isOne = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export function isOpenChange(status: ChangeStatus): boolean {
  return OPEN_CHANGE_STATUSES.includes(status);
}

/** Valor que passa a valer na confirmação: a contraproposta da agência ou o pedido. */
export function changeFinalCents(c: { requestedCents: number; counterCents: number | null }): number {
  return c.counterCents ?? c.requestedCents;
}

export function toPlan(raw: unknown): ChangePlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Row;
  const delivs = requestDeliverablesSchema.safeParse(p.deliverables);
  return {
    creators: (Array.isArray(p.creators) ? (p.creators as Row[]) : [])
      .filter((c) => isOne(CREATOR_ACTIONS, c.action))
      .map((c) => ({ dealTalentId: strOrNull(c.deal_talent_id), name: str(c.name), action: c.action as CreatorAction, note: str(c.note) })),
    deliverables: p.deliverables === null || p.deliverables === undefined || !delivs.success ? null : delivs.data,
    periodStart: strOrNull(p.period_start),
    periodEnd: strOrNull(p.period_end),
    scheduleNote: str(p.schedule_note),
    perks: Array.isArray(p.perks) ? (p.perks as unknown[]).map(str).filter(Boolean) : [],
    note: str(p.note),
  };
}

export function toBudgetChange(raw: unknown): BudgetChange | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  if (!isOne(CHANGE_STATUSES, k.status)) return null;
  const hasValues = "requested_cents" in k;
  return {
    id: str(k.id),
    status: k.status,
    requestId: str(k.request_id),
    dealId: str(k.deal_id),
    createdLabel: str(k.created_label),
    createdAt: str(k.created_at),
    createdByMe: k.created_by_me === true,
    sentAt: strOrNull(k.sent_at),
    agencyLabel: str(k.agency_label),
    agencyAt: strOrNull(k.agency_at),
    brandLabel: str(k.brand_label),
    brandAt: strOrNull(k.brand_at),
    events: (Array.isArray(k.events) ? (k.events as Row[]) : [])
      .filter((e) => isOne(CHANGE_ACTIONS, e.action) && (e.side === "brand" || e.side === "agency"))
      .map((e) => ({ side: e.side as "brand" | "agency", action: e.action as ChangeAction, label: str(e.label), at: str(e.at), note: str(e.note) })),
    values: hasValues
      ? {
          requestedCents: Number(k.requested_cents) || 0,
          reason: str(k.reason),
          counterCents: numOrNull(k.counter_cents),
          finalCents: numOrNull(k.final_cents),
          beforeOfferedCents: numOrNull(k.before_offered_cents),
          beforeCommittedCents: numOrNull(k.before_committed_cents),
          beforeReservedCents: numOrNull(k.before_reserved_cents),
          plan: toPlan(k.plan),
          agencyNote: str(k.agency_note),
          brandNote: str(k.brand_note),
          talents: (Array.isArray(k.talent_cents) ? (k.talent_cents as Row[]) : []).map((t) => ({ dealTalentId: str(t.deal_talent_id), name: str(t.name), cents: Number(t.cents) || 0 })),
        }
      : null,
  };
}

export type BrandChanges = { role: "owner" | "staff" | null; canRequest: boolean; items: BudgetChange[] };
export function toBrandChanges(raw: unknown): BrandChanges {
  const k = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return {
    role: k.role === "owner" || k.role === "staff" ? k.role : null,
    canRequest: k.can_request === true,
    items: (Array.isArray(k.items) ? k.items : []).map(toBudgetChange).filter((x): x is BudgetChange => x !== null),
  };
}

export type AgencyChanges = { canDecide: boolean; items: BudgetChange[] };
export function toAgencyChanges(raw: unknown): AgencyChanges {
  const k = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return { canDecide: k.can_decide === true, items: (Array.isArray(k.items) ? k.items : []).map(toBudgetChange).filter((x): x is BudgetChange => x !== null) };
}

/** O que a marca pode fazer com o pedido agora (o banco confere de novo). */
export function brandChangeActions(c: Pick<BudgetChange, "status" | "createdByMe">, role: "owner" | "staff" | null): ("send" | "return" | "withdraw" | "confirm" | "decline")[] {
  if (!role) return [];
  const out: ("send" | "return" | "withdraw" | "confirm" | "decline")[] = [];
  if (c.status === "pending_owner" && role === "owner") out.push("send", "return");
  if ((c.status === "pending_owner" || c.status === "open") && (role === "owner" || c.createdByMe)) out.push("withdraw");
  if (c.status === "proposed" && role === "owner") out.push("confirm", "decline");
  return out;
}

/** Linha da verba travada? A 1ª definição é livre; com a campanha enviada, o valor definido só muda pelo pedido. */
export function budgetRowLocked(locked: boolean, valueCents: number | null): boolean {
  return locked && valueCents !== null;
}

export type PlanDraft = {
  creators: { dealTalentId: string | null; name: string; action: CreatorAction; note: string }[];
  changeDeliverables: boolean;
  deliverables: RequestDeliverable[];
  periodStart: string;
  periodEnd: string;
  scheduleNote: string;
  perksText: string;
  note: string;
};

/** Contrapartidas: uma por linha, sem vazias nem repetidas, até 10. */
export function parsePerks(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const v = line.trim().replace(/\s+/g, " ");
    if (v.length < 2 || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v.slice(0, 200));
    if (out.length >= MAX_PERKS) break;
  }
  return out;
}

export type PlanProblem = "creator_name" | "period_order" | "too_long" | null;

/** Confere o rascunho do plano antes de mandar (mesmas regras de budget_change_plan_valid). */
export function planProblem(d: PlanDraft): PlanProblem {
  if (d.creators.some((c) => c.name.trim().length < 1 || c.name.trim().length > 120)) return "creator_name";
  if (d.creators.length > MAX_PLAN_CREATORS || d.creators.some((c) => c.note.length > 300)) return "too_long";
  if (d.periodStart && d.periodEnd && d.periodEnd < d.periodStart) return "period_order";
  if (d.scheduleNote.length > 500 || d.note.length > 1000) return "too_long";
  return null;
}

/** Rascunho da tela → JSON do plano (só o que mudou: creators "manter" sem nota não vão; entregas só se marcadas). */
export function planToDb(d: PlanDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const creators = d.creators
    .filter((c) => c.action !== "keep" || c.note.trim() !== "")
    .map((c) => ({ deal_talent_id: c.action === "add" ? null : c.dealTalentId, name: c.name.trim(), action: c.action, note: c.note.trim() }));
  if (creators.length > 0) out.creators = creators;
  if (d.changeDeliverables) out.deliverables = d.deliverables.map((x) => ({ kind: x.kind, quantity: x.quantity, network: x.network ?? null }));
  if (d.periodStart) out.period_start = d.periodStart;
  if (d.periodEnd) out.period_end = d.periodEnd;
  if (d.scheduleNote.trim()) out.schedule_note = d.scheduleNote.trim();
  const perks = parsePerks(d.perksText);
  if (perks.length > 0) out.perks = perks;
  if (d.note.trim()) out.note = d.note.trim();
  return out;
}

/** Diferença entre o novo valor e o de antes (positivo = aumento). */
export function changeDelta(beforeCents: number | null, afterCents: number): number | null {
  return beforeCents === null ? null : afterCents - beforeCents;
}
