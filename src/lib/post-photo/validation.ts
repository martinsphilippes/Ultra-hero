import { sniffImage, type SniffResult } from "@/lib/avatar/sniff";
import { POST_PHOTO_MAX_EDGE, POST_PHOTO_MAX_SOURCE_BYTES, POST_PHOTO_MAX_UPLOAD_BYTES, POST_PHOTO_MIN_EDGE } from "./constants";

// Validações puras da foto do post: para onde vai o arquivo escolhido (foto ou vídeo), o arquivo
// antes da redução e os bytes que chegam ao servidor. O servidor nunca confia no tipo informado.

// Celular às vezes entrega o arquivo sem MIME (galeria de alguns Android): vale a extensão.
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|3gp|3g2|mkv|avi|mpe?g|qt)$/i;

export type MediaKind = "photo" | "video";

/** Foto ou vídeo pelo MIME do arquivo (extensão só quando o MIME vem vazio); null = nenhum dos dois. */
export function mediaKindOf(file: { type?: string | null; name?: string | null }): MediaKind | null {
  const type = (file.type ?? "").toLowerCase();
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  if (type !== "") return null;
  const name = file.name ?? "";
  if (IMAGE_EXTENSIONS.test(name)) return "photo";
  if (VIDEO_EXTENSIONS.test(name)) return "video";
  return null;
}

export type PhotoSourceProblem = "not_image" | "empty_file" | "file_too_large";

/** Arquivo escolhido (antes da redução no aparelho). null = pode seguir. */
export function validatePhotoSource(file: { type?: string | null; size: number; name?: string | null }): PhotoSourceProblem | null {
  if (mediaKindOf(file) !== "photo") return "not_image";
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty_file";
  if (file.size > POST_PHOTO_MAX_SOURCE_BYTES) return "file_too_large";
  return null;
}

export type PhotoUploadCheck =
  | { ok: true; image: SniffResult }
  | { ok: false; error: "empty_file" | "file_too_large" | "not_image" | "invalid_dimensions" };

/** Bytes já reduzidos: WebP ou JPEG de verdade, lado maior até 2048 px, menor lado de 64 px, até 3,5 MiB. */
export function validatePostPhotoBytes(bytes: Uint8Array): PhotoUploadCheck {
  if (bytes.length === 0) return { ok: false, error: "empty_file" };
  if (bytes.length > POST_PHOTO_MAX_UPLOAD_BYTES) return { ok: false, error: "file_too_large" };
  const image = sniffImage(bytes);
  if (!image) return { ok: false, error: "not_image" };
  if (Math.max(image.width, image.height) > POST_PHOTO_MAX_EDGE || Math.min(image.width, image.height) < POST_PHOTO_MIN_EDGE) {
    return { ok: false, error: "invalid_dimensions" };
  }
  return { ok: true, image };
}

/** Tamanho que cabe no lado maior sem ampliar (a proporção é mantida; nada é recortado). */
export function fitLongEdge(width: number, height: number, maxEdge: number = POST_PHOTO_MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** O que cada botão do passo 1 pode fazer, a partir do Stream e do estado do envio de foto. */
export function pickOptions(input: { videoConfigured: boolean; photo: "ready" | "disabled" | "not_configured" }) {
  const photoReady = input.photo === "ready";
  return {
    takePhoto: photoReady,
    recordVideo: input.videoConfigured,
    // a galeria aceita os dois: fica ligada se ao menos um deles funciona
    gallery: photoReady || input.videoConfigured,
  };
}
