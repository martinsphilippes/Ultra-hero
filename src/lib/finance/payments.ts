import { formatTaxId, normalizeTaxId, taxIdKind } from "@/lib/signature/tax-id";

// Pagamentos da marca (0090), lógica pura (testada em tests/unit/verba-pagamentos.test.ts). Tudo é registro/controle
// simulado: nada aqui cobra nem move dinheiro. O banco confere de novo (pix_key_normalize, agency_receivable_split,
// brand_payment_report, agency_payment_review).

export const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];
export const ACCOUNT_TYPES = ["checking", "savings"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const MAX_INSTALLMENTS = 12;

/** Mesma regra de public.pix_key_normalize: devolve a chave como o banco guarda, ou null se inválida. */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const k = raw.trim();
  if (!k) return null;
  switch (type) {
    case "cpf":
      return taxIdKind(k) === "cpf" ? normalizeTaxId(k) : null;
    case "cnpj":
      return taxIdKind(k) === "cnpj" ? normalizeTaxId(k) : null;
    case "email": {
      const e = k.toLowerCase();
      return e.length <= 77 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
    }
    case "phone": {
      let d = k.replace(/\D/g, "");
      if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
      return (d.length === 10 || d.length === 11) && d[0] !== "0" && d[1] !== "0" ? `+55${d}` : null;
    }
    case "random": {
      const r = k.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r) ? r : null;
    }
  }
}

/** Como a chave aparece para quem lê (CPF/CNPJ com pontuação, celular com DDD). A cópia usa a chave crua. */
export function formatPixKey(type: PixKeyType | null, key: string): string {
  if (type === "cpf" || type === "cnpj") return formatTaxId(key);
  if (type === "phone") {
    const d = key.replace(/^\+55/, "");
    if (d.length === 11) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return key;
}

export const bankBranchOk = (v: string) => /^[0-9]{1,6}(-[0-9Xx])?$/.test(v.trim());
export const bankAccountOk = (v: string) => /^[0-9]{1,15}(-[0-9Xx]{1,2})?$/.test(v.trim());

export type SettingsDraft = {
  pixKeyType: PixKeyType | "";
  pixKey: string;
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  bankAccountType: AccountType;
  holderName: string;
  holderTaxId: string;
  instructions: string;
};
export type SettingsProblem = "pix_key" | "bank" | "method" | "holder" | "tax_id" | "instructions" | null;

/** Confere os dados de pagamento antes de mandar (mesmas regras de agency_payment_settings_save). */
export function settingsProblem(d: SettingsDraft): SettingsProblem {
  const hasPix = d.pixKeyType !== "" || d.pixKey.trim() !== "";
  if (hasPix && (d.pixKeyType === "" || normalizePixKey(d.pixKeyType, d.pixKey) === null)) return "pix_key";
  const bankParts = [d.bankName, d.bankBranch, d.bankAccount].map((x) => x.trim());
  const hasBank = bankParts.some(Boolean);
  if (hasBank && (!bankParts.every(Boolean) || d.bankName.trim().length < 2 || d.bankName.trim().length > 80 || !bankBranchOk(d.bankBranch) || !bankAccountOk(d.bankAccount))) return "bank";
  if (!hasPix && !hasBank) return "method";
  const holder = d.holderName.trim().replace(/\s+/g, " ");
  if (holder.length < 2 || holder.length > 120) return "holder";
  if (!taxIdKind(d.holderTaxId)) return "tax_id";
  if (d.instructions.trim().length > 300) return "instructions";
  return null;
}

export type PaymentSettings = {
  pixKeyType: PixKeyType | null;
  pixKey: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccount: string | null;
  bankAccountType: AccountType | null;
  holderName: string;
  holderTaxId: string;
  instructions: string;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toPaymentSettings(raw: unknown): PaymentSettings | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  return {
    pixKeyType: (PIX_KEY_TYPES as readonly string[]).includes(str(k.pix_key_type)) ? (k.pix_key_type as PixKeyType) : null,
    pixKey: strOrNull(k.pix_key),
    bankName: strOrNull(k.bank_name),
    bankBranch: strOrNull(k.bank_branch),
    bankAccount: strOrNull(k.bank_account),
    bankAccountType: k.bank_account_type === "checking" || k.bank_account_type === "savings" ? k.bank_account_type : null,
    holderName: str(k.holder_name),
    holderTaxId: str(k.holder_tax_id),
    instructions: str(k.instructions),
  };
}

export function settingsToDraft(s: PaymentSettings | null): SettingsDraft {
  return {
    pixKeyType: s?.pixKeyType ?? "",
    pixKey: s?.pixKey ?? "",
    bankName: s?.bankName ?? "",
    bankBranch: s?.bankBranch ?? "",
    bankAccount: s?.bankAccount ?? "",
    bankAccountType: s?.bankAccountType ?? "checking",
    holderName: s?.holderName ?? "",
    holderTaxId: s?.holderTaxId ? formatTaxId(s.holderTaxId) : "",
    instructions: s?.instructions ?? "",
  };
}

// ---------------------------------------------------------------- parcelas e situação

export type PaymentReport = {
  id: string;
  status: "reported" | "confirmed" | "rejected";
  paidOn: string;
  amountCents: number;
  note: string;
  reviewNote: string;
  documentId: string | null;
  reportedLabel: string;
  reviewedLabel: string;
  createdAt: string;
  reviewedAt: string | null;
};
export type Installment = {
  id: string;
  seq: number;
  label: string;
  amountCents: number;
  dueOn: string | null;
  status: "open" | "paid";
  paidAt: string | null;
  report: PaymentReport | null;
};
export type Receivable = {
  entryId: string;
  dealId: string;
  requestId: string | null;
  title: string;
  brandId: string;
  brandName: string;
  agencyId: string;
  agencyName: string;
  origin: "campaign" | "sponsorship" | "call";
  totalCents: number;
  entryStatus: "planned" | "due" | "settled" | "cancelled";
  installments: Installment[];
};

function toReport(raw: unknown): PaymentReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Row;
  if (r.status !== "reported" && r.status !== "confirmed" && r.status !== "rejected") return null;
  return {
    id: str(r.id),
    status: r.status,
    paidOn: str(r.paid_on),
    amountCents: num(r.amount_cents),
    note: str(r.note),
    reviewNote: str(r.review_note),
    documentId: strOrNull(r.document_id),
    reportedLabel: str(r.reported_label),
    reviewedLabel: str(r.reviewed_label),
    createdAt: str(r.created_at),
    reviewedAt: strOrNull(r.reviewed_at),
  };
}

