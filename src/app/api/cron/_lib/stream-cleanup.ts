import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VideoStatus } from "@/lib/video/providers/cloudflare-stream";

// Limpeza diária dos envios do composer (chamada pelo cron de retenção, com o service role):
//  (a) envio descartado cujo vídeo ainda não foi apagado no Cloudflare (o descarte é melhor
//      esforço) → apaga e marca provider_deleted_at;
//  (b) envio vencido há mais de 1 h cujo uid não está (nem esteve) no ar e cujo vídeo ficou
//      incompleto, com erro ou sumiu (ou que nenhum corpo usa) → apaga o rascunho que ainda usa
//      o uid, apaga o vídeo e marca o envio.
// Nunca toca conteúdo publicado (ou que já esteve no ar) nem envio dentro da validade.

type Admin = SupabaseClient<Database>;
export type StreamCleanupProvider = {
  getVideoStatus(uid: string): Promise<VideoStatus>;
  deleteVideo(uid: string): Promise<void>;
};
export type StreamCleanupResult = {
  stream_videos_deleted: number;
  stream_drafts_removed: number;
  stream_checked: number;
  stream_errors: number;
};

/** Teto de ações (apagar vídeo) por execução: o cron diário não pode estourar o tempo da função. */
export const STREAM_CLEANUP_LIMIT = 50;
/** Teto de consultas ao Cloudflare por execução (rascunhos com vídeo pronto são conferidos e mantidos). */
const STATUS_CHECK_LIMIT = 100;
const GRACE_MS = 60 * 60 * 1000;

function isNotFound(error: unknown): boolean {
  return (error as { name?: string; status?: number } | null)?.name === "CloudflareStreamError" && (error as { status?: number }).status === 404;
}

export async function cleanupStreamUploads(admin: Admin, provider: StreamCleanupProvider, now: Date = new Date()): Promise<StreamCleanupResult> {
  const result: StreamCleanupResult = { stream_videos_deleted: 0, stream_drafts_removed: 0, stream_checked: 0, stream_errors: 0 };
  const stamp = now.toISOString();

  // (a) descartados ainda presentes no Cloudflare
  const { data: discarded, error: discardedError } = await admin
    .from("stream_uploads")
    .select("uid")
    .not("discarded_at", "is", null)
    .is("provider_deleted_at", null)
    .order("discarded_at", { ascending: true })
    .limit(STREAM_CLEANUP_LIMIT);
  if (discardedError) throw new Error(discardedError.message);
  for (const row of discarded ?? []) {
    try {
      await provider.deleteVideo(row.uid);
    } catch {
      result.stream_errors += 1;
      continue;
    }
    const { error } = await admin.from("stream_uploads").update({ provider_deleted_at: stamp }).eq("uid", row.uid);
    if (error) result.stream_errors += 1;
    else result.stream_videos_deleted += 1;
  }

  let budget = STREAM_CLEANUP_LIMIT - result.stream_videos_deleted - result.stream_errors;
  if (budget <= 0) return result;

  // (b) vencidos que não estão (nem estiveram) no ar. O banco filtra e ordena a fila
  // (stream_cleanup_candidates, 0026): publicados não ocupam a janela e os envios conferidos com
  // vídeo pronto vão para o fim (checked_at), senão a limpeza emperrava nos mesmos 100.
  const cutoff = new Date(now.getTime() - GRACE_MS).toISOString();
  const { data: expired, error: expiredError } = await admin.rpc("stream_cleanup_candidates", { p_cutoff: cutoff, p_limit: STATUS_CHECK_LIMIT });
  if (expiredError) throw new Error(expiredError.message);

  for (const row of expired ?? []) {
    if (budget <= 0) break;
    // draft_id só vem quando o corpo do rascunho nunca publicado ainda usa este uid (trocou para
    // YouTube no editor: o rascunho fica, só o vídeo sai)
    const draftId = (row.draft_id as string | null) ?? null;

    let gone = false;
    // Envio que nenhum corpo usa é órfão: sai sem perguntar ao Cloudflare.
    if (row.referenced) {
      result.stream_checked += 1;
      try {
        const status = await provider.getVideoStatus(row.uid);
        if (status.state !== "incomplete" && status.state !== "errored") {
          // vídeo bom: o herói ainda pode publicar; volta para o fim da fila
          const { error } = await admin.from("stream_uploads").update({ checked_at: stamp }).eq("uid", row.uid);
          if (error) result.stream_errors += 1;
          continue;
        }
      } catch (error) {
        if (!isNotFound(error)) {
          result.stream_errors += 1;
          continue;
        }
        gone = true;
      }
    }
    budget -= 1;

    if (draftId) {
      const { error } = await admin.from("content").delete().eq("id", draftId).eq("status", "draft").is("published_at", null);
      if (error) {
        result.stream_errors += 1;
        continue;
      }
      result.stream_drafts_removed += 1;
      await admin.rpc("audit_log", {
        p_action: "content.cleanup_discard",
        p_resource_type: "content",
        p_resource_id: draftId,
        p_before: { status: "draft", media_ref: row.uid },
        p_actor_type: "system",
      });
    }
    const { error: markError } = await admin.from("stream_uploads").update({ discarded_at: stamp }).eq("uid", row.uid);
    if (markError) {
      result.stream_errors += 1;
      continue;
    }
    try {
      if (!gone) await provider.deleteVideo(row.uid);
    } catch (error) {
      if (!isNotFound(error)) {
        result.stream_errors += 1; // fica descartado sem provider_deleted_at: o passo (a) tenta amanhã
        continue;
      }
    }
    const { error } = await admin.from("stream_uploads").update({ provider_deleted_at: stamp }).eq("uid", row.uid);
    if (error) result.stream_errors += 1;
    else result.stream_videos_deleted += 1;
  }
  return result;
}
