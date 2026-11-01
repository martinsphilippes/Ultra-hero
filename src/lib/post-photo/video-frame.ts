import { POST_PHOTO_MAX_EDGE } from "./constants";
import { fitLongEdge } from "./validation";

// Quadro de um vídeo do celular como foto de capa (só no navegador). O vídeo não sobe: o navegador
// decodifica o arquivo local, posiciona num instante do começo e copia o quadro para um canvas; a
// imagem segue pelo mesmo caminho da foto (redução no aparelho e conferência dos bytes no servidor).

/** Vídeo escolhido como capa: no máximo 300 MB (decodificar mais que isso trava celular modesto). */
export const COVER_VIDEO_MAX_SOURCE_BYTES = 300 * 1024 * 1024;

export type VideoFrameProblem = "decode_failed" | "file_too_large" | "empty_file";

export class VideoFrameError extends Error {
  constructor(public readonly code: VideoFrameProblem) {
    super(code);
    this.name = "VideoFrameError";
  }
}

/**
 * Instante do quadro (segundos): 1 s depois do início, para pular a tela preta do começo, sem passar
 * de 10% do vídeo (um vídeo de 3 s usa 0,3 s). Duração desconhecida ou inválida: o primeiro quadro.
 */
export function frameTimeFor(durationSec: number | null | undefined): number {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(1, durationSec * 0.1);
}

/** Arquivo de vídeo escolhido (antes de decodificar). null = pode seguir. */
export function validateVideoSource(file: { size: number }): VideoFrameProblem | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty_file";
  if (file.size > COVER_VIDEO_MAX_SOURCE_BYTES) return "file_too_large";
  return null;
}

function once<K extends keyof HTMLVideoElementEventMap>(video: HTMLVideoElement, event: K, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new VideoFrameError("decode_failed"));
    };
    const cleanup = () => {
      video.removeEventListener(event, done);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", fail);
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", fail, { once: true });
  });
}

/**
 * Copia um quadro do vídeo para um JPEG (qualidade alta; a redução/WebP vem depois, como numa foto).
 * Até 20 s para decodificar: passou, é "decode_failed" (formato sem suporte, arquivo corrompido).
 */
export async function frameFromVideo(file: Blob, timeoutMs = 20_000): Promise<Blob> {
  const problem = validateVideoSource(file);
  if (problem) throw new VideoFrameError(problem);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    video.src = url;
    await once(video, "loadedmetadata", controller.signal);
    const target = frameTimeFor(video.duration);
    // seeked só dispara quando o tempo muda: no 0 o primeiro quadro já vem com loadeddata
    if (target > 0) {
      video.currentTime = target;
      await once(video, "seeked", controller.signal);
    } else if (video.readyState < 2) {
      await once(video, "loadeddata", controller.signal);
    }
    if (!video.videoWidth || !video.videoHeight) throw new VideoFrameError("decode_failed");
    // Safari no iPhone pode disparar seeked antes de pintar o quadro: espera um ciclo de pintura
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // canvas já no tamanho final da capa (vídeo 4K em canvas inteiro estoura memória no celular)
    const { width, height } = fitLongEdge(video.videoWidth, video.videoHeight, POST_PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new VideoFrameError("decode_failed");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.size === 0) throw new VideoFrameError("decode_failed");
    return blob;
  } catch (error) {
    throw error instanceof VideoFrameError ? error : new VideoFrameError("decode_failed");
  } finally {
    clearTimeout(timer);
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
