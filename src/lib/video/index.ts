import "server-only";
import type { Enums } from "@/lib/supabase/helpers";
import { CloudflareStreamProvider } from "./providers/cloudflare-stream";
import { getDemoSource } from "./providers/demo";
import { EmbedProvider } from "./providers/embed";
import { MuxProvider } from "./providers/mux";
import {
  NotConfiguredError,
  type MediaRef,
  type PlaybackOptions,
  type ResolvedVideo,
  type VideoProvider,
  type VideoProviderKind,
} from "./types";

export * from "./types";
export { parseYouTubeId, parseVimeoId } from "./providers/embed";
export { parseTranscript } from "./providers/demo";

// Normaliza valores aceitos em VIDEO_PROVIDER / app_settings "video.provider".
export function normalizeProviderKind(value: unknown): VideoProviderKind | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/_/g, "-");
  if (v === "embed") return "embed";
  if (v === "cloudflare-stream" || v === "cloudflare") return "cloudflare-stream";
  if (v === "mux") return "mux";
  return null;
}

const instances: Partial<Record<VideoProviderKind, VideoProvider>> = {};

function instantiate(kind: VideoProviderKind): VideoProvider {
  const existing = instances[kind];
  if (existing) return existing;
  const created: VideoProvider =
    kind === "cloudflare-stream" ? new CloudflareStreamProvider() : kind === "mux" ? new MuxProvider() : new EmbedProvider();
  instances[kind] = created;
  return created;
}

/**
 * Provedor da plataforma. Prioridade: `kind` explícito > env VIDEO_PROVIDER > setting
 * "video.provider" (passado por quem já leu public_settings) > 'embed'.
 */
export function getVideoProvider(kind?: VideoProviderKind | null, settingValue?: unknown): VideoProvider {
  const resolved = kind ?? normalizeProviderKind(process.env.VIDEO_PROVIDER) ?? normalizeProviderKind(settingValue) ?? "embed";
  return instantiate(resolved);
}

/**
 * Provedor configurado para a plataforma (uploads/novas mídias): env VIDEO_PROVIDER tem
 * prioridade; sem env, lê o setting "video.provider" (public_settings) e cai em 'embed'.
 */
export async function getPlatformVideoProvider(): Promise<VideoProvider> {
  const fromEnv = normalizeProviderKind(process.env.VIDEO_PROVIDER);
  if (fromEnv) return instantiate(fromEnv);
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_settings");
    const settings = (data ?? {}) as Record<string, unknown>;
    return getVideoProvider(null, settings["video.provider"]);
  } catch {
    return instantiate("embed");
  }
}

type MediaProvider = Enums<"media_provider">;

/** Converte a linha de content_bodies em MediaRef. null quando não há mídia externa (demo) ou o tipo não é suportado. */
export function mediaRefFromBody(mediaProvider: MediaProvider, mediaRef: string | null, premium: boolean): MediaRef | null {
  if (!mediaRef) return null;
  switch (mediaProvider) {
    case "embed_youtube":
      return { provider: "embed", id: mediaRef, source: "youtube", premium };
    case "embed_vimeo":
      return { provider: "embed", id: mediaRef, source: "vimeo", premium };
    case "cloudflare_stream":
      return { provider: "cloudflare-stream", id: mediaRef, premium };
    case "mux":
      return { provider: "mux", id: mediaRef, premium };
    default:
      return null; // 'none' e 'upload' não têm reprodução externa no POC
  }
}

type ResolveInput = {
  mediaProvider: MediaProvider;
  mediaRef: string | null;
  body: unknown;
  durationMinutes: number | null;
  premium: boolean;
  poster?: string | null;
  userId?: string;
  locale?: string;
};

/**
 * Decide o que o player recebe: fonte simulada (sem mídia), iframe de embed, HLS,
 * ou "unavailable" quando o provedor pago não está configurado / a ref é inválida.
 */
export async function resolveVideoSource(input: ResolveInput): Promise<ResolvedVideo> {
  if (input.mediaProvider === "none") {
    return getDemoSource({ body: input.body, durationMinutes: input.durationMinutes, poster: input.poster });
  }
  const ref = mediaRefFromBody(input.mediaProvider, input.mediaRef, input.premium);
  if (!ref) return { type: "unavailable", reason: "not-ready" };
  const provider = getVideoProvider(ref.provider);
  const opts: PlaybackOptions = { signed: input.premium, userId: input.userId, locale: input.locale };
  try {
    return await provider.getPlaybackSource(ref, opts);
  } catch (error) {
    if (error instanceof NotConfiguredError) {
      if (process.env.NODE_ENV !== "production") console.warn("[video]", error.message);
      return { type: "unavailable", reason: "missing-keys" };
    }
    throw error;
  }
}
