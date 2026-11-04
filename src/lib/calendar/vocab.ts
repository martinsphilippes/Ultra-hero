import { z } from "zod";

// Agenda (0067): tipos de evento iguais ao check de calendar_events. Manuais: reunião, gravação, data comercial, outro.
// 0085: oportunidade de patrocínio (evento de sistema mantido pela oportunidade).
// 0089: chamada da marca — só na agenda da agência (gestor+), montada pela tela a partir das chamadas do alvo; não
// existe em calendar_events nem no feed .ics.
// 0094: agenda do herói independente — "evento" e "serviço" (data de um serviço cadastrado no financeiro) são só da
// tela do herói (montados no servidor; não existem em calendar_events nem nos filtros da agência).
// 0098: "institutional" = Calendário Groscove (agenda central da plataforma; filtro próprio, fora do filtro de tipo).
export const EVENT_KINDS = ["campaign", "deliverable", "consult_deadline", "meeting", "recording", "commercial_date", "other", "sponsorship", "brand_call", "hero_event", "hero_service", "institutional"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** Tipos que só a agenda do herói usa (fora do filtro de tipo da agência). */
export const HERO_ONLY_EVENT_KINDS: readonly EventKind[] = ["hero_event", "hero_service"];
/** Tipos fora do filtro "Tipo" da agência (o Calendário Groscove tem filtro próprio). */
export const NON_FILTER_EVENT_KINDS: readonly EventKind[] = [...HERO_ONLY_EVENT_KINDS, "institutional"];
export const MANUAL_EVENT_KINDS = ["meeting", "recording", "commercial_date", "other"] as const;
export type ManualEventKind = (typeof MANUAL_EVENT_KINDS)[number];

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === "string" && (EVENT_KINDS as readonly string[]).includes(value);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]);

/** Formulário de evento manual: data + hora locais (fuso da agência) ou dia inteiro. */
export const eventSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(MANUAL_EVENT_KINDS),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  location: z.string().trim().max(200),
  date: isoDate,
  endDate: z.union([z.literal(""), isoDate]),
  startTime: time,
  endTime: time,
  allDay: z.boolean(),
  dealId: z.union([z.literal(""), z.uuid()]),
  talentId: z.union([z.literal(""), z.uuid()]),
  brandId: z.union([z.literal(""), z.uuid()]),
  visibleToBrand: z.boolean(),
  visibleToTalent: z.boolean(),
});
export type EventInput = z.input<typeof eventSchema>;
