import { z } from "zod";
import { REGISTRY_TYPES, SERVICE_KINDS, SERVICE_MODES, SPECIALTIES, UFS } from "./rules";

// Formas dos formulários de profissionais e serviços (portal e admin). O banco confere de novo.

export const serviceSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000),
  kind: z.enum(SERVICE_KINDS),
  mode: z.enum(SERVICE_MODES),
  duration_minutes: z.number().int().min(15).max(480).nullable(),
  plan_weeks: z.number().int().min(1).max(52).nullable(),
  price_cents: z.number().int().min(500).max(10_000_000),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(1000),
});
export type ServiceValues = z.infer<typeof serviceSchema>;

const REGISTRY_NUMBER = /^[0-9A-Za-z./-]{2,20}$/;
const photo = z.union([z.literal(""), z.string().trim().max(500).regex(/^https:\/\//)]);

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  photo_url: photo,
  bio: z.string().trim().max(2000),
  cities: z.string().trim().max(600),
  online: z.boolean(),
  registry_number: z.string().trim().regex(REGISTRY_NUMBER),
  registry_uf: z.enum(UFS),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const adminProfileSchema = profileSchema.extend({
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  specialty: z.enum(SPECIALTIES),
  registry_type: z.enum(REGISTRY_TYPES),
  sort_order: z.number().int().min(0).max(1000),
});
export type AdminProfileValues = z.infer<typeof adminProfileSchema>;

/** "São Paulo, Campinas" → ["São Paulo", "Campinas"] (até 10). */
export function splitCities(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 10);
}
