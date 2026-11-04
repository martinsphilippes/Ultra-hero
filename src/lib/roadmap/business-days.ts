// Dias úteis BR (espelho de public.br_* da 0107; lógica pura, testável). Segunda a sexta, fora os feriados nacionais
// (fixos + móveis pela Páscoa: Carnaval seg/ter, Paixão de Cristo, Corpus Christi). É a lista "Feriados Nacionais"
// do Calendário Groscove; aniversários de cidades/estados não param a agência. Datas sempre "AAAA-MM-DD" (sem fuso).

import type { DueRule } from "./vocab";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parse(day: string): Date {
  if (!ISO.test(day)) throw new Error(`data inválida: ${day}`);
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(day: string, days: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Domingo de Páscoa (algoritmo anônimo gregoriano). */
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const holidayCache = new Map<number, Map<string, string>>();

/** Feriados nacionais do ano: data → nome. */
export function brHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const e = easter(year);
  const y = String(year);
  const list: [string, string][] = [
    [`${y}-01-01`, "Confraternização Universal"],
    [shift(e, -48), "Carnaval"],
    [shift(e, -47), "Carnaval"],
    [shift(e, -2), "Paixão de Cristo"],
    [`${y}-04-21`, "Tiradentes"],
    [`${y}-05-01`, "Dia do Trabalho"],
    [shift(e, 60), "Corpus Christi"],
    [`${y}-09-07`, "Independência do Brasil"],
    [`${y}-10-12`, "Nossa Senhora Aparecida"],
    [`${y}-11-02`, "Finados"],
    [`${y}-11-15`, "Proclamação da República"],
    [`${y}-11-20`, "Consciência Negra"],
    [`${y}-12-25`, "Natal"],
  ];
  const map = new Map(list);
  holidayCache.set(year, map);
  return map;
}

export function isBusinessDay(day: string): boolean {
  const d = parse(day);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !brHolidays(d.getUTCFullYear()).has(day);
}

/** Próximo dia útil DEPOIS do dia dado. */
export function nextBusinessDay(day: string): string {
  let d = shift(day, 1);
  while (!isBusinessDay(d)) d = shift(d, 1);
  return d;
}

/** O próprio dia, se útil; senão o próximo útil. */
export function rollBusinessDay(day: string): string {
  return isBusinessDay(day) ? day : nextBusinessDay(day);
}

/** Anda n dias úteis para a frente (n <= 0 devolve o próprio dia). */
export function addBusinessDays(day: string, n: number): string {
  let d = day;
  for (let i = 0; i < n; i++) d = nextBusinessDay(d);
  return d;
}

/** Dias úteis no intervalo (de, até]; 0 quando até <= de. */
export function businessDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let count = 0;
  let d = from;
  while (d < to) {
    d = shift(d, 1);
    if (isBusinessDay(d)) count++;
  }
  return count;
}

/** "Dia X" do roteiro: o início (rolado para dia útil) é o Dia 1; antes dele, 0. */
export function roadmapDay(startedOn: string, today: string): number {
  const start = rollBusinessDay(startedOn);
  if (today < start) return 0;
  return 1 + businessDaysBetween(start, today);
}

// ---------------------------------------------------------------- planejamento (espelho de public.roadmap_recalc)
export type PlanStep = {
  dueRule: DueRule;
  dueDays: number;
  dependsOnPrev: boolean;
  automatic?: boolean;
  /** Etapa já concluída nesse dia (AAAA-MM-DD). */
  completedOn?: string | null;
};
export type PlannedStep = { availableOn: string; dueOn: string; done: boolean };

/**
 * Prazos de cada etapa a partir do início (Dia 1). Etapa de n dias úteis começa no próximo dia útil depois do fim da
 * anterior e vence n−1 dias úteis depois; "mesmo dia" vence no dia em que a anterior termina; "em paralelo" começa junto
 * com a anterior. Concluída termina na data real; aberta e vencida "termina hoje" para as seguintes. Automática alcançada
 * (todas as anteriores concluídas) conclui hoje.
 */
export function planRoadmap(steps: PlanStep[], startedOn: string, today: string): PlannedStep[] {
  const out: PlannedStep[] = [];
  let next = rollBusinessDay(startedOn);
  let prevStart = next;
  let last = null as string | null;
  let allDone = true;
  for (const s of steps) {
    const avail = s.dueRule === "same_day" ? (last ?? next) : s.dependsOnPrev ? next : prevStart;
    const due = s.dueRule === "same_day" ? avail : addBusinessDays(avail, Math.max(s.dueDays, 1) - 1);
    let end: string;
    if (s.completedOn) {
      end = s.completedOn;
      out.push({ availableOn: avail, dueOn: due, done: true });
    } else if (s.automatic && allDone) {
      end = today;
      out.push({ availableOn: avail, dueOn: due > today ? due : today, done: true });
    } else {
      allDone = false;
      end = due > today ? due : today;
      out.push({ availableOn: avail, dueOn: due, done: false });
    }
    prevStart = avail;
    last = last === null || end > last ? end : last;
    next = nextBusinessDay(last);
  }
  return out;
}

/** Total do roteiro em dias úteis (último prazo contado a partir do Dia 1), sem nada concluído. */
export function plannedTotal(steps: PlanStep[], startedOn = "2027-03-01"): number {
  if (steps.length === 0) return 0;
  const plan = planRoadmap(
    steps.map((s) => ({ ...s, completedOn: null, automatic: false })),
    startedOn,
    "1900-01-01",
  );
  const last = plan.reduce<string>((max, p) => (p.dueOn > max ? p.dueOn : max), plan[0].dueOn);
  return roadmapDay(startedOn, last);
}
