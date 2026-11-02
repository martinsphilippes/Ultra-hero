import { isEntryStatus, type EntryStatus } from "./vocab";

// Ganhos do influenciador e nota fiscal (0082): lógica pura, sem banco (testada com vitest).
//
// Decisões (registradas também no relatório do bloco 5):
//   • Grupos do painel: "a receber" = contratado e entregue (todas as entregas publicadas/comprovadas/concluídas,
//     ou negócio ganho), ainda não pago; "previsão" = contratado, ainda em produção; "pagos" = liquidados.
//     Cancelados não entram em nenhum grupo (aparecem só na lista, apagados).
//   • Situação do pagamento, na ordem em que acontece: aguardando nota → nota enviada → nota aprovada →
//     agendado → pago. Nota recusada volta a "aguardando nota" (com o motivo à mostra). Agendado sem nota é
//     possível (a agência pode pagar pessoa física por RPA): a data agendada manda.
//   • Data prevista = a agendada pela agência; sem ela, o vencimento previsto do lançamento.

export const INVOICE_STATUSES = ["submitted", "approved", "rejected"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAY_STEPS = ["awaiting_invoice", "invoice_sent", "invoice_approved", "scheduled", "paid", "cancelled"] as const;
export type PayStep = (typeof PAY_STEPS)[number];
export const EARNING_GROUPS = ["receivable", "forecast", "paid"] as const;
export type EarningGroup = (typeof EARNING_GROUPS)[number];

export type PayoutInvoice = { id: string; status: InvoiceStatus; reviewNote: string; documentId: string | null; submittedAt: string | null; reviewedAt: string | null };

export type Earning = {
  id: string;
  dealId: string;
  dealTalentId: string;
  agencyId: string;
  dealTitle: string;
  brandName: string;
  status: EntryStatus;
  amountCents: number;
  dueOn: string | null;
  scheduledOn: string | null;
  settledAt: string | null;
  delivered: boolean;
  invoice: PayoutInvoice | null;
};

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && (INVOICE_STATUSES as readonly string[]).includes(value);
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export function toInvoice(raw: unknown): PayoutInvoice | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Row;
  if (!isInvoiceStatus(k.status) || !k.id) return null;
  return { id: String(k.id), status: k.status, reviewNote: String(k.review_note ?? ""), documentId: str(k.document_id), submittedAt: str(k.submitted_at ?? k.created_at), reviewedAt: str(k.reviewed_at) };
}

/** Normaliza a resposta de talent_payouts (0072 + 0082). */
export function toEarnings(data: unknown): Earning[] {
  if (!Array.isArray(data)) return [];
  return (data as Row[]).map((p) => ({
    id: String(p.id),
    dealId: String(p.deal_id ?? ""),
    dealTalentId: String(p.deal_talent_id ?? ""),
    agencyId: String(p.agency_id ?? ""),
    dealTitle: String(p.deal_title ?? ""),
    brandName: String(p.brand_name ?? ""),
    status: isEntryStatus(p.status) ? p.status : "planned",
    amountCents: Number(p.amount_cents ?? 0) || 0,
    dueOn: str(p.due_on),
    scheduledOn: str(p.scheduled_on),
    settledAt: str(p.settled_at),
    delivered: p.delivered === true,
    invoice: toInvoice(p.invoice),
  }));
}

/** A nota que vale de uma lista (embed do financeiro da agência): a aberta (enviada ou aprovada, no máximo uma);
 *  sem aberta, a mais recente. Mesma regra do banco (talent_payouts / talent_today). */
export function latestInvoice(list: unknown): PayoutInvoice | null {
  if (!Array.isArray(list)) return null;
  const items = list.map(toInvoice).filter((x): x is PayoutInvoice => x !== null);
  const open = (x: PayoutInvoice) => (x.status === "rejected" ? 1 : 0);
  items.sort((a, b) => open(a) - open(b) || (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "") || b.id.localeCompare(a.id));
  return items[0] ?? null;
}

/** Situação do pagamento para o influenciador (e para o Adm, na mesma linguagem). */
export function payStep(e: { status: EntryStatus; scheduledOn: string | null; invoice: Pick<PayoutInvoice, "status"> | null }): PayStep {
  if (e.status === "settled") return "paid";
  if (e.status === "cancelled") return "cancelled";
  if (e.scheduledOn) return "scheduled";
  if (e.invoice?.status === "submitted") return "invoice_sent";
  if (e.invoice?.status === "approved") return "invoice_approved";
  return "awaiting_invoice";
}

/** Grupo do painel de ganhos; null = cancelado (fora dos totais). */
export function earningGroup(e: Pick<Earning, "status" | "delivered">): EarningGroup | null {
  if (e.status === "settled") return "paid";
  if (e.status === "cancelled") return null;
  return e.delivered ? "receivable" : "forecast";
}

/** Data prevista do pagamento: a agendada; sem ela, o vencimento previsto. */
export function expectedPayDate(e: Pick<Earning, "scheduledOn" | "dueOn">): string | null {
  return e.scheduledOn ?? e.dueOn;
}

/** O influenciador pode enviar nota? Repasse aberto e sem nota enviada/aprovada. */
export function canSendInvoice(e: Pick<Earning, "status" | "invoice">): boolean {
  if (e.status !== "planned" && e.status !== "due") return false;
  return e.invoice === null || e.invoice.status === "rejected";
}

export type EarningTotals = Record<EarningGroup, { cents: number; count: number }>;

export function earningTotals(items: Pick<Earning, "status" | "delivered" | "amountCents">[]): EarningTotals {
  const out: EarningTotals = { receivable: { cents: 0, count: 0 }, forecast: { cents: 0, count: 0 }, paid: { cents: 0, count: 0 } };
  for (const e of items) {
    const g = earningGroup(e);
    if (!g) continue;
    out[g].cents += Math.max(0, Math.trunc(e.amountCents));
    out[g].count += 1;
  }
  return out;
}

/** Ordem da lista: o que pede ação primeiro (a receber sem nota), depois por data prevista; pagos e cancelados no fim. */
export function sortEarnings<T extends Earning>(items: T[]): T[] {
  const rank = (e: Earning) => {
    const g = earningGroup(e);
    if (g === "receivable") return canSendInvoice(e) ? 0 : 1;
    if (g === "forecast") return 2;
    if (g === "paid") return 3;
    return 4;
  };
  const date = (e: Earning) => (e.status === "settled" ? (e.settledAt ?? "") : (expectedPayDate(e) ?? "9999-12-31"));
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    // pagos: o mais recente primeiro; os demais: a data mais próxima primeiro
    return a.status === "settled" ? date(b).localeCompare(date(a)) : date(a).localeCompare(date(b)) || a.id.localeCompare(b.id);
  });
}

/** Data de pagamento aceita pelo banco (hoje até 366 dias), comparando dias civis YYYY-MM-DD. */
export function validPayDate(day: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  const d = Date.parse(`${day}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(t)) return false;
  const diff = Math.round((d - t) / 86_400_000);
  return diff >= 0 && diff <= 366;
}
