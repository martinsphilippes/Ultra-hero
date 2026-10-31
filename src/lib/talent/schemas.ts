import { z } from "zod";
import { emailSchema, httpsUrl } from "@/lib/agency/schemas";
import { AGE_BANDS, AVAILABILITIES, COMMERCIAL_STATUSES, GENDER_KEYS, KIT_FIELDS, NETWORKS, UFS } from "./vocab";

// Formas dos formulários do casting e do media kit (os checks e as RPCs da 0065 são a regra).

const bp = z.number().int().min(0).max(10000);

function groupSum(group: Record<string, number | undefined> | undefined): number {
  return Object.values(group ?? {}).reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

const uniqueList = <T extends z.ZodType<string>>(item: T) =>
  z
    .array(item)
    .max(5)
    .refine((list) => new Set(list).size === list.length, { message: "duplicate" });

/** Audiência declarada em pontos-base: cada grupo soma no máximo 10000; até 5 UFs e 5 países. */
export const audienceSchema = z
  .object({
    gender: z.partialRecord(z.enum(GENDER_KEYS), bp).optional(),
    age: z.partialRecord(z.enum(AGE_BANDS), bp).optional(),
    top_states: uniqueList(z.enum(UFS)).optional(),
    top_countries: uniqueList(z.string().regex(/^[A-Z]{2}$/)).optional(),
  })
  .strict()
  .refine((a) => groupSum(a.gender) <= 10000, { message: "gender_sum", path: ["gender"] })
  .refine((a) => groupSum(a.age) <= 10000, { message: "age_sum", path: ["age"] });
export type Audience = z.infer<typeof audienceSchema>;

const metric = z.number().int().min(0).max(1_000_000_000).nullable();

/** "AAAA-MM-DD" entre hoje − 2 anos e hoje (a mesma janela da RPC). */
export function asOfInRange(value: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) return false;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const min = new Date(todayUtc);
  min.setUTCFullYear(min.getUTCFullYear() - 2);
  return day.getTime() <= todayUtc && day.getTime() >= min.getTime();
}

export const handleSchema = z
  .string()
  .trim()
  .transform((h) => h.replace(/^@/, ""))
  .pipe(z.string().min(1).max(60).regex(/^\S+$/));

export const socialSchema = z.object({
  talentId: z.uuid(),
  id: z.uuid().nullable(),
  network: z.enum(NETWORKS),
  handle: handleSchema,
  url: z.union([z.literal(""), httpsUrl]),
  followers: metric,
  avgViews: metric,
  avgReach: metric,
  /** Pontos-base (2,35% = 235). */
  engagementBp: z.number().int().min(0).max(10000).nullable(),
  asOf: z.string().refine((v) => asOfInRange(v), { message: "as_of" }),
  audience: audienceSchema,
});
export type SocialInput = z.input<typeof socialSchema>;

export const kitSchema = z.object({
  talentId: z.uuid(),
  headline: z.string().trim().max(140),
  about: z.string().trim().max(1500),
  visibleFields: z.array(z.enum(KIT_FIELDS)).max(KIT_FIELDS.length),
});

export const shareKitSchema = z.object({ talentId: z.uuid(), days: z.number().int().min(1).max(90) });

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/);

export const talentSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60),
  state: z.union([z.literal(""), z.enum(UFS)]),
  managerId: z.union([z.literal(""), z.uuid()]),
  commercialStatus: z.enum(COMMERCIAL_STATUSES),
  availability: z.enum(AVAILABILITIES),
  availabilityNote: z.string().trim().max(280),
  contactEmail: z.union([z.literal(""), emailSchema]),
  contactPhone: z.union([z.literal(""), phone]),
  internalNotes: z.string().trim().max(2000),
  lastContactAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});
export type TalentInput = z.input<typeof talentSchema>;

/** "2,35" ou "2.35" (%) → 235 pontos-base; vazio → null; fora de 0–100 → undefined (inválido). */
export function percentToBp(raw: string): number | null | undefined {
  const text = raw.trim().replace("%", "").replace(",", ".");
  if (text === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return undefined;
  const value = Math.round(Number(text) * 100);
  return value >= 0 && value <= 10000 ? value : undefined;
}

/** Número digitado ("48.200", "48200") → inteiro; vazio → null; inválido → undefined. */
export function parseCount(raw: string): number | null | undefined {
  const text = raw.trim().replace(/[.\s]/g, "");
  if (text === "") return null;
  if (!/^\d{1,10}$/.test(text)) return undefined;
  const value = Number(text);
  return value <= 1_000_000_000 ? value : undefined;
}
