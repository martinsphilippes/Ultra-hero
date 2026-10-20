// Contrato de vídeo do app (ver docs/decisions/video-provider-interface.md).
// Este arquivo só tem tipos e erros: pode ser importado por componentes cliente.

export type VideoProviderKind = "embed" | "cloudflare-stream" | "mux";

/** Referência opaca persistida no banco (content_bodies.media_ref). Nunca é uma URL final. */
export interface MediaRef {
  provider: VideoProviderKind;
  /** YouTube/Vimeo: ID do vídeo. Cloudflare: uid. Mux: playbackId. */
  id: string;
  /** Subtipo do embed. Ignorado pelos outros providers. */
  source?: "youtube" | "vimeo";
  /** true quando exige token/URL assinada (conteúdo premium). */
  premium?: boolean;
  durationSec?: number;
}

export interface PlaybackOptions {
  signed: boolean;
  userId?: string;
  ttlSeconds?: number;
  /** Idioma preferido para legendas/UI do player (quando o provedor suporta). */
  locale?: string;
}

export interface CaptionTrack {
  lang: string;
  url: string;
  label: string;
}

export type PlaybackSource =
  | { type: "hls"; url: string; poster?: string; captions?: CaptionTrack[]; expiresAt?: string }
  | { type: "iframe"; url: string; title: string }
  | { type: "unavailable"; reason: "missing-keys" | "not-ready" | "forbidden" | "invalid-ref" };

export interface EmbedInfo {
  url: string;
  aspectRatio: "16/9" | "9/16" | "1/1";
}

export interface UploadTicket {
  uploadUrl: string;
  mediaRef: MediaRef;
  expiresAt: string;
  protocol: "tus" | "put" | "post";
}

export interface CreateUploadOptions {
  creatorId: string;
  maxDurationSec: number;
  premium: boolean;
  captions?: Array<"pt" | "en" | "es">;
}

export type WebhookResult =
  | { ok: true; mediaId: string; status: "ready" | "errored" | "deleted" }
  | { ok: false; reason: "bad-signature" | "unknown-event" | "ignored" };

export interface VideoProvider {
  readonly kind: VideoProviderKind;
  /** Fonte de reprodução para o player (sempre no servidor). */
  getPlaybackSource(ref: MediaRef, opts: PlaybackOptions): Promise<PlaybackSource>;
  /** Embed simples para cards e previews. */
  getEmbed(ref: MediaRef): EmbedInfo;
  /** Opcional: URL de upload direto para o portal da personalidade. */
  createUploadUrl?(opts: CreateUploadOptions): Promise<UploadTicket>;
  /** Opcional: valida assinatura e traduz evento do fornecedor. */
  handleWebhook?(rawBody: string, headers: Headers): Promise<WebhookResult>;
}

/** Linha da transcrição usada como legenda no player de demonstração. */
export interface TranscriptLine {
  /** Segundo em que a fala começa. */
  t: number;
  text: string;
}

/** Fonte do player simulado (media_provider = 'none'): sem mídia real, só linha do tempo + transcrição. */
export interface DemoSource {
  type: "demo";
  durationSec: number;
  transcript: TranscriptLine[];
  poster?: string;
}

/** O que a página de conteúdo recebe depois de resolver o provedor. */
export type ResolvedVideo = PlaybackSource | DemoSource;

/** Lançado pelos stubs pagos quando faltam variáveis de ambiente. Nunca "finge" reprodução. */
export class NotConfiguredError extends Error {
  readonly provider: VideoProviderKind;
  readonly envVars: string[];
  constructor(provider: VideoProviderKind, envVars: string[]) {
    super(`video provider "${provider}" não configurado; defina: ${envVars.join(", ")}`);
    this.name = "NotConfiguredError";
    this.provider = provider;
    this.envVars = envVars;
  }
}

/** Referência inválida (ID/URL fora do formato esperado). */
export class InvalidMediaRefError extends Error {
  constructor(message = "media_ref inválido") {
    super(message);
    this.name = "InvalidMediaRefError";
  }
}
