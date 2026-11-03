// Seletor de data em calendário (DatePicker / DateTimePicker de src/components/ui/date-picker.tsx): lógica pura,
// testada em tests/unit/date-picker.test.ts.
// - Datas são SEMPRE chaves de texto "YYYY-MM-DD" (e "YYYY-MM-DDTHH:mm", o mesmo formato do datetime-local): nada de
//   new Date("YYYY-MM-DD"), que o JavaScript lê como meia-noite UTC e no Brasil vira o dia anterior. A aritmética de
//   dias usa Date.UTC só como calculadora (plusDays), sem fuso.
// - A grade reaproveita monthWeeks da agenda, mas começa no DOMINGO (padrão dos calendários no Brasil) e tem sempre
//   6 semanas, para a caixa não mudar de altura ao trocar de mês.
// - min/max aceitam data ou data-hora; só a parte da data limita os dias.

import { daysInMonth, monthWeeks, weekdayIndex, type GridDay } from "./grid";
import { plusDays, shiftMonth } from "./ics";

const pad = (n: number) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

export const PICKER_WEEK_START = 0;

/** "YYYY-MM-DD" válido (inclusive o dia existir no mês). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return d <= daysInMonth(y, m);
}

/** "YYYY-MM-DDTHH:mm" válido (aceita segundos no fim, que o datetime-local às vezes traz, e os ignora). */
export function isDateTimeKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATETIME_RE.exec(value.slice(0, 16));
  return !!m && isDateKey(m[1]);
}

/** Parte da data de um valor de data ou data-hora; "" quando não é válida. */
export function datePart(value: string | null | undefined): string {
  const head = (value ?? "").slice(0, 10);
  return isDateKey(head) ? head : "";
}

/** Separa "YYYY-MM-DDTHH:mm" em data e hora ("" no que faltar). */
export function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  const v = value ?? "";
  if (isDateTimeKey(v)) return { date: v.slice(0, 10), time: v.slice(11, 16) };
  return { date: datePart(v), time: "" };
}

/** Junta data e hora; sem data, "". Sem hora, usa a hora padrão. */
export function joinDateTime(date: string, time: string, fallbackTime = "09:00"): string {
  if (!isDateKey(date)) return "";
  const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallbackTime;
  return `${date}T${t}`;
}

/** Hoje no relógio do aparelho (hora local), como chave. */
export function localTodayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Dia fora do intervalo permitido (min/max inclusivos; só a parte da data conta). */
export function isOutOfRange(day: string, min?: string | null, max?: string | null): boolean {
  const lo = datePart(min);
  const hi = datePart(max);
  return (!!lo && day < lo) || (!!hi && day > hi);
}

/** Traz um dia para dentro de min/max. */
export function clampDay(day: string, min?: string | null, max?: string | null): string {
  const lo = datePart(min);
  const hi = datePart(max);
  if (lo && day < lo) return lo;
  if (hi && day > hi) return hi;
  return day;
}

/** Grade do seletor: sempre 6 semanas × 7 dias, começando no domingo. */
export function pickerWeeks(year: number, month: number): GridDay[][] {
  const weeks = monthWeeks(year, month, PICKER_WEEK_START);
  while (weeks.length < 6) {
    const lastDay = weeks[weeks.length - 1][6].date;
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = plusDays(lastDay, i + 1);
        return { date, day: Number(date.slice(8, 10)), inMonth: false };
      }),
    );
  }
  return weeks;
}

/** Mês ({year, month}) de uma chave de dia. */
export function monthOf(day: string): { year: number; month: number } {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** Mesmo dia N meses depois/antes, preso ao fim do mês (31/jan + 1 mês = 28 ou 29/fev). */
export function addMonthsToDay(day: string, delta: number): string {
  const { year, month } = shiftMonth(Number(day.slice(0, 4)), Number(day.slice(5, 7)), delta);
  const d = Math.min(Number(day.slice(8, 10)), daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(d)}`;
}

/**
 * Dia em foco ao abrir: o valor escolhido; senão hoje; sempre trazido para dentro de min/max (ex.: "data de
 * pagamento" com min = hoje abre em hoje; "data da medição" com max = hoje também).
 */
export function initialFocusDay(value: string | null | undefined, today: string, min?: string | null, max?: string | null): string {
  const chosen = datePart(value);
  return clampDay(chosen || today, min, max);
}

/** Mês que a caixa mostra ao abrir (o do dia em foco). */
export function initialView(value: string | null | undefined, today: string, min?: string | null, max?: string | null): { year: number; month: number } {
  return monthOf(initialFocusDay(value, today, min, max));
}

/** Pode navegar para o mês anterior/próximo sem sair de min/max? */
export function canShowMonth(year: number, month: number, min?: string | null, max?: string | null): boolean {
  const key = `${year}-${pad(month)}`;
  const lo = datePart(min);
  const hi = datePart(max);
  return !(lo && key < lo.slice(0, 7)) && !(hi && key > hi.slice(0, 7));
}

/**
 * Próximo dia em foco pela tecla: setas ±1 dia / ±1 semana (atravessando o mês: a caixa acompanha), Home/End início
 * e fim da semana (domingo a sábado), PageUp/PageDown ±1 mês (Shift: ±1 ano). Sempre dentro de min/max.
 * Tecla desconhecida: null.
 */
export function pickerMoveFocus(current: string, key: string, options: { shiftKey?: boolean; min?: string | null; max?: string | null } = {}): string | null {
  let next: string;
  switch (key) {
    case "ArrowLeft":
      next = plusDays(current, -1);
      break;
    case "ArrowRight":
      next = plusDays(current, 1);
      break;
    case "ArrowUp":
      next = plusDays(current, -7);
      break;
    case "ArrowDown":
      next = plusDays(current, 7);
      break;
    case "Home":
      next = plusDays(current, -weekdayIndex(current, PICKER_WEEK_START));
      break;
    case "End":
      next = plusDays(current, 6 - weekdayIndex(current, PICKER_WEEK_START));
      break;
    case "PageUp":
      next = addMonthsToDay(current, options.shiftKey ? -12 : -1);
      break;
    case "PageDown":
      next = addMonthsToDay(current, options.shiftKey ? 12 : 1);
      break;
    default:
      return null;
  }
  return clampDay(next, options.min, options.max);
}

/** Opções de minutos em passos (padrão 5), incluindo o minuto atual do valor se ele não cair no passo. */
export function minuteOptions(step = 5, current?: string): string[] {
  const list: string[] = [];
  for (let m = 0; m < 60; m += step) list.push(pad(m));
  if (current && /^[0-5]\d$/.test(current) && !list.includes(current)) {
    list.push(current);
    list.sort();
  }
  return list;
}

/** "00" … "23". */
export function hourOptions(): string[] {
  return Array.from({ length: 24 }, (_, h) => pad(h));
}
