import { zonedDayKey } from "@/lib/calendar/grid";

/** Volta para a agenda já no mês e no dia do evento (no fuso do evento). */
export function agendaBackHref(base: string, startsAt: string, timeZone: string): string {
  const day = zonedDayKey(startsAt, timeZone);
  return `${base}?mes=${day.slice(0, 7)}&dia=${day}`;
}
