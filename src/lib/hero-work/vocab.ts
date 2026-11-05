import { z } from "zod";

// Agenda e financeiro do Hero independente (0094): vocabulário e formulários (módulo puro, cliente e servidor).
// Tipos do compromisso = check de hero_events.kind; situação gravada do serviço = check de hero_services.status.
// "Vencido" NÃO é gravado: é calculado pela data de vencimento (ver finance.ts).

export const HERO_EVENT_KINDS = ["shoot", "event", "meeting", "delivery", "other"] as const;
export type HeroEventKind = (typeof HERO_EVENT_KINDS)[number];
export const HERO_SERVICE_STATUSES = ["receivable", "received", "cancelled"] as const;
export type HeroServiceStatus = (typeof HERO_SERVICE_STATUSES)[number];
/** O que a tela mostra: a situação gravada + "vencido" (a receber com o vencimento já passado). */
export type HeroServiceView = "receivable" | "received" | "overdue" | "cancelled";

export const MAX_CHECKLIST_ITEMS = 30;
export const PROOF_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
/** Teto de valor por serviço (centavos): igual ao check da tabela. */
export const MAX_SERVICE_CENTS = 100_000_000_000;

export function isHeroEventKind(value: unknown): value is HeroEventKind {
  return typeof value === "string" && (HERO_EVENT_KINDS as readonly string[]).includes(value);
}
export function isHeroServiceStatus(value: unknown): value is HeroServiceStatus {
  return typeof value === "string" && (HERO_SERVICE_STATUSES as readonly string[]).includes(value);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]);

export const checklistItemSchema = z.object({ text: z.string().trim().min(1).max(200), done: z.boolean() });
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/** Formulário do compromisso: data + hora locais (fuso padrão) ou dia inteiro; checklist com até 30 itens. */
export const heroEventSchema = z.object({
  id: z.uuid().nullable(),
  creatorId: z.uuid(),
  kind: z.enum(HERO_EVENT_KINDS),
  title: z.string().trim().min(1).max(160),
  date: isoDate,
  endDate: z.union([z.literal(""), isoDate]),
  startTime: time,
  endTime: time,
  allDay: z.boolean(),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  client: z.string().trim().max(120),
  serviceId: z.union([z.literal(""), z.uuid()]),
  checklist: z.array(checklistItemSchema).max(MAX_CHECKLIST_ITEMS),
});
export type HeroEventInput = z.input<typeof heroEventSchema>;

/** Formulário do serviço: valor em centavos (o MoneyInput entrega o texto; a tela converte). */
export const heroServiceSchema = z.object({
  id: z.uuid().nullable(),
  creatorId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  client: z.string().trim().min(1).max(120),
  serviceOn: isoDate,
  amountCents: z.number().int().min(0).max(MAX_SERVICE_CENTS),
  dueOn: z.union([z.literal(""), isoDate]),
  status: z.enum(HERO_SERVICE_STATUSES),
  receivedOn: z.union([z.literal(""), isoDate]),
  paymentNote: z.string().trim().max(500),
});
export type HeroServiceInput = z.input<typeof heroServiceSchema>;

/** Caminho do comprovante: <Hero>/<serviço>/<arquivo>.<ext> (o banco confere o prefixo do Hero). */
const PROOF_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;
export function isProofPath(path: string, creatorId: string, serviceId: string): boolean {
  return PROOF_PATH.test(path) && path.startsWith(`${creatorId}/${serviceId}/`);
}
export function proofExtension(mime: string): "pdf" | "jpg" | "png" | "webp" | null {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}
