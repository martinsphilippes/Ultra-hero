// Esquema do perfil editável da personalidade (headline, bio, avatar_url, socials). Compartilhado por
// formulário e action. A capa (cover_url) não passa por aqui: só entra e sai pelo envio de foto real
// (cover-actions, 0042); um cover_url que chegue (aba antiga) é descartado pelo zod e não é gravado.
import { z } from "zod";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";

// Avatar: nenhum ("") ou a foto enviada (bucket avatars, 0031); ilustração não é mais aceita. Dono
// e "é a atual" a action confere.
const noneOrPhoto = z
  .string()
  .trim()
  .max(300, { error: "tooLong" })
  .refine((v) => v === "" || isStoredAvatarUrl(v, supabaseBaseUrl()), { error: "invalidCover" });

// avatar_url ausente = "avatar inalterado": a action mantém o valor do banco. Assim um formulário com
// estado velho (a foto mudou na mesma página) não regrava nem apaga a foto.
export const creatorProfileSchema = z.object({
  headline: z.string().trim().max(120, { error: "tooLong" }),
  bio: z.string().trim().max(1200, { error: "tooLong" }),
  avatar_url: noneOrPhoto.optional(),
  socials: z.object({
    instagram: z.string().trim().max(80, { error: "tooLong" }),
    youtube: z.string().trim().max(120, { error: "tooLong" }),
    site: z.string().trim().max(200, { error: "tooLong" }),
  }),
});

/** O que a action recebe: avatar_url só se alguém o mandar (o formulário nunca manda). */
export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;

/** Estado do formulário: texto e redes (foto e capa têm envio próprio, já aplicado no servidor). */
export type CreatorProfileValues = Omit<CreatorProfileInput, "avatar_url">;

/** O que o formulário envia: nunca o avatar nem a capa (a action mantém os do banco). */
export function creatorProfilePayload(values: CreatorProfileValues): CreatorProfileInput {
  return { headline: values.headline, bio: values.bio, socials: values.socials };
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
