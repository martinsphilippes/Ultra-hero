import { z } from "zod";

// Condições de pagamento (0108), lógica pura testada em tests/unit/condicoes-pagamento.test.ts. Espelha
// public.payment_plan_clean / payment_plan_parts / payment_plan_payout_due: o banco confere de novo. Tudo simulado.
//
// Decisões (registradas também na migração 0108):
//   • Datas em dias corridos; vencimento em fim de semana/feriado fica como está (quem paga antecipa).
//   • Mensal soma k meses ao 1º vencimento (31/01 → 28/02 → 31/03), quinzenal soma 14 dias.
//   • O centavo que sobra na divisão vai para as primeiras parcelas (mesma regra de splitEvenly, 0090).
//   • Sinal: arredondado (meio para cima), sempre entre 1 centavo e total − 1.
//   • Repasse "após receber" conta da ÚLTIMA parcela da marca.

export const PAY_METHODS = ["pix", "boleto", "transfer", "card", "other"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PLAN_STRUCTURES = ["single", "down_payment", "installments"] as const;
export type PlanStructure = (typeof PLAN_STRUCTURES)[number];
export const PLAN_INTERVALS = ["monthly", "biweekly", "manual"] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];
export const DUE_RULES = ["date", "signature", "delivery", "publication"] as const;
export type DueRule = (typeof DUE_RULES)[number];
export const PAYOUT_RULES = ["after_receipt", "fixed_date", "after_delivery"] as const;
export type PayoutRule = (typeof PAYOUT_RULES)[number];
export const PAYOUT_METHODS = ["pix", "transfer"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const MIN_INSTALLMENTS = 2;
export const MAX_PLAN_INSTALLMENTS = 12;
export const MAX_RULE_DAYS = 365;
export const MAX_TOTAL_CENTS = 10_000_000_000;

/** Condições normalizadas (mesmas chaves do jsonb do banco; null quando não se aplica). */
export type PaymentPlan = {
  method: PayMethod;
  methodNote: string;
  structure: PlanStructure;
  downPaymentPct: number | null;
  installments: number | null;
  interval: PlanInterval | null;
  dates: string[] | null;
  firstRule: DueRule | null;
  firstDays: number | null;
  firstOn: string | null;
  balanceRule: DueRule | null;
  balanceDays: number | null;
  balanceOn: string | null;
  payoutRule: PayoutRule;
  payoutDays: number;
  payoutOn: string | null;
  payoutMethod: PayoutMethod;
  invoiceTalent: boolean;
  invoiceAgency: boolean;
  notes: string;
};

export type PlanEvents = { signature: string; delivery: string; publication: string };
export type PlanPart = { seq: number; amountCents: number; dueOn: string | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

// ---------------------------------------------------------------- datas (YYYY-MM-DD, sem fuso)
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Soma meses como o Postgres (date + interval 'k months'): o dia passa do fim do mês → último dia. */
export function addMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const d = Number(day.slice(8, 10));
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, last))).toISOString().slice(0, 10);
}

export function ruleDate(rule: DueRule | null, days: number | null, on: string | null, ev: PlanEvents): string | null {
  switch (rule) {
    case "date":
      return on;
    case "signature":
      return addDays(ev.signature, days ?? 0);
    case "delivery":
      return addDays(ev.delivery, days ?? 0);
    case "publication":
      return addDays(ev.publication, days ?? 0);
    default:
      return null;
  }
}

