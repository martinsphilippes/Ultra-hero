import "server-only";
import { SERVER_MAX_POST_SECONDS } from "@/components/creator/post/validation";
import { hasAdminClient } from "@/lib/supabase/admin";
import { CloudflareStreamError, InvalidMediaRefError, NotConfiguredError, getStreamProvider, isStreamUid, isVideoUploadConfigured } from "@/lib/video";
import type { ActionFailure } from "./action-utils";
import type { CreatorSupabase } from "./content-insert";

// Regras de vídeo do herói usadas pelo composer e pelo botão Publicar do editor: um vídeo do
// Cloudflare só vai ao ar pronto, dentro de 3 minutos e enviado pelo próprio herói.

/** Código do Cloudflare para vídeo cortado pelo maxDurationSeconds do ticket. */
const DURATION_EXCEEDED = "ERR_DURATION_EXCEED_CONSTRAINT";

/**
 * Lê o setting "video.provider" (public_settings) e diz se o envio de vídeo está ligado. Exige
 * também o service role: o vínculo uid → herói (stream_uploads) só é gravado por ele, então sem
 * a chave no servidor a tela mostra "não configurado" em vez de falhar no meio do envio.
 */
export async function readVideoUploadConfigured(supabase: CreatorSupabase): Promise<boolean> {
  if (!hasAdminClient()) return false;
  let setting: unknown;
  try {
    const { data } = await supabase.rpc("public_settings");
    setting = (data as Record<string, unknown> | null)?.["video.provider"];
  } catch {
    setting = undefined; // sem setting vale o env VIDEO_PROVIDER
  }
  return isVideoUploadConfigured(setting);
}

/**
 * Traduz falhas do provedor em chaves de creator.post.errors. Na criação do ticket, qualquer
 * resposta HTTP é "o Cloudflare recusou"; na consulta de status, 404 é vídeo que não existe mais.
 */
export function providerFailure(error: unknown, phase: "upload" | "status"): ActionFailure {
  if (error instanceof NotConfiguredError) return { ok: false, error: "video_not_configured" };
  if (error instanceof RangeError) return { ok: false, error: "file_too_large" };
  if (error instanceof InvalidMediaRefError) return { ok: false, error: "missing_media" };
  if (error instanceof CloudflareStreamError) {
    if (error.status === 0) return { ok: false, error: "network" };
    if (phase === "upload") return { ok: false, error: "upload_failed" };
    if (error.status === 404) return { ok: false, error: "video_failed" };
    return { ok: false, error: "provider_error" };
  }
  return { ok: false, error: "generic" };
}

export type StreamCheck = { ok: true; durationSec: number | null } | ActionFailure;

/**
 * Confere o vídeo no Cloudflare antes de publicar. O uid sempre vem do banco (content_bodies do
 * rascunho do herói), nunca do cliente; o campo `creator` do vídeo (gravado pelo Upload-Creator
 * do ticket) tem de ser exatamente o herói da sessão — ausente também recusa. O banco confere
 * ainda o vínculo em stream_uploads na RPC de publicação (0026).
 */
export async function checkStreamVideo(uid: string | null, creatorId: string): Promise<StreamCheck> {
  if (!isStreamUid(uid)) return { ok: false, error: "missing_media" };
  try {
    const status = await getStreamProvider().getVideoStatus(uid);
    if (status.creatorId !== creatorId) return { ok: false, error: "forbidden" };
    if (status.state === "incomplete") return { ok: false, error: "upload_incomplete" };
    if (status.state === "pending") return { ok: false, error: "processing" };
    if (status.state === "errored") return { ok: false, error: status.reason === DURATION_EXCEEDED ? "too_long" : "video_failed" };
    if (status.durationSec !== null && status.durationSec > SERVER_MAX_POST_SECONDS) return { ok: false, error: "too_long" };
    return { ok: true, durationSec: status.durationSec };
  } catch (error) {
    return providerFailure(error, "status");
  }
}
