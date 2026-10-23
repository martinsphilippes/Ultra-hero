// Esquema do perfil editável da personalidade (colunas liberadas pelo guard do banco:
// headline, bio, avatar_url, cover_url, socials). Compartilhado por formulário e action.
import { z } from "zod";
import { SAME_ORIGIN_PATH } from "@/components/editors/content/schema";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";

const samePath = z
  .string()
  .trim()
  .max(300, { error: "tooLong" })
  .refine((v) => v === "" || SAME_ORIGIN_PATH.test(v), { error: "invalidCover" });

// Avatar: caminho local ou a foto enviada (bucket avatars, 0031). Dono e "é a atual" a action confere.
const samePathOrPhoto = z
  .string()
  .trim()
  .max(300, { error: "tooLong" })
  .refine((v) => v === "" || SAME_ORIGIN_PATH.test(v) || isStoredAvatarUrl(v, supabaseBaseUrl()), { error: "invalidCover" });

// avatar_url ausente = "avatar inalterado": a action mantém o valor do banco. Assim um formulário com
// estado velho (a foto mudou em Dados, na mesma página) não regrava nem apaga a foto.
export const creatorProfileSchema = z.object({
  headline: z.string().trim().max(120, { error: "tooLong" }),
  bio: z.string().trim().max(1200, { error: "tooLong" }),
  avatar_url: samePathOrPhoto.optional(),
  cover_url: samePath,
  socials: z.object({
    instagram: z.string().trim().max(80, { error: "tooLong" }),
    youtube: z.string().trim().max(120, { error: "tooLong" }),
    site: z.string().trim().max(200, { error: "tooLong" }),
  }),
});

/** O que a action recebe: avatar_url só quando a pessoa mexeu no avatar. */
export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;

/** Estado do formulário: sempre com o avatar à vista. */
export type CreatorProfileValues = Omit<CreatorProfileInput, "avatar_url"> & { avatar_url: string };

/** O que o formulário envia: o avatar só quando a pessoa mexeu nele (sem ele, a action mantém o do banco). */
export function creatorProfilePayload(values: CreatorProfileValues, avatarTouched: boolean): CreatorProfileInput {
  if (avatarTouched) return values;
  const rest: CreatorProfileInput = { ...values };
  delete rest.avatar_url;
  return rest;
}

export type ProfileParse = { ok: true; data: CreatorProfileInput } | { ok: false; errors: Record<string, string> };

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