// ---------------------------------------------------------------- conta
/** Parcelas da marca somando exatamente o total (mesma conta de public.payment_plan_parts). */
export function planParts(plan: PaymentPlan, totalCents: number, ev: PlanEvents): PlanPart[] {
  const total = Math.trunc(totalCents);
  if (!Number.isFinite(total) || total < 1) return [];
  const manual = plan.structure === "installments" && plan.interval === "manual";
  const first = manual ? null : ruleDate(plan.firstRule, plan.firstDays, plan.firstOn, ev);
  if (plan.structure === "down_payment") {
    let sig = Math.round((total * (plan.downPaymentPct ?? 0)) / 100);
    if (total >= 2) sig = Math.max(1, Math.min(total - 1, sig));
    return [
      { seq: 1, amountCents: sig, dueOn: first },
      { seq: 2, amountCents: total - sig, dueOn: ruleDate(plan.balanceRule, plan.balanceDays, plan.balanceOn, ev) },
    ];
  }
  if (plan.structure === "installments") {
    const n = Math.max(MIN_INSTALLMENTS, Math.min(MAX_PLAN_INSTALLMENTS, plan.installments ?? MIN_INSTALLMENTS));
    const base = Math.floor(total / n);
    const rest = total - base * n;
    return Array.from({ length: n }, (_, k) => ({
      seq: k + 1,
      amountCents: base + (k < rest ? 1 : 0),
      dueOn:
        plan.interval === "monthly" ? (first ? addMonths(first, k) : null) : plan.interval === "biweekly" ? (first ? addDays(first, 14 * k) : null) : (plan.dates?.[k] ?? null),
    }));
  }
  return [{ seq: 1, amountCents: total, dueOn: first }];
}

/** Vencimento do repasse ao herói (public.payment_plan_payout_due). */
export function payoutDue(plan: Pick<PaymentPlan, "payoutRule" | "payoutDays" | "payoutOn">, lastBrandDue: string | null, delivery: string | null): string | null {
  if (plan.payoutRule === "fixed_date") return plan.payoutOn;
  if (plan.payoutRule === "after_receipt") return lastBrandDue ? addDays(lastBrandDue, plan.payoutDays) : null;
  return delivery ? addDays(delivery, plan.payoutDays) : null;
}

/** Comissão = acordado − repasses (nunca negativa: o banco recusa com agreed_below_payouts). */
export function planCommission(totalCents: number, payoutsCents: number): { commissionCents: number; ok: boolean } {
  return { commissionCents: totalCents - payoutsCents, ok: totalCents >= payoutsCents };
}

// ---------------------------------------------------------------- rascunho do formulário ↔ plano
export type PlanDraft = {
  method: PayMethod;
  methodNote: string;
  structure: PlanStructure;
  downPaymentPct: number;
  installments: number;
  interval: PlanInterval;
  dates: string[];
  firstRule: DueRule;
  firstDays: number;
  firstOn: string;
  balanceRule: DueRule;
  balanceDays: number;
  balanceOn: string;
  payoutRule: PayoutRule;
  payoutDays: number;
  payoutOn: string;
  payoutMethod: PayoutMethod;
  invoiceTalent: boolean;
  invoiceAgency: boolean;
  notes: string;
};

export function defaultDraft(today: string): PlanDraft {
  return {
    method: "pix",
    methodNote: "",
    structure: "single",
    downPaymentPct: 50,
    installments: 3,
    interval: "monthly",
    dates: [],
    firstRule: "signature",
    firstDays: 0,
    firstOn: today,
    balanceRule: "delivery",
    balanceDays: 0,
    balanceOn: today,
    payoutRule: "after_receipt",
    payoutDays: 10,
    payoutOn: today,
    payoutMethod: "pix",
    invoiceTalent: true,
    invoiceAgency: false,
    notes: "",
  };
}

export function planToDraft(plan: PaymentPlan | null, today: string): PlanDraft {
  const d = defaultDraft(today);
  if (!plan) return d;
  return {
    method: plan.method,
    methodNote: plan.methodNote,
    structure: plan.structure,
    downPaymentPct: plan.downPaymentPct ?? d.downPaymentPct,
    installments: plan.installments ?? d.installments,
    interval: plan.interval ?? d.interval,
    dates: plan.dates ?? [],
    firstRule: plan.firstRule ?? d.firstRule,
    firstDays: plan.firstDays ?? 0,
    firstOn: plan.firstOn ?? (plan.dates?.[0] ?? today),
    balanceRule: plan.balanceRule ?? d.balanceRule,
    balanceDays: plan.balanceDays ?? 0,
    balanceOn: plan.balanceOn ?? today,
    payoutRule: plan.payoutRule,
    payoutDays: plan.payoutDays,
    payoutOn: plan.payoutOn ?? today,
    payoutMethod: plan.payoutMethod,
    invoiceTalent: plan.invoiceTalent,
    invoiceAgency: plan.invoiceAgency,
    notes: plan.notes,
  };
}

