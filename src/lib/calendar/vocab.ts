import { z } from "zod";

// Agenda (0067): tipos de evento iguais ao check de calendar_events. Manuais: reunião, gravação, data comercial, outro.
export const EVENT_KINDS = ["campaign", "deliverable", "consult_deadline", "meeting", "recording", "commercial_date", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
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
