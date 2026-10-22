import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { AVATAR_BUCKET } from "./constants";
import { publicAvatarUrl, storedAvatarPath } from "./paths";

// Operações de Storage da foto de perfil, sempre com o service role (o bucket não aceita escrita
// pela API com JWT de usuário). Usadas pelas actions de perfil e pelo cron de retenção.

type Admin = SupabaseClient<Database>;

/** Teto de fotos apagadas por execução do cron (a função da Vercel tem tempo limitado). */
export const AVATAR_CLEANUP_LIMIT = 100;

/**
 * Cache das cópias (navegador, CDN, otimizador do Next, que usa o max-age da origem): 1 h. Cada
 * envio tem caminho novo, então cache longo não ajuda a troca e manteria no ar por meses a foto
 * removida (moderação, exclusão de conta). O texto de privacidade promete "em até 1 h".
 */
export const AVATAR_CACHE_SECONDS = 3600;

/** Grava o objeto no caminho reservado por avatar_upload_claim (imutável: sem upsert). */
export async function storeAvatar(admin: Admin, input: { path: string; bytes: Uint8Array; mime: string }): Promise<void> {
  const { error } = await admin.storage.from(AVATAR_BUCKET).upload(input.path, input.bytes, {
    contentType: input.mime,
    cacheControl: String(AVATAR_CACHE_SECONDS),
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

/** Marca o envio como apagado (deixa de contar como pendente para a limpeza diária). */
export async function markAvatarDeleted(admin: Admin, path: string): Promise<void> {
  await admin.from("avatar_uploads").update({ deleted_at: new Date().toISOString() }).eq("path", path).is("deleted_at", null);
}

/**
 * Tira a foto do ar: primeiro limpa as referências (perfil e herói), depois apaga o objeto e marca
 * o envio. Referência antes do objeto evita mostrar imagem quebrada; se o Storage falhar, o envio
 * fica pendente sem referência e a limpeza diária tenta de novo.
 * unlinked: nenhum perfil aponta mais para a foto; deleted: o objeto saiu do bucket.
 */
export async function releaseStoredAvatar(admin: Admin, input: { url: string; baseUrl: string }): Promise<{ unlinked: boolean; deleted: boolean }> {
  const path = storedAvatarPath(input.url, input.baseUrl);
  if (!path) return { unlinked: false, deleted: false };
  const [profilesRes, creatorsRes] = await Promise.all([
    admin.from("profiles").update({ avatar_url: null }).eq("avatar_url", input.url),
    admin.from("creator_profiles").update({ avatar_url: null }).eq("avatar_url", input.url),
  ]);
  if (profilesRes.error || creatorsRes.error) return { unlinked: false, deleted: false };
  const { error } = await admin.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) return { unlinked: true, deleted: false };
  await markAvatarDeleted(admin, path);
  return { unlinked: true, deleted: true };
}

export type AvatarCleanupResult = { avatars_deleted: number; avatars_errors: number; avatars_rows_purged: number };

/** Registro de envio já apagado sai depois de 2 dias (a cota olha só as últimas 24 h). */
const PURGE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

async function purgeDeletedRows(admin: Admin, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_MS).toISOString();
  const { data, error } = await admin.from("avatar_uploads").delete().not("deleted_at", "is", null).lt("created_at", cutoff).select("id");
  return error ? 0 : (data ?? []).length;
}

/**
 * Limpeza diária (cron de retenção): envios sem referência há mais de 1 h e envios de conta
 * excluída (avatar_orphan_uploads, 0031). Referências que ainda apontam para eles (herói de conta
 * excluída) são limpas antes; os objetos saem em lote; só então os envios são marcados. Por fim,
 * registros já apagados com mais de 2 dias saem da tabela (o caminho traz o id da conta).
 */
export async function cleanupAvatarUploads(admin: Admin, baseUrl: string | null, now: Date = new Date()): Promise<AvatarCleanupResult> {
  const result: AvatarCleanupResult = { avatars_deleted: 0, avatars_errors: 0, avatars_rows_purged: 0 };
  // sem a base não dá para achar as referências: apagar o objeto deixaria imagem quebrada
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL ausente");
  const { data, error } = await admin.rpc("avatar_orphan_uploads", { p_limit: AVATAR_CLEANUP_LIMIT });
  if (error) throw new Error(error.message);
  const paths = (data ?? []).filter((p): p is string => typeof p === "string");

  if (paths.length > 0) {
    const urls = paths.map((p) => publicAvatarUrl(baseUrl, p));
    const [profilesRes, creatorsRes] = await Promise.all([
      admin.from("profiles").update({ avatar_url: null }).in("avatar_url", urls),
      admin.from("creator_profiles").update({ avatar_url: null }).in("avatar_url", urls),
    ]);
    if (profilesRes.error || creatorsRes.error) {
      result.avatars_errors = paths.length;
    } else {
      // Objeto que nunca chegou ao bucket (envio que falhou) não volta na lista nem dá erro: marca igual.
      const { error: removeError } = await admin.storage.from(AVATAR_BUCKET).remove(paths);
      if (removeError) {
        result.avatars_errors = paths.length;
      } else {
        const { error: markError } = await admin.from("avatar_uploads").update({ deleted_at: now.toISOString() }).in("path", paths).is("deleted_at", null);
        if (markError) result.avatars_errors = paths.length;
        else result.avatars_deleted = paths.length;
      }
    }
  }
  result.avatars_rows_purged = await purgeDeletedRows(admin, now);
  return result;
}