/** Datas manuais com o tamanho certo (completa a partir do 1º vencimento, mês a mês). */
export function manualDates(draft: Pick<PlanDraft, "dates" | "installments" | "firstOn">, today: string): string[] {
  const n = Math.max(MIN_INSTALLMENTS, Math.min(MAX_PLAN_INSTALLMENTS, draft.installments));
  const start = isIso(draft.firstOn) ? draft.firstOn : today;
  return Array.from({ length: n }, (_, k) => (isIso(draft.dates[k]) ? draft.dates[k] : addMonths(start, k)));
}

export type PlanProblem = "total" | "methodNote" | "downPayment" | "installments" | "dates" | "firstOn" | "balanceOn" | "days" | "payoutOn" | "notes" | "belowPayouts";

/** Confere o rascunho como o banco (payment_plan_clean + acordado ≥ repasses) e devolve o plano normalizado. */
export function draftToPlan(
  draft: PlanDraft,
  totalCents: number | null,
  payoutsCents: number,
  today: string,
): { ok: true; plan: PaymentPlan } | { ok: false; problem: PlanProblem } {
  if (totalCents === null || !Number.isInteger(totalCents) || totalCents < 1 || totalCents > MAX_TOTAL_CENTS) return { ok: false, problem: "total" };
  const note = draft.methodNote.replace(/\s+/g, " ").trim();
  if (draft.method === "other" && (note.length < 2 || note.length > 120)) return { ok: false, problem: "methodNote" };
  if (draft.notes.trim().length > 500) return { ok: false, problem: "notes" };
  const daysOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_RULE_DAYS;
  const manual = draft.structure === "installments" && draft.interval === "manual";
  let dates: string[] | null = null;
  if (draft.structure === "installments") {
    if (!Number.isInteger(draft.installments) || draft.installments < MIN_INSTALLMENTS || draft.installments > MAX_PLAN_INSTALLMENTS) return { ok: false, problem: "installments" };
    if (manual) {
      dates = manualDates(draft, today);
      if (dates.some((d, i) => !isIso(d) || (i > 0 && d < dates![i - 1]))) return { ok: false, problem: "dates" };
    }
  }
  if (!manual) {
    if (!daysOk(draft.firstDays)) return { ok: false, problem: "days" };
    if (draft.firstRule === "date" && !isIso(draft.firstOn)) return { ok: false, problem: "firstOn" };
  }
  if (draft.structure === "down_payment") {
    if (!Number.isInteger(draft.downPaymentPct) || draft.downPaymentPct < 1 || draft.downPaymentPct > 99) return { ok: false, problem: "downPayment" };
    if (!daysOk(draft.balanceDays)) return { ok: false, problem: "days" };
    if (draft.balanceRule === "date" && (!isIso(draft.balanceOn) || (draft.firstRule === "date" && draft.balanceOn < draft.firstOn))) return { ok: false, problem: "balanceOn" };
  }
  if (draft.payoutRule !== "fixed_date" && !daysOk(draft.payoutDays)) return { ok: false, problem: "days" };
  if (draft.payoutRule === "fixed_date" && !isIso(draft.payoutOn)) return { ok: false, problem: "payoutOn" };
  if (totalCents < payoutsCents) return { ok: false, problem: "belowPayouts" };
  const down = draft.structure === "down_payment";
  return {
    ok: true,
    plan: {
      method: draft.method,
      methodNote: draft.method === "other" ? note : "",
      structure: draft.structure,
      downPaymentPct: down ? draft.downPaymentPct : null,
      installments: draft.structure === "installments" ? draft.installments : null,
      interval: draft.structure === "installments" ? draft.interval : null,
      dates,
      firstRule: manual ? null : draft.firstRule,
      firstDays: manual ? null : draft.firstRule === "date" ? 0 : draft.firstDays,
      firstOn: manual ? null : draft.firstRule === "date" ? draft.firstOn : null,
      balanceRule: down ? draft.balanceRule : null,
      balanceDays: down ? (draft.balanceRule === "date" ? 0 : draft.balanceDays) : null,
      balanceOn: down && draft.balanceRule === "date" ? draft.balanceOn : null,
      payoutRule: draft.payoutRule,
      payoutDays: draft.payoutRule === "fixed_date" ? 0 : draft.payoutDays,
      payoutOn: draft.payoutRule === "fixed_date" ? draft.payoutOn : null,
      payoutMethod: draft.payoutMethod,
      invoiceTalent: draft.invoiceTalent,
      invoiceAgency: draft.invoiceAgency,
      notes: draft.notes.trim(),
    },
  };
}

