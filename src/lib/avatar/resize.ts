import { AVATAR_SIZE, MAX_UPLOAD_BYTES, type AvatarMime } from "./constants";

// Prepara a imagem no aparelho (só no navegador): recorte central na proporção do destino (foto de
// perfil 512x512; capa do herói 1600x900), WebP (JPEG quando o navegador não codifica WebP, como o
// Safari). O re-encode pelo canvas descarta EXIF e GPS por construção; a orientação da câmera é
// aplicada na decodificação.

export type PreparedAvatar = { blob: Blob; mime: AvatarMime };
export class AvatarPrepareError extends Error {
  constructor(public readonly code: "decode_failed" | "file_too_large") {
    super(code);
    this.name = "AvatarPrepareError";
  }
}

type Source = { image: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // alguns navegadores recusam a opção ou o formato no bitmap; tenta pelo <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } catch {
    // HEIC da galeria no Chrome Android, arquivo corrompido etc.
    throw new AvatarPrepareError("decode_failed");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Recorte central quadrado: o menor lado inteiro, centralizado. */
export function coverCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** Recorte central na proporção pedida (largura/altura): o maior retângulo que cabe, centralizado. */
export function aspectCrop(width: number, height: number, aspect: number): { sx: number; sy: number; sw: number; sh: number } {
  let sw = width;
  let sh = Math.round(width / aspect);
  if (sh > height) {
    sh = height;
    sw = Math.round(height * aspect);
  }
  return { sx: Math.floor((width - sw) / 2), sy: Math.floor((height - sh) / 2), sw, sh };
}

/**
 * Recorta no centro na proporção do destino, reduz para width x height e codifica em WebP (JPEG
 * quando o navegador não codifica WebP). Usado pela foto de perfil (quadrada) e pela capa (16:9).
 */
export async function prepareImage(file: Blob, target: { width: number; height: number; maxBytes: number }): Promise<PreparedAvatar> {
  const source = await decode(file);
  try {
    if (!source.width || !source.height) throw new AvatarPrepareError("decode_failed");
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AvatarPrepareError("decode_failed");
    const { sx, sy, sw, sh } = aspectCrop(source.width, source.height, target.width / target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, sx, sy, sw, sh, 0, 0, target.width, target.height);

    for (const quality of [0.85, 0.7]) {
      let blob = await toBlob(canvas, "image/webp", quality);
      let mime: AvatarMime = "image/webp";
      // navegador sem codificador WebP devolve PNG: cai para JPEG
      if (!blob || blob.type !== "image/webp") {
        blob = await toBlob(canvas, "image/jpeg", quality);
        mime = "image/jpeg";
      }
      if (!blob || blob.type !== mime) throw new AvatarPrepareError("decode_failed");
      if (blob.size <= target.maxBytes) return { blob, mime };
    }
    throw new AvatarPrepareError("file_too_large");
  } finally {
    source.close();
  }
}

export function prepareAvatar(file: Blob): Promise<PreparedAvatar> {
  return prepareImage(file, { width: AVATAR_SIZE, height: AVATAR_SIZE, maxBytes: MAX_UPLOAD_BYTES });
}
