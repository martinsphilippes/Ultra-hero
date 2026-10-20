// Esquema do perfil editável da personalidade (colunas liberadas pelo guard do banco:
// headline, bio, avatar_url, cover_url, socials). Compartilhado por formulário e action.
import { z } from "zod";
import { SAME_ORIGIN_PATH } from "@/components/editors/content/schema";

const samePath = z
  .string()
  .trim()
  .max(300, { error: "tooLong" })
  .refine((v) => v === "" || SAME_ORIGIN_PATH.test(v), { error: "invalidCover" });

export const creatorProfileSchema = z.object({
  headline: z.string().trim().max(120, { error: "tooLong" }),
  bio: z.string().trim().max(1200, { error: "tooLong" }),
  avatar_url: samePath,
  cover_url: samePath,
  socials: z.object({
    instagram: z.string().trim().max(80, { error: "tooLong" }),
    youtube: z.string().trim().max(120, { error: "tooLong" }),
    site: z.string().trim().max(200, { error: "tooLong" }),
  }),
});

export type CreatorProfileValues = z.infer<typeof creatorProfileSchema>;

export type ProfileParse = { ok: true; data: CreatorProfileValues } | { ok: false; errors: Record<string, string> };

export function parseCreatorProfile(values: unknown): ProfileParse {
  const result = creatorProfileSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Lê socials jsonb de forma tolerante. */
export function socialsFrom(raw: unknown): CreatorProfileValues["socials"] {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { instagram: s(r.instagram), youtube: s(r.youtube), site: s(r.site) };
}