/** Plano → jsonb do banco (snake_case). */
export function planToJson(plan: PaymentPlan): Record<string, unknown> {
  return {
    method: plan.method,
    method_note: plan.methodNote,
    structure: plan.structure,
    down_payment_pct: plan.downPaymentPct,
    installments: plan.installments,
    interval: plan.interval,
    dates: plan.dates,
    first_rule: plan.firstRule,
    first_days: plan.firstDays,
    first_on: plan.firstOn,
    balance_rule: plan.balanceRule,
    balance_days: plan.balanceDays,
    balance_on: plan.balanceOn,
    payout_rule: plan.payoutRule,
    payout_days: plan.payoutDays,
    payout_on: plan.payoutOn,
    payout_method: plan.payoutMethod,
    invoice_talent: plan.invoiceTalent,
    invoice_agency: plan.invoiceAgency,
    notes: plan.notes,
  };
}

type Row = Record<string, unknown>;
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const pickOrNull = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);
const intOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
const dayOrNull = (v: unknown): string | null => (isIso(v) ? v : null);

/** jsonb do banco → plano (parcial no caso da marca e do herói: o que faltar fica no padrão). */
export function toPaymentPlan(raw: unknown): PaymentPlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  return {
    method: pick(PAY_METHODS, k.method, "pix"),
    methodNote: typeof k.method_note === "string" ? k.method_note : "",
    structure: pick(PLAN_STRUCTURES, k.structure, "single"),
    downPaymentPct: intOrNull(k.down_payment_pct),
    installments: intOrNull(k.installments),
    interval: pickOrNull(PLAN_INTERVALS, k.interval),
    dates: Array.isArray(k.dates) ? k.dates.filter(isIso) : null,
    firstRule: pickOrNull(DUE_RULES, k.first_rule),
    firstDays: intOrNull(k.first_days),
    firstOn: dayOrNull(k.first_on),
    balanceRule: pickOrNull(DUE_RULES, k.balance_rule),
    balanceDays: intOrNull(k.balance_days),
    balanceOn: dayOrNull(k.balance_on),
    payoutRule: pick(PAYOUT_RULES, k.payout_rule, "after_receipt"),
    payoutDays: intOrNull(k.payout_days) ?? 0,
    payoutOn: dayOrNull(k.payout_on),
    payoutMethod: pick(PAYOUT_METHODS, k.payout_method, "pix"),
    invoiceTalent: k.invoice_talent === true,
    invoiceAgency: k.invoice_agency === true,
    notes: typeof k.notes === "string" ? k.notes : "",
  };
}