export function toReceivable(raw: unknown): Receivable | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  const status = ["planned", "due", "settled", "cancelled"].includes(str(k.entry_status)) ? (k.entry_status as Receivable["entryStatus"]) : "planned";
  return {
    entryId: str(k.entry_id),
    dealId: str(k.deal_id),
    requestId: strOrNull(k.request_id),
    title: str(k.title),
    brandId: str(k.brand_id),
    brandName: str(k.brand_name),
    agencyId: str(k.agency_id),
    agencyName: str(k.agency_name),
    origin: k.origin === "sponsorship" || k.origin === "call" ? k.origin : "campaign",
    totalCents: num(k.total_cents),
    entryStatus: status,
    installments: (Array.isArray(k.installments) ? (k.installments as Row[]) : []).map((i) => ({
      id: str(i.id),
      seq: num(i.seq),
      label: str(i.label),
      amountCents: num(i.amount_cents),
      dueOn: strOrNull(i.due_on),
      status: i.status === "paid" ? "paid" : "open",
      paidAt: strOrNull(i.paid_at),
      report: toReport(i.report),
    })),
  };
}

export type BrandPaymentsData = {
  role: "owner" | "staff" | null;
  items: Receivable[];
  agencies: { agencyId: string; name: string; timezone: string; settings: PaymentSettings | null }[];
};
export function toBrandPayments(raw: unknown): BrandPaymentsData {
  const k = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return {
    role: k.role === "owner" || k.role === "staff" ? k.role : null,
    items: (Array.isArray(k.items) ? k.items : []).map(toReceivable).filter((x): x is Receivable => x !== null),
    agencies: (Array.isArray(k.agencies) ? (k.agencies as Row[]) : []).map((a) => ({
      agencyId: str(a.agency_id),
      name: str(a.name),
      timezone: str(a.timezone) || "America/Sao_Paulo",
      settings: toPaymentSettings(a.settings),
    })),
  };
}

export type AgencyPaymentsData = { timezone: string; hasSettings: boolean; items: Receivable[] };
export function toAgencyPayments(raw: unknown): AgencyPaymentsData {
  const k = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return {
    timezone: str(k.timezone) || "America/Sao_Paulo",
    hasSettings: k.has_settings === true,
    items: (Array.isArray(k.items) ? k.items : []).map(toReceivable).filter((x): x is Receivable => x !== null),
  };
}

