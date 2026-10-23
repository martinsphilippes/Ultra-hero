"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AVATAR_BUCKET, MAX_UPLOAD_BYTES, toAvatarError, type AvatarError } from "@/lib/avatar/constants";
import { publicAvatarUrl, storedAvatarOwner, supabaseBaseUrl } from "@/lib/avatar/paths";
import { markAvatarDeleted, releaseStoredAvatar, storeAvatar } from "@/lib/avatar/server";
import { validateUploadBytes } from "@/lib/avatar/validation";
import { getUser } from "@/lib/auth/session";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Foto de perfil (0031): envio e remoção. Os bytes passam pelo servidor, que confere o tipo pelos
// magic bytes, reserva o envio no banco (cota e kill switch), grava no bucket público com o service
// role e aplica a URL no perfil e, se a pessoa é herói, no perfil público. Uma foto só por pessoa.

export type AvatarResult = { ok: true; avatarUrl: string | null } | { ok: false; error: AvatarError };

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Banco ainda sem a 0031 (função ou tabela ausente no PostgREST) = recurso não configurado.
function rpcFailure(error: { code?: string; message?: string } | null): AvatarError {
  if (!error) return "generic";
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") return "avatar_not_configured";
  return toAvatarError(rpcErrorCode(error.message));
}

// Telas que mostram o avatar da pessoa (cabeçalho em todo o app) e, se herói, o perfil público.
async function revalidateAvatar(supabase: Supabase, userId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/profile");
  const { data: hero } = await supabase.from("creator_profiles").select("slug").eq("user_id", userId).maybeSingle();
  if (hero?.slug) {
    revalidatePath("/creator");
    revalidatePath("/personalities");
    revalidatePath(`/personalities/${hero.slug}`);
  }
}

const uploadSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((f) => f.size > 0, "empty_file")
    .refine((f) => f.size <= MAX_UPLOAD_BYTES, "file_too_large"),
});

export async function uploadAvatar(formData: FormData): Promise<AvatarResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "avatar_not_configured" };

  const parsed = uploadSchema.safeParse({ file: formData.get("file") });
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { ok: false, error: code === "empty_file" || code === "file_too_large" ? code : "not_image" };
  }
  const bytes = new Uint8Array(await parsed.data.file.arrayBuffer());
  const check = validateUploadBytes(bytes);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    const supabase = await createClient();
    const { data: path, error: claimError } = await supabase.rpc("avatar_upload_claim", { p_bytes: bytes.length, p_mime: check.image.mime });
    if (claimError || typeof path !== "string") return { ok: false, error: rpcFailure(claimError) };
    // o caminho reservado começa pelo id de quem enviou; qualquer outra coisa é erro do banco
    if (!path.startsWith(`${user.id}/`)) return { ok: false, error: "generic" };

    const admin = createAdminClient();
    try {
      await storeAvatar(admin, { path, bytes, mime: check.image.mime });
    } catch (error) {
      console.warn("[avatar] envio ao Storage falhou:", error instanceof Error ? error.message : error);
      // Não marca como apagado: o objeto pode ter chegado (resposta perdida). Pendente e sem
      // referência, a limpeza diária o apaga depois de 1 h (remover objeto inexistente não dá erro).
      return { ok: false, error: "upload_failed" };
    }

    const url = publicAvatarUrl(base, path);
    const { data: previous, error: setError } = await supabase.rpc("avatar_set_photo", { p_url: url });
    if (setError) {
      // a foto nova não entrou no perfil: sai do bucket agora. Só marca se saiu de fato; senão o
      // envio fica pendente e a limpeza diária tenta de novo (envio marcado nunca volta à lista).
      const { error: removeError } = await admin.storage.from(AVATAR_BUCKET).remove([path]);
      if (!removeError) await markAvatarDeleted(admin, path);
      return { ok: false, error: rpcFailure(setError) };
    }

    // Fotos anteriores da própria pessoa saem do ar (melhor esforço; o que sobrar, o cron apaga).
    for (const prev of previous ?? []) {
      if (storedAvatarOwner(prev, base) === user.id) await releaseStoredAvatar(admin, { url: prev, baseUrl: base });
    }
    await revalidateAvatar(supabase, user.id);
    return { ok: true, avatarUrl: url };
  } catch (error) {
    console.warn("[avatar] envio falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}

// Sem entrada: remove a foto própria de onde ela estiver (perfil e herói). Ilustração não é tocada.
export async function removeAvatar(): Promise<AvatarResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const base = supabaseBaseUrl();
  if (!hasAdminClient() || !base) return { ok: false, error: "avatar_not_configured" };
  try {
    const supabase = await createClient();
    const [{ data: profile }, { data: hero }] = await Promise.all([
      supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
      supabase.from("creator_profiles").select("avatar_url").eq("user_id", user.id).maybeSingle(),
    ]);
    const photos = Array.from(new Set([profile?.avatar_url, hero?.avatar_url].filter((u): u is string => storedAvatarOwner(u, base) === user.id)));
    if (photos.length === 0) return { ok: true, avatarUrl: profile?.avatar_url ?? null };
    const admin = createAdminClient();
    const results = await Promise.all(photos.map((url) => releaseStoredAvatar(admin, { url, baseUrl: base })));
    // perfil ainda apontando para a foto: não diz que removeu
    if (results.some((r) => !r.unlinked)) return { ok: false, error: "generic" };
    // objeto que ficou no bucket já está sem referência: a limpeza diária apaga
    if (results.some((r) => !r.deleted)) console.warn("[avatar] objeto não apagado agora; a limpeza diária termina");
    await revalidateAvatar(supabase, user.id);
    return { ok: true, avatarUrl: null };
  } catch (error) {
    console.warn("[avatar] remoção falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "generic" };
  }
}
