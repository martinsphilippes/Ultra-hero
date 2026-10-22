import { MAX_DIMENSION, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES } from "./constants";
import { sniffImage, type SniffResult } from "./sniff";

// Validações puras da foto de perfil: o arquivo escolhido no aparelho (antes de redimensionar) e os
// bytes que chegam ao servidor (depois). O servidor nunca confia no tipo informado pelo navegador.

// Celular às vezes manda o arquivo sem MIME (galeria de alguns Android): vale a extensão.
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;

export type SourceProblem = "not_image" | "empty_file" | "file_too_large";
export type UploadProblem = SourceProblem | "invalid_dimensions";

export function validateSourceFile(file: { type?: string | null; size: number; name?: string | null }): SourceProblem | null {
  const type = (file.type ?? "").toLowerCase();
  const isImage = type.startsWith("image/") || (type === "" && IMAGE_EXTENSIONS.test(file.name ?? ""));
  if (!isImage) return "not_image";
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty_file";
  if (file.size > MAX_SOURCE_BYTES) return "file_too_large";
  return null;
}

export type UploadCheck = { ok: true; image: SniffResult } | { ok: false; error: UploadProblem };

/** Bytes já redimensionados: WebP ou JPEG de verdade, quadrado, até 1024 px e 2 MiB. */
export function validateUploadBytes(bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: "empty_file" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file_too_large" };
  const image = sniffImage(bytes);
  if (!image) return { ok: false, error: "not_image" };
  if (image.width !== image.height || image.width > MAX_DIMENSION) return { ok: false, error: "invalid_dimensions" };
  return { ok: true, image };
}
