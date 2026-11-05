import { plusDays } from "@/lib/calendar/ics";
import type { HeroServiceStatus, HeroServiceView } from "./vocab";

// Financeiro do Hero independente (0094): lógica pura, sem banco (testada em tests/unit/hero-work.test.ts).
// Tudo é registro/controle simulado: nada aqui movimenta dinheiro.
//
// Decisões:
//   • "Vencido" é calculado: serviço a receber com vencimento ANTERIOR a hoje (no dia do vencimento ainda é "a receber").
//     Sem vencimento nunca vence (fica "a receber" sem data e entra no grupo "sem vencimento" da previsão).
//   • Painel: "a receber" = a receber que ainda não venceu; "vencidos" = a receber vencido; "recebido no mês" = recebidos
//     cuja data de recebimento está no mês de hoje; "em aberto" = a receber + vencidos.
//   • Previsão 30/60/90: soma ACUMULADA do que está a receber (não vencido) e vence de hoje até hoje+N dias; o vencido
//     fica à parte (já deveria ter entrado) e o sem vencimento num balde próprio. Cancelado nunca entra em nada.
//   • "A receber este mês" (resumo do Perfil): em aberto (a receber + vencido) com vencimento dentro do mês de hoje.

export type HeroService = {
  id: string;
  creatorId: string;
  title: string;
  client: string;
  serviceOn: string;
  amountCents: number;
  dueOn: string | null;
  status: HeroServiceStatus;
  receivedOn: string | null;
  paymentNote: string;
  proofPath: string | null;
  proofMime: string | null;
};

/** Situação mostrada: a gravada, ou "vencido" quando a receber com vencimento antes de hoje (YYYY-MM-DD no fuso do Hero). */
export function effectiveStatus(s: Pick<HeroService, "status" | "dueOn">, today: string): HeroServiceView {
  if (s.status === "receivable" && s.dueOn && s.dueOn < today) return "overdue";
  return s.status;
}

