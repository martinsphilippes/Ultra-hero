// "A pagar" do Hero-cliente e "a receber" da agência por Hero-cliente (0111, D5): leitura das RPCs client_payments
// e agency_client_receivables (lógica pura, testável). Valores simulados em centavos; nada é cobrança real.

export type ClientInstallment = { id: string; seq: number; amountCents: number; dueOn: string | null; status: "open" | "paid"; paidAt: string | null };
export type ClientReceivable = {
  entryId: string;
  dealId: string;
  title: string;
  talentName: string;
  agencyName: string;
  totalCents: number;
  entryStatus: "forecast" | "planned" | "due" | "settled";
  dueOn: string | null;
  method: string | null;
  methodNote: string;
  notes: string;
  installments: ClientInstallment[];
};

type Row = Record<string, unknown>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown) => (typeof v === "string" && ISO.test(v.slice(0, 10)) ? v.slice(0, 10) : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toClientReceivables(raw: unknown): ClientReceivable[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Row[])
    .filter((r) => r && typeof r === "object" && typeof r.entry_id === "string")
    .map((r) => {
      const plan = r.plan && typeof r.plan === "object" ? (r.plan as Row) : null;
      const status = str(r.entry_status);
      return {
        entryId: str(r.entry_id),
        dealId: str(r.deal_id),
        title: str(r.title),
        talentName: str(r.talent_name),
        agencyName: str(r.agency_name),
        totalCents: int(r.total_cents),
        entryStatus: status === "forecast" || status === "due" || status === "settled" ? status : "planned",
        dueOn: day(r.due_on),
        method: plan && typeof plan.method === "string" ? plan.method : null,
        methodNote: plan ? str(plan.method_note) : "",
        notes: plan ? str(plan.notes) : "",
        installments: (Array.isArray(r.installments) ? (r.installments as Row[]) : []).map((i) => ({
          id: str(i.id),
          seq: int(i.seq),
          amountCents: int(i.amount_cents),
          dueOn: day(i.due_on),
          status: i.status === "paid" ? "paid" : "open",
          paidAt: typeof i.paid_at === "string" ? i.paid_at : null,
        })),
      } satisfies ClientReceivable;
    });
}

/** Situação de uma parcela para a tela: paga, vencida, vence hoje, em aberto ou prevista. */
export function installmentState(entryStatus: ClientReceivable["entryStatus"], i: ClientInstallment, today: string): "paid" | "late" | "today" | "open" | "forecast" {
  if (i.status === "paid") return "paid";
  if (entryStatus === "forecast") return "forecast";
  if (i.dueOn && i.dueOn < today) return "late";
  if (i.dueOn === today) return "today";
  return "open";
}

/** Quanto falta pagar (parcelas abertas). */
export function openCents(r: ClientReceivable): number {
  return r.installments.filter((i) => i.status === "open").reduce((sum, i) => sum + i.amountCents, 0);
}
