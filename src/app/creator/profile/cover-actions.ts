"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { heroProfileFor } from "@/components/creator/hero-access";
import { heroRoleNames } from "@/lib/auth/talent-scope";
import { getRoles, getUser } from "@/lib/auth/session";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { COVER_BUCKET, COVER_MAX_UPLOAD_BYTES, toCoverError, type CoverError } from "@/lib/hero-cover/constants";
import { publicCoverUrl, storedCoverOwner } from "@/lib/hero-cover/paths";
import { markCoverDeleted, releaseStoredCover, storeCover } from "@/lib/hero-cover/server";
import { validateCoverBytes } from "@/lib/hero-cover/validation";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Capa do herói (0042): envio e remoção, no mesmo desenho da foto de perfil (avatar-actions). Os
// bytes passam pelo servidor, que confere tipo e proporção pelos magic bytes, reserva o envio no
// banco (herói ativo, cota e kill switch), grava no bucket público com o service role e aplica a URL
// no perfil do próprio herói ativo (hero_cover_set). A capa anterior, se era foto própria, sai do ar.

export type CoverResult = { ok: true; coverUrl: string | null } | { ok: false; error: CoverError };

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Banco ainda sem a 0042 (função ou tabela ausente no PostgREST) = recurso não configurado.
function rpcFailure(error: { code?: string; message?: string } | null): CoverError {
  if (!error) return "generic";
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") return "cover_not_configured";
  return toCoverError(rpcErrorCode(error.message));
}

// mesma regra da tela: herói (ou admin) com o perfil vinculado; o banco confere de novo (ativo e papel)
async function isHero(): Promise<boolean> {
  return heroProfileFor(heroRoleNames(await getRoles()), true) !== null;
}

async function revalidateCover(supabase: Supabase, userId: string) {
  revalidatePath("/profile");
  revalidatePath("/creator");
  revalidatePath("/personalities");
  const { data: hero } = await supabase.from("creator_profiles").select("slug").eq("user_id", userId).maybeSingle();
  if (hero?.slug) revalidatePath(`/personalities/${hero.slug}`);
}

const uploadSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((f) => f.size > 0, "empty_file")
    .refine((f) => f.size <= COVER_MAX_UPLOAD_BYTES, "file_too_large"),
});

export async function uploadHeroCover(formData: FormData): Promise<CoverResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!(await isHero())) return { ok: false, error: "not_a_hero" };
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "cover_not_configured" };

  const parsed = uploadSchema.safeParse({ file: formData.get("file") });
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { ok: false, error: code === "empty_file" || code === "file_too_large" ? code : "not_image" };
  }
  const bytes = new Uint8Array(await parsed.data.file.arrayBuffer());
  const check = validateCoverBytes(bytes);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    const supabase = await createClient();
    const { data: path, error: claimError } = await supabase.rpc("hero_cover_upload_claim", { p_bytes: bytes.length, p_mime: check.image.mime });
    if (claimError || typeof path !== "string") return { ok: false, error: rpcFailure(claimError) };
    // o caminho reservado começa pelo id de quem enviou; qualquer outra coisa é erro do banco
    if (!path.startsWith(`${user.id}/`)) return { ok: false, error: "generic" };

    const admin = createAdminClient();
    try {
      await storeCover(admin, { path, bytes, mime: check.image.mime });
    } catch (error) {
      console.warn("[cover] envio ao Storage falhou:", error instanceof Error ? error.message : error);
      // Não marca como apagado: o objeto pode ter chegado. Pendente e sem referência, a limpeza
      // diária o apaga depois de 1 h.
      return { ok: false, error: "upload_failed" };
    }

    const url = publicCoverUrl(base, path);
    const { data: previous, error: setError } = await supabase.rpc("hero_cover_set", { p_url: url });
    if (setError) {
      // a capa nova não entrou no perfil: sai do bucket agora (só marca se saiu de fato)
      const { error: removeError } = await admin.storage.from(COVER_BUCKET).remove([path]);
      if (!removeError) await markCoverDeleted(admin, path);
      return { ok: false, error: rpcFailure(setError) };
    }

    // capa anterior própria sai do ar (melhor esforço; o que sobrar, o cron apaga)
    if (typeof previous === "string" && storedCoverOwner(previous, base) === user.id) await releaseStoredCover(admin, { url: previous, baseUrl: base });
    await revalidateCover(supabase, user.id);
    return { ok: true, coverUrl: url };
  } catch (error) {
    console.warn("[cover] envio falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}

// Sem entrada: tira a capa do perfil do próprio herói ativo (foto enviada, oficial ou desenho antigo).
// Foto própria também sai do bucket; o resto só perde a referência.
export async function removeHeroCover(): Promise<CoverResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!(await isHero())) return { ok: false, error: "not_a_hero" };
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "cover_not_configured" };
  try {
    const supabase = await createClient();
    const { data: previous, error } = await supabase.rpc("hero_cover_clear");
    if (error) return { ok: false, error: rpcFailure(error) };
    if (typeof previous === "string" && storedCoverOwner(previous, base) === user.id) {
      const released = await releaseStoredCover(createAdminClient(), { url: previous, baseUrl: base });
      // objeto que ficou no bucket já está sem referência: a limpeza diária apaga
      if (!released.deleted) console.warn("[cover] objeto não apagado agora; a limpeza diária termina");
    }
    await revalidateCover(supabase, user.id);
    return { ok: true, coverUrl: null };
  } catch (error) {
    console.warn("[cover] remoção falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}
