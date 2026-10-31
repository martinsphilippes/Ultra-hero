"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACTING_HERO_COOKIE, ACTING_HERO_MAX_AGE } from "@/lib/acting-hero/constants";
import { actingClient, getActingHero } from "@/lib/acting-hero/server";
import { agencyFail } from "@/lib/agency/errors";
import { requireAgency } from "@/lib/agency/server";
import { getUser } from "@/lib/auth/session";
import { AVATAR_BUCKET, MAX_UPLOAD_BYTES, toAvatarError, type AvatarError } from "@/lib/avatar/constants";
import { publicAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { markAvatarDeleted, storeAvatar } from "@/lib/avatar/server";
import { validateUploadBytes } from "@/lib/avatar/validation";
import { hasUploadRights } from "@/lib/partner-terms/server";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { PILLARS, rpcErrorCode, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Heróis da agência (0070): gestor+ cria e edita o perfil, escolhe o herói em nome de quem publica
// (auditado) e troca a foto dele. O banco confere o vínculo agência ↔ herói em cada chamada.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const pillars = z.array(z.enum(PILLARS as [Pillar, ...Pillar[]])).min(1).max(4);
const heroSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60),
  pillars,
  headline: z.string().trim().max(160).optional().default(""),
  bio: z.string().trim().max(2000).optional().default(""),
});

function revalidateHeroes(slug?: string) {
  revalidatePath("/agencia/herois");
  revalidatePath("/personalities");
  if (slug) revalidatePath(`/personalities/${slug}`);
}

export async function createHeroAction(input: z.input<typeof heroSchema>): Promise<Result<{ id: string }>> {
  const ctx = await requireAgency("manager");
  const parsed = heroSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_create_hero", {
      p_agency: ctx.agency.id,
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_pillars: parsed.data.pillars,
      p_headline: parsed.data.headline,
      p_bio: parsed.data.bio,
    });
    if (error || typeof data !== "string") return agencyFail(error ?? "generic");
    revalidateHeroes(parsed.data.slug);
    return { ok: true, id: data };
  } catch (error) {
    return agencyFail(error);
  }
}

const updateSchema = heroSchema.omit({ slug: true }).extend({ id: z.uuid() });

export async function updateHeroAction(input: z.input<typeof updateSchema>): Promise<Result> {
  await requireAgency("manager");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("agency_update_hero", {
      p_creator: parsed.data.id,
      p_name: parsed.data.name,
      p_pillars: parsed.data.pillars,
      p_headline: parsed.data.headline,
      p_bio: parsed.data.bio,
    });
    if (error) return agencyFail(error);
    const { data: hero } = await supabase.from("creator_profiles").select("slug").eq("id", parsed.data.id).maybeSingle();
    revalidateHeroes(hero?.slug);
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}

// Escolher o herói (auditado no banco); o cookie só lembra a escolha, o banco confere a cada requisição.
export async function chooseHeroAction(heroId: string): Promise<Result> {
  await requireAgency("manager");
  const parsed = z.uuid().safeParse(heroId);
  if (!parsed.success) return agencyFail("invalid_input");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("agency_act_as_hero", { p_creator: parsed.data });
    if (error) return agencyFail(error);
    if ((data as { id?: string } | null)?.id !== parsed.data) return agencyFail("generic");
    (await cookies()).set(ACTING_HERO_COOKIE, parsed.data, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACTING_HERO_MAX_AGE,
    });
    return { ok: true };
  } catch (error) {
    return agencyFail(error);
  }
}

// ---------------------------------------------------------------- foto do herói escolhido
// Mesmo desenho da foto de perfil (0031): bytes conferidos no servidor, envio reservado na cota de quem
// envia, gravado pelo service role e aplicado só no herói escolhido (hero_avatar_set). A foto anterior
// fica sem referência e sai na limpeza diária.
export type HeroAvatarResult = { ok: true; avatarUrl: string | null } | { ok: false; error: AvatarError };

const fileSchema = z
  .instanceof(Blob)
  .refine((f) => f.size > 0, "empty_file")
  .refine((f) => f.size <= MAX_UPLOAD_BYTES, "file_too_large");

function avatarFailure(error: { code?: string; message?: string } | null): AvatarError {
  if (!error) return "generic";
  if (error.code === "PGRST202" || error.code === "42883") return "avatar_not_configured";
  return toAvatarError(rpcErrorCode(error.message));
}

export async function uploadHeroAvatarAction(formData: FormData): Promise<HeroAvatarResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const acting = await getActingHero();
  if (acting.status !== "ok") return { ok: false, error: "generic" };
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "avatar_not_configured" };
  const parsed = fileSchema.safeParse(formData.get("file"));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { ok: false, error: code === "empty_file" || code === "file_too_large" ? code : "not_image" };
  }
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  const check = validateUploadBytes(bytes);
  if (!check.ok) return { ok: false, error: check.error };
  try {
    const supabase = await actingClient(acting.hero.id);
    // Termos do Parceiro (0068): quem envia confirma os direitos antes do primeiro envio
    if (!(await hasUploadRights(supabase, user.id))) return { ok: false, error: UPLOAD_RIGHTS_REQUIRED };
    const { data: path, error: claimError } = await supabase.rpc("avatar_upload_claim", { p_bytes: bytes.length, p_mime: check.image.mime });
    if (claimError || typeof path !== "string") return { ok: false, error: avatarFailure(claimError) };
    if (!path.startsWith(`${user.id}/`)) return { ok: false, error: "generic" };
    const admin = createAdminClient();
    try {
      await storeAvatar(admin, { path, bytes, mime: check.image.mime });
    } catch {
      return { ok: false, error: "upload_failed" };
    }
    const url = publicAvatarUrl(base, path);
    const { error: setError } = await supabase.rpc("hero_avatar_set", { p_url: url });
    if (setError) {
      const { error: removeError } = await admin.storage.from(AVATAR_BUCKET).remove([path]);
      if (!removeError) await markAvatarDeleted(admin, path);
      return { ok: false, error: avatarFailure(setError) };
    }
    revalidateHeroes(acting.hero.slug);
    return { ok: true, avatarUrl: url };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export async function removeHeroAvatarAction(): Promise<HeroAvatarResult> {
  const acting = await getActingHero();
  if (acting.status !== "ok") return { ok: false, error: "generic" };
  try {
    const supabase = await actingClient(acting.hero.id);
    const { error } = await supabase.rpc("hero_avatar_clear");
    if (error) return { ok: false, error: avatarFailure(error) };
    revalidateHeroes(acting.hero.slug);
    return { ok: true, avatarUrl: null };
  } catch {
    return { ok: false, error: "generic" };
  }
}
