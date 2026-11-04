// Serviços recorrentes (0111, D2): espelho puro de public.recurrence_* e de deal_recurrence_generate (testado no
// vitest). Ciclo do contrato: semanal | quinzenal | mensal. Etapas recorrentes do roteiro em unidades de semana
// (semanal 1, quinzenal 2, mensal 4 — "4 pautas/mês"); a diária não se multiplica. Datas "AAAA-MM-DD".

import { addBusinessDays, rollBusinessDay } from "./business-days";
import type { StepRecurrence } from "./vocab";

export const CONTRACT_CYCLES = ["weekly", "biweekly", "monthly"] as const;
export type ContractCycle = (typeof CONTRACT_CYCLES)[number];
export const isContractCycle = (v: unknown): v is ContractCycle => typeof v === "string" && (CONTRACT_CYCLES as readonly string[]).includes(v);

/** Semanas por unidade; nulo para diária (não se multiplica). */
export function recurrenceUnits(r: StepRecurrence | ContractCycle | string | null | undefined): number | null {
  return r === "weekly" ? 1 : r === "biweekly" ? 2 : r === "monthly" ? 4 : null;
}

function parse(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Soma meses como o Postgres (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(day: string, n: number): string {
  const d = parse(day);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
}

/** Início do ciclo n (0 = o primeiro). */
export function cycleStart(cycle: ContractCycle, start: string, n: number): string {
  return cycle === "monthly" ? addMonths(start, n) : addDays(start, (cycle === "biweekly" ? 14 : 7) * n);
}

/** Ciclo que contém o dia (nulo antes do início ou a partir do fim). */
export function cycleAt(cycle: ContractCycle, start: string, end: string | null, day: string): number | null {
  if (day < start) return null;
  let n = 0;
  while (cycleStart(cycle, start, n + 1) <= day && n < 3000) n += 1;
  if (end && cycleStart(cycle, start, n) >= end) return null;
  return n;
}

/** Dias âncora das ocorrências de uma etapa no ciclo n (mesma regra do banco). */
export function cycleAnchors(step: StepRecurrence | null, cycle: ContractCycle, start: string, n: number, end: string | null = null): string[] {
  const s = recurrenceUnits(step);
  const c = recurrenceUnits(cycle);
  if (!s || !c) return [];
  if (s > c && n % (s / c) !== 0) return [];
  const from = cycleStart(cycle, start, n);
  const until = cycleStart(cycle, start, n + 1);
  const out: string[] = [];
  for (let k = 0; k < Math.max(Math.floor(c / s), 1); k += 1) {
    const anchor = addDays(from, 7 * s * k);
    if (anchor >= until || (end && anchor >= end)) break;
    out.push(anchor);
  }
  return out;
}

/** Disponível e vencimento de uma ocorrência: âncora rolada para dia útil + (prazo − 1) dias úteis. */
export function occurrenceDates(anchor: string, dueDays: number): { availableOn: string; dueOn: string } {
  const availableOn = rollBusinessDay(anchor);
  return { availableOn, dueOn: addBusinessDays(availableOn, Math.max(dueDays, 1) - 1) };
}
