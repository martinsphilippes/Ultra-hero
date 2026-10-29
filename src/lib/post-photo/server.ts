import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_CACHE_SECONDS } from "@/lib/avatar/server";
import type { Database } from "@/lib/supabase/database.types";
import { POST_PHOTO_BUCKET } from "./constants";
import { publicPostPhotoUrl } from "./paths";

// Operações de Storage da foto do post (0043), sempre com o service role (o bucket não aceita
// escrita pela API com JWT de usuário). Mesmo desenho da capa do herói (lib/hero-cover/server).

type Admin = SupabaseClient<Database>;

/** Teto de fotos apagadas por execução do cron. */
export const POST_PHOTO_CLEANUP_LIMIT = 100;

/** Grava o objeto no caminho reservado por post_photo_upload_claim (imutável: sem upsert). */
export async function storePostPhoto(admin: Admin, input: { path: string; bytes: Uint8Array; mime: string }): Promise<void> {
  const { error } = await admin.storage.from(POST_PHOTO_BUCKET).upload(input.path, input.bytes, {
    contentType: input.mime,
    cacheControl: String(AVATAR_CACHE_SECONDS),
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

/** Apaga o objeto e marca o envio (só marca se saiu de fato; senão a limpeza diária tenta de novo). */
export async function removePostPhoto(admin: Admin, path: string): Promise<boolean> {
  const { error } = await admin.storage.from(POST_PHOTO_BUCKET).remove([path]);
  if (error) return false;
  await admin.from("post_photo_uploads").update({ deleted_at: new Date().toISOString() }).eq("path", path).is("deleted_at", null);
  return true;
}

export type PostPhotoCleanupResult = { post_photos_deleted: number; post_photos_errors: number; post_photos_rows_purged: number };

/** Registro de envio já apagado sai depois de 2 dias (a cota olha só a última hora). */
const PURGE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Limpeza diária (cron de retenção): fotos sem uso há mais de 1 h e fotos de conta excluída
 * (post_photo_orphan_uploads, 0043). As referências que ainda apontam para elas saem antes (capa do
 * conteúdo e corpo); os objetos saem em lote; só então os envios são marcados. Por fim, registros
 * apagados há 2 dias saem.
 */
export async function cleanupPostPhotoUploads(admin: Admin, baseUrl: string | null, now: Date = new Date()): Promise<PostPhotoCleanupResult> {
  const result: PostPhotoCleanupResult = { post_photos_deleted: 0, post_photos_errors: 0, post_photos_rows_purged: 0 };
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL ausente");
  const { data, error } = await admin.rpc("post_photo_orphan_uploads", { p_limit: POST_PHOTO_CLEANUP_LIMIT });
  if (error) throw new Error(error.message);
  const paths = (data ?? []).filter((p): p is string => typeof p === "string");

  if (paths.length > 0) {
    const urls = paths.map((p) => publicPostPhotoUrl(baseUrl, p));
    const { error: coverError } = await admin.from("content").update({ cover_url: null }).in("cover_url", urls);
    const { error: bodyError } = coverError
      ? { error: coverError }
      : await admin.from("content_bodies").update({ media_provider: "none", media_ref: null }).eq("media_provider", "upload").in("media_ref", paths);
    if (bodyError) {
      result.post_photos_errors = paths.length;
    } else {
      const { error: removeError } = await admin.storage.from(POST_PHOTO_BUCKET).remove(paths);
      if (removeError) {
        result.post_photos_errors = paths.length;
      } else {
        const { error: markError } = await admin.from("post_photo_uploads").update({ deleted_at: now.toISOString() }).in("path", paths).is("deleted_at", null);
        if (markError) result.post_photos_errors = paths.length;
        else result.post_photos_deleted = paths.length;
      }
    }
  }
  const cutoff = new Date(now.getTime() - PURGE_AFTER_MS).toISOString();
  const { data: purged, error: purgeError } = await admin.from("post_photo_uploads").delete().not("deleted_at", "is", null).lt("created_at", cutoff).select("id");
  result.post_photos_rows_purged = purgeError ? 0 : (purged ?? []).length;
  return result;
}
