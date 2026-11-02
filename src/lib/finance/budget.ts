import { BRAND_STATUSES, type BrandStatus } from "@/lib/deals/stages";

// Verba da marca (0082): normalização e regras de exibição, puras (testadas com vitest). O banco faz a conta
// (brand_budget_compute): reservado, comprometido (o que a marca paga pelos contratados, V = F + C), pago.

export type BudgetTalent = {
  dealTalentId: string;
  talentName: string;
  status: string;
  reservedCents: number | null;
  committedCents: number;
  paidCents: number;
  over: boolean;
};

export type BudgetSummary = {
  requestId: string;
  title: string;
  brandStatus: BrandStatus;
  reservedCents: number | null;
  /** set = a marca definiu; offered = máximo da faixa informada à agência; none = sem verba */
  reservedSource: "set" | "offered" | "none";
  offeredCents: number | null;
  committedCents: number;
  paidCents: number;
  openCents: number;
  remainingCents: number | null;
  over: boolean;
  talentsOver: number;
  paymentDueOn: string | null;
  paymentStatus: string | null;
  talents: BudgetTalent[];
  canEdit: boolean;
};

export type BudgetOverview = {
  role: "owner" | "staff" | null;
  items: BudgetSummary[];
  reservedCents: number;
  committedCents: number;
  paidCents: number;
  overCount: number;
};

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export function toBudgetSummary(raw: unknown): BudgetSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  const source = k.reserved_source === "set" || k.reserved_source === "offered" ? k.reserved_source : "none";
  return {
    requestId: String(k.request_id ?? ""),
    title: String(k.title ?? ""),
    brandStatus: (BRAND_STATUSES as readonly string[]).includes(String(k.brand_status)) ? (k.brand_status as BrandStatus) : "draft",
    reservedCents: numOrNull(k.reserved_cents),
    reservedSource: source,
    offeredCents: numOrNull(k.offered_cents),
    committedCents: num(k.committed_cents),
    paidCents: num(k.paid_cents),
    openCents: num(k.open_cents),
    remainingCents: numOrNull(k.remaining_cents),
    over: k.over === true,
    talentsOver: num(k.talents_over),
    paymentDueOn: str(k.payment_due_on),
    paymentStatus: str(k.payment_status),
    talents: (Array.isArray(k.talents) ? (k.talents as Row[]) : []).map((t) => ({
      dealTalentId: String(t.deal_talent_id ?? ""),
      talentName: String(t.talent_name ?? ""),
      status: String(t.status ?? ""),
      reservedCents: numOrNull(t.reserved_cents),
      committedCents: num(t.committed_cents),
      paidCents: num(t.paid_cents),
      over: t.over === true,
    })),
    canEdit: k.can_edit === true,
  };
}

export function toBudgetOverview(raw: unknown): BudgetOverview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  return {
    role: k.role === "owner" || k.role === "staff" ? k.role : null,
    items: (Array.isArray(k.items) ? k.items : []).map(toBudgetSummary).filter((x): x is BudgetSummary => x !== null),
    reservedCents: num(k.reserved_cents),
    committedCents: num(k.committed_cents),
    paidCents: num(k.paid_cents),
    overCount: num(k.over_count),
  };
}

export type BudgetTone = "none" | "ok" | "near" | "over";
/** Percentual a partir do qual a verba "está quase no limite". */
export const NEAR_LIMIT = 0.9;

/** Situação da verba: sem verba, folgada, quase no limite (≥ 90%) ou estourada. */
export function budgetTone(reserved: number | null, committed: number): BudgetTone {
  if (reserved === null) return "none";
  if (committed > reserved) return "over";
  if (reserved > 0 && committed >= reserved * NEAR_LIMIT) return "near";
  return "ok";
}

/** Percentual usado da verba (0..∞, inteiro); null sem verba ou verba zero. */
export function budgetUsedPercent(reserved: number | null, committed: number): number | null {
  if (reserved === null || reserved <= 0) return null;
  return Math.round((committed / reserved) * 100);
}

/** A campanha precisa da atenção da marca hoje? Verba da campanha ou de algum influenciador estourada. */
export function budgetNeedsAttention(b: Pick<BudgetSummary, "over" | "talentsOver">): boolean {
  return b.over || b.talentsOver > 0;
}
