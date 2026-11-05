import { zonedDayKey } from "@/lib/calendar/grid";
import { plusDays } from "@/lib/calendar/ics";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { EventKind } from "@/lib/calendar/vocab";
import { toZonedIso } from "@/lib/deals/schemas";
import { zonedTime } from "@/lib/calendar/form";
import { isHeroEventKind, type ChecklistItem, type HeroEventInput, type HeroEventKind } from "./vocab";

// Agenda do Hero independente (0094): lógica pura (testada em tests/unit/hero-work.test.ts).
// Reaproveita a grade mensal e a lista do dia da agenda das agências (CalendarEvent): o tipo do Hero vira um tipo
// da agenda (gravação, reunião, entrega, outro; "evento" e "serviço" são só do Hero) e o que ele precisa executar
// (observações, contratante, checklist) vai junto em `hero`. Itens de serviço com data entram sozinhos, uma vez só.

export type HeroEvent = {
  id: string;
  creatorId: string;
  kind: HeroEventKind;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
  notes: string;
  client: string;
  serviceId: string | null;
  checklist: ChecklistItem[];
  updatedAt: string;
};

/** Data de um serviço (sem valor): vem do financeiro (titular) ou de hero_service_dates (equipe). */
export type ServiceDate = { id: string; title: string; client: string; serviceOn: string };

/** Tipo da agenda para cada tipo do Hero. */
export const HERO_KIND_TO_EVENT_KIND: Record<HeroEventKind, EventKind> = {
  shoot: "recording",
  event: "hero_event",
  meeting: "meeting",
  delivery: "deliverable",
  other: "other",
};

/** Marca de item do Hero dentro do evento da grade (o que a lista do dia mostra a mais). */
export type HeroAgendaExtra = {
  /** compromisso do Hero (editável pelo titular) ou data de serviço (só leitura, abre o financeiro). */
  source: "event" | "service";
  heroKind: HeroEventKind | null;
  client: string;
  notes: string;
  checklist: ChecklistItem[];
  serviceId: string | null;
};

export type HeroCalendarEvent = CalendarEvent & { hero: HeroAgendaExtra };

const base = (): Omit<CalendarEvent, "id" | "kind" | "title" | "startsAt" | "endsAt" | "allDay" | "location" | "description" | "updatedAt"> => ({
  subtitle: "",
  brandId: null,
  dealId: null,
  talentId: null,
  deliverableId: null,
  sponsorshipId: null,
  source: "manual",
  visibleToBrand: false,
  visibleToTalent: false,
});

export function eventToCalendar(e: HeroEvent): HeroCalendarEvent {
  return {
    ...base(),
    id: e.id,
    kind: HERO_KIND_TO_EVENT_KIND[e.kind],
    title: e.title,
    subtitle: e.client,
    description: e.notes,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    location: e.location,
    updatedAt: e.updatedAt,
    hero: { source: "event", heroKind: e.kind, client: e.client, notes: e.notes, checklist: e.checklist, serviceId: e.serviceId },
  };
}

/** Data de serviço → item de dia inteiro, no fuso do Hero (fim exclusivo, como os eventos de dia inteiro). */
export function serviceDateToCalendar(s: ServiceDate, timeZone: string): HeroCalendarEvent | null {
  const startsAt = toZonedIso(s.serviceOn, "00:00", timeZone);
  const endsAt = toZonedIso(plusDays(s.serviceOn, 1), "00:00", timeZone);
  if (!startsAt || !endsAt) return null;
  return {
    ...base(),
    id: `service:${s.id}`,
    kind: "hero_service",
    title: s.title,
    subtitle: s.client,
    description: "",
    startsAt,
    endsAt,
    allDay: true,
    location: "",
    updatedAt: startsAt,
    source: "system",
    hero: { source: "service", heroKind: null, client: s.client, notes: "", checklist: [], serviceId: s.id },
  };
}

/**
 * Junta compromissos e datas de serviço. Um serviço que já tem compromisso vinculado (service_id) não aparece de novo
 * como data: o compromisso diz o que fazer naquele dia e leva o serviço junto.
 */
export function mergeAgenda(events: readonly HeroEvent[], services: readonly ServiceDate[], timeZone: string): HeroCalendarEvent[] {
  const linked = new Set(events.map((e) => e.serviceId).filter((x): x is string => Boolean(x)));
  const out: HeroCalendarEvent[] = events.map(eventToCalendar);
  for (const s of services) {
    if (linked.has(s.id)) continue;
    const item = serviceDateToCalendar(s, timeZone);
    if (item) out.push(item);
  }
  return out.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.title.localeCompare(b.title));
}

