import "server-only";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { listPlatformEvents, platformToCalendar } from "./queries";
import { filterAgenda, type AgendaFilters } from "./vocab";

/**
 * Calendário Groscove do mês para a agenda de um portal (0098): só o que está no ar, já como itens da grade, mais as
 * coleções presentes no mês (para o filtro). Junta com os compromissos próprios e aplica os filtros (tudo / só
 * Groscove / só meus, território, coleção).
 */
export async function groscoveForAgenda(range: { from: string; to: string }, filters: AgendaFilters): Promise<{ events: CalendarEvent[]; collections: string[] }> {
  if (filters.mode === "mine") return { events: [], collections: [] };
  const list = await listPlatformEvents({ ...range, published: true });
  const events = list.items.map(platformToCalendar);
  const collections = [...new Set(events.map((e) => e.platform?.collection).filter((x): x is string => Boolean(x)))].sort();
  if (filters.collection && !collections.includes(filters.collection)) collections.push(filters.collection);
  return { events, collections };
}

/** Junta compromissos próprios e o Calendário Groscove, aplica os filtros e ordena pelo início. */
export function mergeWithGroscove<E extends CalendarEvent>(own: readonly E[], groscove: readonly CalendarEvent[], filters: AgendaFilters): (E | CalendarEvent)[] {
  return filterAgenda<E | CalendarEvent>([...own, ...groscove], filters).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
