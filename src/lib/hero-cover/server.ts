import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_CACHE_SECONDS } from "@/lib/avatar/server";
import type { Database } from "@/lib/supabase/database.types";
import { COVER_BUCKET } from "./constants";
import { publicCoverUrl, storedCoverPath } from "./paths";

// Operações de Storage da capa do herói (0042), sempre com o service role (o bucket não aceita
// escrita pela API com JWT de usuário). Mesmo desenho da foto de perfil (lib/avatar/server).

type Admin = SupabaseClient<Database>;

/** Teto de capas apagadas por execução do cron. */
export const COVER_CLEANUP_LIMIT = 100;

/** Grava o objeto no caminho reservado por hero_cover_upload_claim (imutável: sem upsert). Cache de 1 h, como a foto. */
export async function storeCover(admin: Admin, input: { path: string; bytes: Uint8Array; mime: string }): Promise<void> {
  const { error } = await admin.storage.from(COVER_BUCKET).upload(input.path, input.bytes, {
    contentType: input.mime,
    cacheControl: String(AVATAR_CACHE_SECONDS),
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

/** Marca o envio como apagado (deixa de contar como pendente para a limpeza diária). */
export async function markCoverDeleted(admin: Admin, path: string): Promise<void> {
  await admin.from("hero_cover_uploads").update({ deleted_at: new Date().toISOString() }).eq("path", path).is("deleted_at", null);
}

/**
 * Tira a capa do ar: primeiro limpa a referência no perfil do herói, depois apaga o objeto e marca o
 * envio. Se o Storage falhar, o envio fica pendente sem referência e a limpeza diária tenta de novo.
 */
export async function releaseStoredCover(admin: Admin, input: { url: string; baseUrl: string }): Promise<{ unlinked: boolean; deleted: boolean }> {
  const path = storedCoverPath(input.url, input.baseUrl);
  if (!path) return { unlinked: false, deleted: false };
  const { error: unlinkError } = await admin.from("creator_profiles").update({ cover_url: null }).eq("cover_url", input.url);
  if (unlinkError) return { unlinked: false, deleted: false };
  const { error } = await admin.storage.from(COVER_BUCKET).remove([path]);
  if (error) return { unlinked: true, deleted: false };
  await markCoverDeleted(admin, path);
  return { unlinked: true, deleted: true };
}

export type CoverCleanupResult = { covers_deleted: number; covers_errors: number; covers_rows_purged: number };

/** Registro de envio já apagado sai depois de 2 dias (a cota olha só as últimas 24 h). */
const PURGE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Limpeza diária (cron de retenção): capas sem referência há mais de 1 h e capas de conta excluída
 * (hero_cover_orphan_uploads, 0042). A referência que ainda aponta para elas sai antes; os objetos
 * saem em lote; só então os envios são marcados. Por fim, registros apagados há 2 dias saem.
 */
export async function cleanupHeroCoverUploads(admin: Admin, baseUrl: string | null, now: Date = new Date()): Promise<CoverCleanupResult> {
  const result: CoverCleanupResult = { covers_deleted: 0, covers_errors: 0, covers_rows_purged: 0 };
  // sem a base não dá para achar as referências: apagar o objeto deixaria imagem quebrada
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL ausente");
  const { data, error } = await admin.rpc("hero_cover_orphan_uploads", { p_limit: COVER_CLEANUP_LIMIT });
  if (error) throw new Error(error.message);
  const paths = (data ?? []).filter((p): p is string => typeof p === "string");

  if (paths.length > 0) {
    const urls = paths.map((p) => publicCoverUrl(baseUrl, p));
    const { error: unlinkError } = await admin.from("creator_profiles").update({ cover_url: null }).in("cover_url", urls);
    if (unlinkError) {
      result.covers_errors = paths.length;
    } else {
      const { error: removeError } = await admin.storage.from(COVER_BUCKET).remove(paths);
      if (removeError) {
        result.covers_errors = paths.length;
      } else {
        const { error: markError } = await admin.from("hero_cover_uploads").update({ deleted_at: now.toISOString() }).in("path", paths).is("deleted_at", null);
        if (markError) result.covers_errors = paths.length;
        else result.covers_deleted = paths.length;
      }
    }
  }
  const cutoff = new Date(now.getTime() - PURGE_AFTER_MS).toISOString();
  const { data: purged, error: purgeError } = await admin.from("hero_cover_uploads").delete().not("deleted_at", "is", null).lt("created_at", cutoff).select("id");
  result.covers_rows_purged = purgeError ? 0 : (purged ?? []).length;
  return result;
}