/** Itens concluídos / total do checklist. */
export function checklistProgress(items: readonly ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** Marca/desmarca o item (índice inválido não muda nada). */
export function toggleChecklist(items: readonly ChecklistItem[], index: number): ChecklistItem[] {
  return items.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
}

/** Compromisso novo: no dia escolhido (ou hoje), 09:00–10:00, tipo "outro". */
export function newHeroEventDefaults(creatorId: string, day: string | null | undefined, today: string): HeroEventInput {
  const date = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  return { id: null, creatorId, kind: "other", title: "", date, endDate: "", startTime: "09:00", endTime: "10:00", allDay: false, location: "", notes: "", client: "", serviceId: "", checklist: [] };
}

/** Compromisso salvo → formulário (data/hora locais). Dia inteiro tem fim exclusivo: a data final é o dia anterior ao fim. */
export function heroEventToInput(e: HeroEvent, timeZone: string): HeroEventInput {
  const start = new Date(e.startsAt).getTime();
  const endRaw = new Date(e.endsAt).getTime();
  const end = Number.isFinite(endRaw) && endRaw >= start ? endRaw : start;
  const date = zonedDayKey(start, timeZone);
  let endDate: string;
  let startTime = "09:00";
  let endTime = "10:00";
  if (e.allDay) {
    const last = end > start ? zonedDayKey(end - 1, timeZone) : date;
    endDate = last > date ? last : "";
  } else {
    const last = zonedDayKey(end, timeZone);
    endDate = last > date ? last : "";
    startTime = zonedTime(start, timeZone);
    endTime = zonedTime(end, timeZone);
  }
  return {
    id: e.id,
    creatorId: e.creatorId,
    kind: e.kind,
    title: e.title,
    date,
    endDate,
    startTime,
    endTime,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    client: e.client,
    serviceId: e.serviceId ?? "",
    checklist: e.checklist,
  };
}

/** Formulário → instantes (ISO com deslocamento). Dia inteiro: meia-noite do dia → meia-noite do dia seguinte ao último. Fim antes do início → null. */
export function heroEventRange(input: Pick<HeroEventInput, "date" | "endDate" | "startTime" | "endTime" | "allDay">, timeZone: string): { startsAt: string; endsAt: string } | null {
  const endDate = input.endDate || input.date;
  if (endDate < input.date) return null;
  const startsAt = input.allDay ? toZonedIso(input.date, "00:00", timeZone) : toZonedIso(input.date, input.startTime || "09:00", timeZone);
  const endsAt = input.allDay ? toZonedIso(plusDays(endDate, 1), "00:00", timeZone) : toZonedIso(endDate, input.endTime || input.startTime || "09:00", timeZone);
  if (!startsAt || !endsAt) return null;
  if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) return null;
  return { startsAt, endsAt };
}

type EventRow = {
  id: string;
  creator_profile_id: string;
  kind: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  notes: string;
  client: string;
  service_id: string | null;
  checklist: unknown;
  updated_at: string;
};

/** Checklist cru (jsonb) → itens válidos (o banco já valida; aqui só normaliza o que vier). */
export function toChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistItem[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
      out.push({ text: (item as { text: string }).text, done: (item as { done?: unknown }).done === true });
    }
  }
  return out;
}

export function toHeroEvent(r: EventRow): HeroEvent {
  return {
    id: r.id,
    creatorId: r.creator_profile_id,
    kind: isHeroEventKind(r.kind) ? r.kind : "other",
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    location: r.location ?? "",
    notes: r.notes ?? "",
    client: r.client ?? "",
    serviceId: r.service_id,
    checklist: toChecklist(r.checklist),
    updatedAt: r.updated_at,
  };
}

/** Próximo compromisso a partir de agora (o que ainda não terminou), para o resumo do Perfil. */
export function nextEvent<E extends { startsAt: string; endsAt: string; allDay: boolean }>(events: readonly E[], now: Date): E | null {
  let best: E | null = null;
  for (const e of events) {
    if (new Date(e.endsAt).getTime() < now.getTime() || (e.allDay && new Date(e.endsAt).getTime() <= now.getTime())) continue;
    if (!best || new Date(e.startsAt).getTime() < new Date(best.startsAt).getTime()) best = e;
  }
  return best;
}
