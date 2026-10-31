import { z } from "zod";
import { AGE_BANDS, NETWORKS, UFS } from "@/lib/talent/vocab";
import { ACTIVITY_KINDS, AVAILABILITY_KINDS, DELIVERABLE_KINDS, FORMATS, OBJECTIVES, TALENT_RESPONSES } from "./vocab";

// Formas dos formulários do núcleo comercial (o banco confere de novo: checks e RPCs).

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = z.union([z.literal(""), isoDate]);

/** Entregável desejado pela marca: exatamente {kind, quantity, network?} (sem chave de valor). */
export const requestDeliverableSchema = z
  .object({
    kind: z.enum(DELIVERABLE_KINDS),
    quantity: z.number().int().min(1).max(100),
    network: z.enum(NETWORKS).nullable().optional(),
  })
  .strict();
export const requestDeliverablesSchema = z.array(requestDeliverableSchema).max(30);
export type RequestDeliverable = z.infer<typeof requestDeliverableSchema>;

/** "1.234,56" → 123456; vazio → null; inválido → undefined. */
export function parseBrlToCents(raw: string): number | null | undefined {
  const text = raw.trim().replace(/^R\$\s*/, "");
  if (text === "") return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return undefined;
  const [int, dec = ""] = text.replace(/\./g, "").split(",");
  const cents = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  return cents >= 0 && cents <= 10_000_000_000 ? cents : undefined;
}

export function formatCents(cents: number, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Deslocamento (minutos) de um fuso IANA num instante. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-11-10" + "14:30" no fuso dado → ISO com deslocamento ("2026-11-10T14:30:00-03:00"). Sem hora → null. */
export function toZonedIso(date: string, time: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // dois passos: o deslocamento pode mudar perto da virada do horário de verão
  let offset = offsetMinutes(guess, timeZone);
  offset = offsetMinutes(new Date(guess.getTime() - offset * 60_000), timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const brandRequestSchema = z.object({
  id: uuid.nullable(),
  talentId: z.union([z.literal(""), uuid]),
  title: z.string().trim().max(120),
  objective: z.union([z.literal(""), z.enum(OBJECTIVES)]),
  product: z.string().trim().max(300),
  targetAudience: z.string().trim().max(500),
  targetAgeBands: z.array(z.enum(AGE_BANDS)).max(6),
  targetStates: z.array(z.enum(UFS)).max(27),
  regionNote: z.string().trim().max(200),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  desiredTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
  durationMinutes: z.union([z.literal(""), z.coerce.number().int().min(15).max(14400)]),
  format: z.union([z.literal(""), z.enum(FORMATS)]),
  location: z.string().trim().max(200),
  networks: z.array(z.enum(NETWORKS)).max(11),
  deliverables: requestDeliverablesSchema,
  notes: z.string().trim().max(2000),
  /** Valor oferecido em centavos (null = não informado). */
  budgetMaxCents: z.number().int().min(0).max(10_000_000_000).nullable(),
  budgetNote: z.string().trim().max(300),
});
export type BrandRequestInput = z.input<typeof brandRequestSchema>;

export const dealCreateSchema = z.object({
  brandId: uuid,
  title: z.string().trim().min(3).max(120),
  talentBrief: z.string().trim().max(3000),
  expectedStart: optionalDate,
  expectedEnd: optionalDate,
  ownerId: z.union([z.literal(""), uuid]),
  notes: z.string().trim().max(2000),
});

export const dealUpdateSchema = z.object({
  dealId: uuid,
  title: z.string().trim().min(3).max(120),
  talentBrief: z.string().trim().max(3000),
  expectedStart: optionalDate,
  expectedEnd: optionalDate,
  ownerId: z.union([z.literal(""), uuid]).optional(),
});

export const dealMoveSchema = z.object({
  dealId: uuid,
  to: z.string(),
  outcome: z.enum(["won", "lost", "cancelled"]).nullable().optional(),
  note: z.string().trim().max(500),
  force: z.boolean().optional(),
});

export const deliverableItemSchema = z.object({
  id: uuid.nullable(),
  dealTalentId: uuid,
  kind: z.enum(DELIVERABLE_KINDS),
  network: z.union([z.literal(""), z.enum(NETWORKS)]),
  title: z.string().trim().max(120),
  brief: z.string().trim().max(1000),
  dueAt: z.union([z.literal(""), isoDate]),
  publishAt: z.union([z.literal(""), isoDate]),
});
export const deliverablesSchema = z.object({ dealId: uuid, items: z.array(deliverableItemSchema).max(60) });
export type DeliverableItemInput = z.input<typeof deliverableItemSchema>;

export const consultSchema = z.object({ dealId: uuid, dealTalentIds: z.array(uuid).min(1).max(30), days: z.number().int().min(1).max(30), message: z.string().trim().max(2000) });
export const respondSchema = z.object({ dealTalentId: uuid, response: z.enum(TALENT_RESPONSES), note: z.string().trim().max(500) });
export const recordResponseSchema = z.object({ dealTalentId: uuid, response: z.enum(TALENT_RESPONSES), note: z.string().trim().min(5).max(500) });
export const feeSchema = z.object({ dealTalentId: uuid, feeCents: z.number().int().min(0).max(10_000_000_000) });
export const messageSchema = z.object({ dealId: uuid, channel: z.enum(["brand_agency", "talent_agency"]), talentId: uuid.nullable(), body: z.string().trim().min(1).max(4000) });
export const activitySchema = z.object({ subjectType: z.enum(["deal", "talent", "brand"]), subjectId: uuid, kind: z.enum(ACTIVITY_KINDS), body: z.string().trim().min(1).max(4000) });
export const availabilitySchema = z.object({ talentId: uuid, id: uuid.nullable(), kind: z.enum(AVAILABILITY_KINDS), startsOn: isoDate, endsOn: isoDate, note: z.string().trim().max(200) });
export const confirmSchema = z.object({ dealId: uuid, note: z.string().trim().max(500), force: z.boolean() });
