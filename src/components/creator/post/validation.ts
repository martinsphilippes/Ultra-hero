// Regras do vídeo do post, sem dependências de navegador ou servidor: o composer valida antes de
// enviar e as server actions reaproveitam os mesmos limites (o Cloudflare também corta em 180 s).

/** Duração máxima do post em vídeo (decisão do produto: 3 minutos). */
export const MAX_POST_SECONDS = 180;
/** Folga do servidor: o arredondamento do Cloudflare pode passar alguns décimos do limite. */
export const SERVER_MAX_POST_SECONDS = 185;
/** Teto de tamanho (o mesmo de MAX_UPLOAD_BYTES do provedor). */
export const MAX_POST_BYTES = 2 * 1024 * 1024 * 1024;
export const TITLE_MAX = 120;
export const CAPTION_MAX = 500;

// Alguns celulares entregam .mov/.3gp sem MIME; a extensão decide nesses casos.
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|3gp|3g2|mkv|avi|mpe?g|qt)$/i;

export type FileProblem = "empty_file" | "not_video" | "file_too_large";
export type DurationProblem = "too_long";

/** Confere tipo e tamanho do arquivo escolhido. null = pode seguir. */
export function validateVideoFile(file: { type?: string | null; size: number; name?: string | null }): FileProblem | null {
  const type = (file.type ?? "").toLowerCase();
  const isVideo = type.startsWith("video/") || (type === "" && VIDEO_EXTENSIONS.test(file.name ?? ""));
  if (!isVideo) return "not_video";
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty_file";
  if (file.size > MAX_POST_BYTES) return "file_too_large";
  return null;
}

/**
 * Normaliza a duração lida do <video>: NaN/Infinity (webm gravado no navegador, codec que o
 * desktop não lê) viram null, e o envio segue porque o Cloudflare aplica o limite de qualquer jeito.
 * Arredonda para cima (décimo de segundo): 180,04 s não pode virar 180 e passar do limite.
 */
export function normalizeDuration(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.ceil(Math.round(raw * 1000) / 100) / 10;
}

/**
 * Acima de 3 minutos não envia; recebe a duração bruta do <video>, sem arredondar para baixo.
 * Duração desconhecida (null, NaN, Infinity) passa: o ticket do Cloudflare corta em 180 s.
 */
export function validateDuration(seconds: number | null | undefined): DurationProblem | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return seconds > MAX_POST_SECONDS ? "too_long" : null;
}

/** Percentual inteiro do envio, de 0 a 100. */
export function uploadPercent(sent: number, total: number): number {
  if (!Number.isFinite(sent) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((sent / total) * 100)));
}

/** Minutos inteiros para content.duration_minutes (mínimo 1). */
export function durationMinutes(seconds: number | null): number | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.max(1, Math.ceil(seconds / 60));
}