/** Dias de "hoje" até o vencimento (negativo = atrasado), com datas "YYYY-MM-DD". */
export function daysUntil(dueOn: string, today: string): number {
  const a = Date.UTC(Number(dueOn.slice(0, 4)), Number(dueOn.slice(5, 7)) - 1, Number(dueOn.slice(8, 10)));
  const b = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.round((a - b) / 86_400_000);
}

export type InstallmentState = "upcoming" | "overdue" | "reported" | "paid";

/** a vencer, vencido, informado (esperando a agência) ou pago. Informe recusado volta a "a vencer"/"vencido". */
export function installmentState(i: Pick<Installment, "status" | "dueOn" | "report">, today: string): InstallmentState {
  if (i.status === "paid") return "paid";
  if (i.report?.status === "reported") return "reported";
  if (i.dueOn && daysUntil(i.dueOn, today) < 0) return "overdue";
  return "upcoming";
}

/** Pode informar o pagamento? Parcela em aberto e sem informe esperando a agência. */
export function canReport(i: Pick<Installment, "status" | "report">, entryStatus: Receivable["entryStatus"]): boolean {
  return i.status === "open" && i.report?.status !== "reported" && (entryStatus === "planned" || entryStatus === "due");
}

/** Divide o total em n partes inteiras que somam exatamente o total (o centavo que sobra vai para as primeiras). */
export function splitEvenly(totalCents: number, n: number): number[] {
  const parts = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.trunc(n)));
  const base = Math.floor(totalCents / parts);
  const rest = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

export type SplitPart = { label: string; amountCents: number | null; dueOn: string };
export type SplitProblem = "count" | "amount" | "date" | "label" | "sum" | null;

/** Mesmas regras de agency_receivable_split: 1 a 12 partes, cada uma com valor > 0 e data, somando o total. */
export function splitProblem(totalCents: number, parts: SplitPart[]): SplitProblem {
  if (parts.length < 1 || parts.length > MAX_INSTALLMENTS) return "count";
  if (parts.some((p) => p.amountCents === null || p.amountCents < 1)) return "amount";
  if (parts.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn))) return "date";
  if (parts.some((p) => p.label.trim().length > 60)) return "label";
  if (parts.reduce((acc, p) => acc + (p.amountCents ?? 0), 0) !== totalCents) return "sum";
  return null;
}

/** Quanto falta para fechar a soma (positivo = falta; negativo = passou). */
export function splitRemaining(totalCents: number, parts: SplitPart[]): number {
  return totalCents - parts.reduce((acc, p) => acc + (p.amountCents ?? 0), 0);
}

export type PaymentTotals = { openCents: number; overdueCents: number; reportedCents: number; paidCents: number; overdueCount: number; reportedCount: number };

/** Totais da tela: em aberto (a vencer + vencido), vencido, informado e pago. */
export function paymentTotals(items: Receivable[], today: string): PaymentTotals {
  const out: PaymentTotals = { openCents: 0, overdueCents: 0, reportedCents: 0, paidCents: 0, overdueCount: 0, reportedCount: 0 };
  for (const r of items) {
    for (const i of r.installments) {
      const s = r.entryStatus === "settled" ? "paid" : installmentState(i, today);
      if (s === "paid") out.paidCents += i.amountCents;
      else if (s === "reported") {
        out.reportedCents += i.amountCents;
        out.reportedCount += 1;
      } else {
        out.openCents += i.amountCents;
        if (s === "overdue") {
          out.overdueCents += i.amountCents;
          out.overdueCount += 1;
        }
      }
    }
  }
  return out;
}

export const AGENCY_PAYMENT_FILTERS = ["reported", "open", "paid", "all"] as const;
export type AgencyPaymentFilter = (typeof AGENCY_PAYMENT_FILTERS)[number];

/** Filtro da lista da agência: informados (esperando o Adm), em aberto, pagos ou todos. */
export function filterReceivables(items: Receivable[], filter: AgencyPaymentFilter, today: string): Receivable[] {
  if (filter === "all") return items;
  return items.filter((r) => {
    const states = r.installments.map((i) => (r.entryStatus === "settled" ? "paid" : installmentState(i, today)));
    if (filter === "reported") return states.includes("reported");
    if (filter === "paid") return states.length > 0 && states.every((s) => s === "paid");
    return states.some((s) => s === "upcoming" || s === "overdue");
  });
}
