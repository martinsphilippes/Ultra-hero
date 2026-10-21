import {
  InvalidMediaRefError,
  NotConfiguredError,
  type CreateUploadOptions,
  type EmbedInfo,
  type MediaRef,
  type PlaybackOptions,
  type PlaybackSource,
  type UploadTicket,
  type VideoProvider,
} from "../types";

// Cloudflare Stream: upload direto do celular (tus), status do vídeo e player por iframe.
// Sem chaves, falha de forma explícita (NotConfiguredError): nunca devolve URL inventada.
// Referências da API em docs/decisions/video-provider-interface.md (seção 5.2).

const REQUIRED_ENV = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_STREAM_API_TOKEN", "CLOUDFLARE_STREAM_CUSTOMER_CODE"] as const;
const SIGNING_ENV = ["CLOUDFLARE_STREAM_SIGNING_KEY_ID", "CLOUDFLARE_STREAM_SIGNING_KEY_PEM"] as const;

const API_BASE = "https://api.cloudflare.com/client/v4";
/** Teto aceito antes da rede: 3 min de vídeo de celular cabem com folga; acima disso é engano ou abuso. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
/** Validade da URL de upload (metadado `expiry`); o celular tem tempo de subir mesmo em rede lenta. */
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

// uid do Stream: 32 caracteres hexadecimais. Validar antes de montar qualquer URL evita path injection.
const STREAM_UID = /^[0-9a-f]{32}$/;
// Customer code: subdomínio customer-<code>.cloudflarestream.com; só alfanumérico para não virar outro host.
const CUSTOMER_CODE = /^[a-z0-9]+$/i;

export function isStreamUid(value: unknown): value is string {
  return typeof value === "string" && STREAM_UID.test(value);
}

function missing(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

/** true quando as três variáveis obrigatórias estão definidas. */
export function isCloudflareStreamConfigured(): boolean {
  return missing(REQUIRED_ENV).length === 0;
}

function customerCode(): string {
  const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!code) throw new NotConfiguredError("cloudflare-stream", ["CLOUDFLARE_STREAM_CUSTOMER_CODE"]);
  if (!CUSTOMER_CODE.test(code)) throw new NotConfiguredError("cloudflare-stream", ["CLOUDFLARE_STREAM_CUSTOMER_CODE (formato inválido)"]);
  return code;
}

function deliveryBase(uid: string, code: string): string {
  if (!isStreamUid(uid)) throw new InvalidMediaRefError("uid do Cloudflare Stream inválido");
  return `https://customer-${code}.cloudflarestream.com/${uid}`;
}

/**
 * URL da miniatura no Cloudflare. `time` em segundos; `height` em px (o Stream escala a largura).
 * O customer code vem do env quando não é passado. Lança InvalidMediaRefError para uid inválido.
 */
export function thumbnailUrl(uid: string, opts: { height?: number; time?: number } = {}, code: string = customerCode()): string {
  const url = new URL(`${deliveryBase(uid, code)}/thumbnails/thumbnail.jpg`);
  if (opts.time !== undefined && Number.isFinite(opts.time) && opts.time >= 0) url.searchParams.set("time", `${Math.floor(opts.time)}s`);
  if (opts.height !== undefined && Number.isInteger(opts.height) && opts.height > 0) url.searchParams.set("height", String(opts.height));
  return url.toString();
}

/** Caminho da miniatura servida pelo próprio app (proxy): é o que vai em cover_url. */
export function thumbnailPath(uid: string): string {
  if (!isStreamUid(uid)) throw new InvalidMediaRefError("uid do Cloudflare Stream inválido");
  return `/media/stream/${uid}/thumbnail`;
}

/** Erro HTTP/protocolo vindo do Cloudflare, com status e mensagem legível. */
export class CloudflareStreamError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`Cloudflare Stream respondeu ${status}: ${message}`);
    this.name = "CloudflareStreamError";
    this.status = status;
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: Array<{ code?: number; message?: string }> };
    const first = body.errors?.[0];
    if (first?.message) return first.code ? `${first.message} (código ${first.code})` : first.message;
  } catch {
    // Corpo não-JSON: fica com o status text.
  }
  return response.statusText || "erro desconhecido";
}

// Upload-Metadata do tus: pares "chave base64(valor)" separados por vírgula, em UTF-8.
function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** Nome do arquivo sem caminho, controles nem vírgula (separador do Upload-Metadata); 100 caracteres. */
export function sanitizeFileName(raw: string | undefined): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f,]/g, "").trim().slice(0, 100);
  return clean || "video";
}

export type VideoStatus = {
  state: "pending" | "ready" | "errored";
  durationSec: number | null;
  creatorId: string | null;
};

type StreamVideo = {
  readyToStream?: boolean;
  status?: { state?: string };
  duration?: number;
  creator?: string | null;
  meta?: Record<string, unknown>;
};

export class CloudflareStreamProvider implements VideoProvider {
  readonly kind = "cloudflare-stream" as const;

  private assertConfigured(signed = false) {
    const absent = [...missing(REQUIRED_ENV), ...(signed ? missing(SIGNING_ENV) : [])];
    if (absent.length > 0) throw new NotConfiguredError(this.kind, absent);
  }