// ---------------------------------------------------------------- leitura (deal_payment_plan_json)
export type PlanStatus = "none" | "saved" | "forecast" | "effective";
export type PlanPayout = { dealTalentId: string; name: string; status: string; feeCents: number | null; entryStatus: string | null; dueOn: string | null; scheduledOn: string | null };
export type PlanViewPart = { seq: number; amountCents: number | null; dueOn: string | null; status: string | null; label: string };
export type PaymentPlanView = {
  enabled: boolean;
  viewer: "agency" | "brand" | "talent";
  values: boolean;
  status: PlanStatus;
  hasPlan: boolean;
  locked: boolean;
  canEdit: boolean;
  agreed: boolean;
  termsPending: boolean;
  stage: string | null;
  plan: PaymentPlan | null;
  totalCents: number | null;
  parts: PlanViewPart[];
  events: PlanEvents | null;
  suggested: { source: "agreed" | "offered" | "fees" | "none"; cents: number | null } | null;
  payoutsCents: number | null;
  commissionCents: number | null;
  ok: boolean;
  payoutDueOn: string | null;
  payouts: PlanPayout[];
  updatedLabel: string;
  requestId: string | null;
  myPayout: { dealTalentId: string; amountCents: number | null; status: string | null; dueOn: string | null } | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function toPaymentPlanView(raw: unknown): PaymentPlanView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  const viewer = k.viewer === "brand" || k.viewer === "talent" ? k.viewer : "agency";
  const ev = k.events && typeof k.events === "object" ? (k.events as Row) : null;
  const sug = k.suggested && typeof k.suggested === "object" ? (k.suggested as Row) : null;
  const my = k.my_payout && typeof k.my_payout === "object" ? (k.my_payout as Row) : null;
  return {
    enabled: k.enabled !== false,
    viewer,
    values: k.values === true,
    status: pick(["none", "saved", "forecast", "effective"] as const, k.status, "none"),
    hasPlan: k.has_plan === true,
    locked: k.locked === true,
    canEdit: k.can_edit === true,
    agreed: k.agreed === true,
    termsPending: k.terms_pending === true,
    stage: typeof k.stage === "string" ? k.stage : null,
    plan: toPaymentPlan(k.plan),
    totalCents: num(k.total_cents),
    parts: (Array.isArray(k.parts) ? (k.parts as Row[]) : []).map((p) => ({
      seq: num(p.seq) ?? 0,
      amountCents: num(p.amount_cents),
      dueOn: dayOrNull(p.due_on),
      status: typeof p.status === "string" ? p.status : null,
      label: str(p.label),
    })),
    events: ev && isIso(ev.signature) && isIso(ev.delivery) && isIso(ev.publication) ? { signature: ev.signature, delivery: ev.delivery, publication: ev.publication } : null,
    suggested: sug ? { source: pick(["agreed", "offered", "fees", "none"] as const, sug.source, "none"), cents: num(sug.cents) } : null,
    payoutsCents: num(k.payouts_cents),
    commissionCents: num(k.commission_cents),
    ok: k.ok !== false,
    payoutDueOn: dayOrNull(k.payout_due_on),
    payouts: (Array.isArray(k.payouts) ? (k.payouts as Row[]) : []).map((p) => ({
      dealTalentId: str(p.deal_talent_id),
      name: str(p.name),
      status: str(p.status),
      feeCents: num(p.fee_cents),
      entryStatus: typeof p.entry_status === "string" ? p.entry_status : null,
      dueOn: dayOrNull(p.due_on),
      scheduledOn: dayOrNull(p.scheduled_on),
    })),
    updatedLabel: str(k.updated_label),
    requestId: typeof k.request_id === "string" ? k.request_id : null,
    myPayout: my
      ? { dealTalentId: str(my.deal_talent_id), amountCents: num(my.amount_cents), status: typeof my.status === "string" ? my.status : null, dueOn: dayOrNull(my.due_on) }
      : null,
  };
}

// ---------------------------------------------------------------- servidor
const uuid = z.uuid();
const iso = z.string().regex(ISO);
export const planInputSchema = z.object({
  method: z.enum(PAY_METHODS),
  methodNote: z.string().max(120),
  structure: z.enum(PLAN_STRUCTURES),
  downPaymentPct: z.number().int().min(1).max(99).nullable(),
  installments: z.number().int().min(MIN_INSTALLMENTS).max(MAX_PLAN_INSTALLMENTS).nullable(),
  interval: z.enum(PLAN_INTERVALS).nullable(),
  dates: z.array(iso).max(MAX_PLAN_INSTALLMENTS).nullable(),
  firstRule: z.enum(DUE_RULES).nullable(),
  firstDays: z.number().int().min(0).max(MAX_RULE_DAYS).nullable(),
  firstOn: iso.nullable(),
  balanceRule: z.enum(DUE_RULES).nullable(),
  balanceDays: z.number().int().min(0).max(MAX_RULE_DAYS).nullable(),
  balanceOn: iso.nullable(),
  payoutRule: z.enum(PAYOUT_RULES),
  payoutDays: z.number().int().min(0).max(MAX_RULE_DAYS),
  payoutOn: iso.nullable(),
  payoutMethod: z.enum(PAYOUT_METHODS),
  invoiceTalent: z.boolean(),
  invoiceAgency: z.boolean(),
  notes: z.string().max(500),
});
export const savePlanSchema = z.object({ dealId: uuid, totalCents: z.number().int().min(1).max(MAX_TOTAL_CENTS), plan: planInputSchema });
