// Calendário em grade (bloco 9): lógica pura, sem React nem servidor, testada em tests/unit/calendar-grid.test.ts.
// - Semanas do mês sempre começando na SEGUNDA (decisão: vale para os três idiomas; só os nomes dos dias seguem
//   o idioma). A grade tem 4 a 6 semanas completas, com os dias dos meses vizinhos marcados como fora do mês.
// - Dias são chaves "YYYY-MM-DD" no fuso de quem lê (agência: fuso dela; marca/creator: fuso padrão).
// - Evento de vários dias aparece em cada dia que cobre. Dia inteiro tem fim exclusivo (meia-noite do dia
//   seguinte, mesma convenção do .ics e de saveEventAction); com hora, o fim é inclusivo, mas um fim exatamente à
//   meia-noite não "vaza" para o dia seguinte. Teto de 92 dias por evento para nunca explodir a grade.

import { plusDays } from "./ics";

export type GridDay = { date: string; day: number; inMonth: boolean };
/** edgesOnly (0098): evento longo do Calendário Groscove (temporada) aparece só no primeiro e no último dia. */
export type GridEvent = { startsAt: string; endsAt: string; allDay: boolean; edgesOnly?: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const MAX_SPAN_DAYS = 92;

/** Chave de dia (YYYY-MM-DD) de um instante num fuso IANA. */
export function zonedDayKey(value: string | number | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 0 = semana começando no domingo (seletor de data, padrão BR); 1 = na segunda (agenda). */
export type WeekStart = 0 | 1;

/** Posição do dia na semana (0…6) para o início de semana dado. Chave YYYY-MM-DD lida sem fuso (UTC puro). */
export function weekdayIndex(date: string, weekStart: WeekStart): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() - weekStart + 7) % 7;
}

/** Dia da semana de uma chave YYYY-MM-DD com segunda = 0 … domingo = 6. */
export function mondayIndex(date: string): number {
  return weekdayIndex(date, 1);
}

/** Dias do mês (28 a 31). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Semanas que cobrem o mês (por padrão de segunda a domingo); cada semana com 7 dias. */
export function monthWeeks(year: number, month: number, weekStart: WeekStart = 1): GridDay[][] {
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
  const start = plusDays(first, -weekdayIndex(first, weekStart));
  const end = plusDays(last, 6 - weekdayIndex(last, weekStart));
  const weeks: GridDay[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const week: GridDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: cursor, day: Number(cursor.slice(8, 10)), inMonth: cursor.slice(0, 7) === first.slice(0, 7) });
      cursor = plusDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Primeiro e último dia visíveis na grade do mês (para a consulta pegar os vizinhos também). */
export function gridRange(year: number, month: number): { first: string; last: string } {
  const weeks = monthWeeks(year, month);
  return { first: weeks[0][0].date, last: weeks[weeks.length - 1][6].date };
}

/** Dias (chaves no fuso) que um evento ocupa, do primeiro ao último, no máximo MAX_SPAN_DAYS. */
export function eventDays(event: GridEvent, timeZone: string): string[] {
  const start = new Date(event.startsAt).getTime();
  const endRaw = new Date(event.endsAt).getTime();
  const firstDay = zonedDayKey(start, timeZone);
  // fim exclusivo para dia inteiro e para "termina à meia-noite": recua 1 ms; nunca antes do início
  const end = Number.isFinite(endRaw) && endRaw > start ? endRaw - 1 : start;
  const lastDay = zonedDayKey(end, timeZone);
  if (event.edgesOnly) return lastDay > firstDay ? [firstDay, lastDay] : [firstDay];
  const days = [firstDay];
  let cursor = firstDay;
  while (cursor < lastDay && days.length < MAX_SPAN_DAYS) {
    cursor = plusDays(cursor, 1);
    days.push(cursor);
  }
  return days;
}

/**
 * Agrupa eventos por dia no fuso. Dentro do dia: dia inteiro primeiro, depois pelo horário de início, depois pelo
 * título (ordem estável). Com `range`, só os dias dentro dele entram.
 */
export function groupEventsByDay<E extends GridEvent & { title?: string }>(events: readonly E[], timeZone: string, range?: { first: string; last: string }): Map<string, E[]> {
  const map = new Map<string, E[]>();
  for (const e of events) {
    for (const day of eventDays(e, timeZone)) {
      if (range && (day < range.first || day > range.last)) continue;
      const list = map.get(day);
      if (list) list.push(e);
      else map.set(day, [e]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || (a.title ?? "").localeCompare(b.title ?? ""));
  }
  return map;
}

/** Tipos distintos de uma lista, na ordem em que aparecem (para os pontos coloridos do dia). */
export function distinctKinds<K extends string>(events: readonly { kind: K }[], max = Infinity): K[] {
  const out: K[] = [];
  for (const e of events) if (!out.includes(e.kind) && out.length < max) out.push(e.kind);
  return out;
}

export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/**
 * Próximo dia focado pela tecla (setas: ±1 dia / ±1 semana; Home/End: início/fim da semana). Fica preso à grade
 * visível (sem trocar de mês pelo teclado: as setas do mês fazem isso). Tecla desconhecida: null.
 */
export function moveFocus(current: string, key: string, range: { first: string; last: string }): string | null {
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
      next = plusDays(current, -mondayIndex(current));
      break;
    case "End":
      next = plusDays(current, 6 - mondayIndex(current));
      break;
    default:
      return null;
  }
  if (next < range.first || next > range.last) return current;
  return next;
}

/** Dia selecionado ao abrir o mês: o pedido (se estiver na grade), hoje (se no mês), o 1º dia com evento, ou o dia 1. */
export function initialDay(year: number, month: number, today: string, daysWithEvents: Iterable<string>, requested?: string | null): string {
  const key = `${year}-${pad(month)}`;
  const range = gridRange(year, month);
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= range.first && requested <= range.last) return requested;
  if (today.slice(0, 7) === key) return today;
  const inMonth = [...daysWithEvents].filter((d) => d.slice(0, 7) === key).sort();
  return inMonth[0] ?? `${key}-01`;
}

/** Intervalo ISO para a consulta (inclui um dia de folga de cada lado da grade por causa dos fusos). */
export function queryRange(year: number, month: number): { from: string; to: string } {
  const { first, last } = gridRange(year, month);
  const [fy, fm, fd] = first.split("-").map(Number);
  const [ly, lm, ld] = last.split("-").map(Number);
  return { from: new Date(Date.UTC(fy, fm - 1, fd - 1)).toISOString(), to: new Date(Date.UTC(ly, lm - 1, ld + 2)).toISOString() };
}