  private apiUrl(path: string): string {
    return `${API_BASE}/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!)}/stream${path}`;
  }

  private authHeader(): string {
    return `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`;
  }

  private iframeUrl(uid: string): string {
    const code = customerCode();
    const url = new URL(`${deliveryBase(uid, code)}/iframe`);
    url.searchParams.set("poster", thumbnailUrl(uid, { height: 720 }, code));
    return url.toString();
  }

  /**
   * Cria a URL de upload tus de uso único para o celular (direct_user=true). O arquivo nunca passa
   * pelo nosso servidor: o navegador envia direto para `uploadUrl` com tus-js-client.
   */
  async createUploadUrl(opts: CreateUploadOptions & { fileSize: number; fileName?: string }): Promise<UploadTicket> {
    if (!Number.isInteger(opts.fileSize) || opts.fileSize <= 0 || opts.fileSize > MAX_UPLOAD_BYTES) {
      throw new RangeError(`tamanho de arquivo inválido: ${opts.fileSize} bytes (máximo ${MAX_UPLOAD_BYTES})`);
    }
    if (!Number.isInteger(opts.maxDurationSec) || opts.maxDurationSec <= 0) {
      throw new RangeError(`maxDurationSec inválido: ${opts.maxDurationSec}`);
    }
    this.assertConfigured();

    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
    // Sem requiresignedurls: a regra free/premium é do admin e a assinatura ainda não está ativa.
    const metadata = [
      `maxDurationSeconds ${b64(String(opts.maxDurationSec))}`,
      `expiry ${b64(expiresAt)}`,
      `name ${b64(sanitizeFileName(opts.fileName))}`,
    ].join(",");

    let response: Response;
    try {
      response = await fetch(this.apiUrl("?direct_user=true"), {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(opts.fileSize),
          "Upload-Metadata": metadata,
          // Registra o dono no campo `creator` do vídeo; o servidor confere no status antes de publicar.
          "Upload-Creator": opts.creatorId,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CloudflareStreamError(0, `falha de rede ao criar upload (${(error as Error).message})`);
    }
    if (!response.ok) throw new CloudflareStreamError(response.status, await readApiError(response));

    const location = response.headers.get("Location");
    const uid = response.headers.get("stream-media-id");
    if (!location || !/^https:\/\//.test(location)) throw new CloudflareStreamError(response.status, "resposta sem header Location válido");
    if (!isStreamUid(uid)) throw new CloudflareStreamError(response.status, "resposta sem header stream-media-id válido");

    return {
      uploadUrl: location,
      mediaRef: { provider: this.kind, id: uid, premium: false },
      expiresAt,
      protocol: "tus",
    };
  }

  /** Estado do vídeo no Cloudflare. Lança CloudflareStreamError (status 404 = vídeo inexistente). */
  async getVideoStatus(uid: string): Promise<VideoStatus> {
    if (!isStreamUid(uid)) throw new InvalidMediaRefError("uid do Cloudflare Stream inválido");
    this.assertConfigured();

    let response: Response;
    try {
      response = await fetch(this.apiUrl(`/${uid}`), {
        headers: { Authorization: this.authHeader() },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CloudflareStreamError(0, `falha de rede ao consultar vídeo (${(error as Error).message})`);
    }
    if (!response.ok) throw new CloudflareStreamError(response.status, await readApiError(response));

    const body = (await response.json()) as { result?: StreamVideo };
    const video = body.result ?? {};
    const raw = video.status?.state;
    // "ready" só conta com readyToStream: antes disso o player mostraria erro.
    const state: VideoStatus["state"] = raw === "error" ? "errored" : raw === "ready" && video.readyToStream ? "ready" : "pending";
    // O Cloudflare usa -1 para duração desconhecida.
    const durationSec = typeof video.duration === "number" && video.duration >= 0 ? video.duration : null;
    const creatorId = typeof video.creator === "string" && video.creator ? video.creator : null;
    return { state, durationSec, creatorId };
  }

  /**
   * Embed simples. O MediaRef não guarda dimensões, então o formato fica 16/9; o player do
   * Cloudflare encaixa vídeo vertical com faixas laterais.
   */
  getEmbed(ref: MediaRef): EmbedInfo {
    this.assertConfigured();
    return { url: this.iframeUrl(ref.id), aspectRatio: "16/9" };
  }

  async getPlaybackSource(ref: MediaRef, opts: PlaybackOptions): Promise<PlaybackSource> {
    this.assertConfigured(opts.signed);
    // Com chaves de assinatura presentes, o token JWT ainda não foi implementado: erro explícito.
    if (opts.signed) throw new NotConfiguredError(this.kind, ["(implementação pendente: token assinado do Stream)"]);
    if (!isStreamUid(ref.id)) return { type: "unavailable", reason: "invalid-ref" };
    // Iframe em vez de HLS: o projeto não tem hls.js e o player do Stream já cobre Safari e Chrome.
    return { type: "iframe", url: this.iframeUrl(ref.id), title: "" };
  }
}
