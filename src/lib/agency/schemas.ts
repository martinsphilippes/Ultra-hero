import { z } from "zod";
import { AGENCY_ROLES, BRAND_ROLES } from "./roles";

// Formas dos formulários do módulo (o banco confere de novo: os checks e as RPCs são a regra).

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const daysSchema = z.coerce.number().int().min(1).max(30).catch(7);
export const justificationSchema = z.string().trim().min(5).max(500);

export const inviteMemberSchema = z.object({ email: emailSchema, role: z.enum(AGENCY_ROLES), days: daysSchema });
export const setRoleSchema = z.object({ userId: z.uuid(), role: z.enum(AGENCY_ROLES), justification: justificationSchema });
export const removeMemberSchema = z.object({ userId: z.uuid(), justification: justificationSchema });

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);
export const httpsUrl = z.string().trim().max(500).regex(/^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{2,5})?([/?#][^\s<>"]*)?$/);

export const brandCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug,
  siteUrl: httpsUrl,
  logoUrl: z.union([z.literal(""), httpsUrl]).optional(),
});
export const brandInviteSchema = z.object({ brandId: z.uuid(), email: emailSchema, role: z.enum(BRAND_ROLES), days: daysSchema });

export const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(64),
  relationshipAlertDays: z.coerce.number().int().min(7).max(365),
  contactEmail: z.union([z.literal(""), emailSchema]),
});

export const selfSchema = z.object({ displayName: z.string().trim().min(1).max(80), jobTitle: z.string().trim().max(80) });

/** Slug a partir do nome ("Marca Ótima Já" → "marca-otima-ja"). */
export function slugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