/** Dias de atraso (0 se não está vencido). */
export function daysOverdue(s: Pick<HeroService, "status" | "dueOn">, today: string): number {
  if (effectiveStatus(s, today) !== "overdue" || !s.dueOn) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s.dueOn}T00:00:00Z`)) / 86_400_000);
}

export type FinanceSummary = {
  /** A receber que ainda não venceu (inclui sem vencimento). */
  receivableCents: number;
  receivableCount: number;
  overdueCents: number;
  overdueCount: number;
  /** Recebidos no mês de hoje. */
  receivedMonthCents: number;
  receivedMonthCount: number;
  /** Em aberto: a receber + vencidos. */
  openCents: number;
  /** Previsão acumulada do que vence de hoje até hoje+30/60/90 (a receber, não vencido). */
  forecast: { d30: number; d60: number; d90: number; noDueCents: number; noDueCount: number };
};

export function financeSummary(services: readonly HeroService[], today: string): FinanceSummary {
  const month = today.slice(0, 7);
  const lim30 = plusDays(today, 30);
  const lim60 = plusDays(today, 60);
  const lim90 = plusDays(today, 90);
  const out: FinanceSummary = {
    receivableCents: 0,
    receivableCount: 0,
    overdueCents: 0,
    overdueCount: 0,
    receivedMonthCents: 0,
    receivedMonthCount: 0,
    openCents: 0,
    forecast: { d30: 0, d60: 0, d90: 0, noDueCents: 0, noDueCount: 0 },
  };
  for (const s of services) {
    const view = effectiveStatus(s, today);
    if (view === "overdue") {
      out.overdueCents += s.amountCents;
      out.overdueCount += 1;
    } else if (view === "receivable") {
      out.receivableCents += s.amountCents;
      out.receivableCount += 1;
      if (!s.dueOn) {
        out.forecast.noDueCents += s.amountCents;
        out.forecast.noDueCount += 1;
      } else {
        if (s.dueOn <= lim30) out.forecast.d30 += s.amountCents;
        if (s.dueOn <= lim60) out.forecast.d60 += s.amountCents;
        if (s.dueOn <= lim90) out.forecast.d90 += s.amountCents;
      }
    } else if (view === "received" && s.receivedOn && s.receivedOn.slice(0, 7) === month) {
      out.receivedMonthCents += s.amountCents;
      out.receivedMonthCount += 1;
    }
  }
  out.openCents = out.receivableCents + out.overdueCents;
  return out;
}

/** "A receber este mês" do Perfil: em aberto (a receber + vencido) com vencimento no mês de hoje. */
export function dueThisMonth(services: readonly HeroService[], today: string): { cents: number; count: number } {
  const month = today.slice(0, 7);
  let cents = 0;
  let count = 0;
  for (const s of services) {
    const view = effectiveStatus(s, today);
    if ((view === "receivable" || view === "overdue") && s.dueOn && s.dueOn.slice(0, 7) === month) {
      cents += s.amountCents;
      count += 1;
    }
  }
  return { cents, count };
}

export type ServiceGroups = Record<HeroServiceView, HeroService[]>;

/**
 * Agrupa por situação mostrada e ordena dentro de cada grupo: vencidos (o mais antigo primeiro), a receber (vencimento
 * mais próximo primeiro, sem vencimento por último), recebidos (o mais recente primeiro) e cancelados (mais novos primeiro).
 */
export function groupServices(services: readonly HeroService[], today: string): ServiceGroups {
  const groups: ServiceGroups = { overdue: [], receivable: [], received: [], cancelled: [] };
  for (const s of services) groups[effectiveStatus(s, today)].push(s);
  const byTitle = (a: HeroService, b: HeroService) => a.title.localeCompare(b.title);
  groups.overdue.sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? "") || byTitle(a, b));
  groups.receivable.sort((a, b) => (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99") || a.serviceOn.localeCompare(b.serviceOn) || byTitle(a, b));
  groups.received.sort((a, b) => (b.receivedOn ?? "").localeCompare(a.receivedOn ?? "") || byTitle(a, b));
  groups.cancelled.sort((a, b) => b.serviceOn.localeCompare(a.serviceOn) || byTitle(a, b));
  return groups;
}

/** Ordem de exibição dos grupos (vencidos primeiro: é o que pede atenção). */
export const SERVICE_GROUP_ORDER: readonly HeroServiceView[] = ["overdue", "receivable", "received", "cancelled"];

/** Linha crua do banco (hero_services) → serviço. */
type ServiceRow = {
  id: string;
  creator_profile_id: string;
  title: string;
  client: string;
  service_on: string;
  amount_cents: number | string;
  due_on: string | null;
  status: string;
  received_on: string | null;
  payment_note: string;
  proof_path: string | null;
  proof_mime: string | null;
};
export function toHeroService(r: ServiceRow): HeroService {
  return {
    id: r.id,
    creatorId: r.creator_profile_id,
    title: r.title,
    client: r.client,
    serviceOn: r.service_on,
    amountCents: Number(r.amount_cents),
    dueOn: r.due_on,
    status: r.status === "received" || r.status === "cancelled" ? r.status : "receivable",
    receivedOn: r.received_on,
    paymentNote: r.payment_note ?? "",
    proofPath: r.proof_path,
    proofMime: r.proof_mime,
  };
}

/** "A receber este mês" do Hero com agência: repasse (cachê) aberto cuja data prevista (agendada, senão vencimento) cai no mês de hoje. */
export function earningsDueThisMonth(
  items: readonly { status: string; amountCents: number; scheduledOn: string | null; dueOn: string | null }[],
  today: string,
): { cents: number; count: number } {
  const month = today.slice(0, 7);
  let cents = 0;
  let count = 0;
  for (const e of items) {
    if (e.status !== "planned" && e.status !== "due") continue;
    const date = e.scheduledOn ?? e.dueOn;
    if (date && date.slice(0, 7) === month) {
      cents += Math.max(0, Math.trunc(e.amountCents));
      count += 1;
    }
  }
  return { cents, count };
}
