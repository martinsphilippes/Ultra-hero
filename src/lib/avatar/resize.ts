import { AVATAR_SIZE, MAX_UPLOAD_BYTES, type AvatarMime } from "./constants";

// Prepara a foto no aparelho (só no navegador): recorte central quadrado ("cover"), 512x512,
// WebP (JPEG quando o navegador não codifica WebP, como o Safari). O re-encode pelo canvas
// descarta EXIF e GPS por construção; a orientação da câmera é aplicada na decodificação.

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

export async function prepareAvatar(file: Blob): Promise<PreparedAvatar> {
  const source = await decode(file);
  try {
    if (!source.width || !source.height) throw new AvatarPrepareError("decode_failed");
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AvatarPrepareError("decode_failed");
    const { sx, sy, side } = coverCrop(source.width, source.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    for (const quality of [0.85, 0.7]) {
      let blob = await toBlob(canvas, "image/webp", quality);
      let mime: AvatarMime = "image/webp";
      // navegador sem codificador WebP devolve PNG: cai para JPEG
      if (!blob || blob.type !== "image/webp") {
        blob = await toBlob(canvas, "image/jpeg", quality);
        mime = "image/jpeg";
      }
      if (!blob || blob.type !== mime) throw new AvatarPrepareError("decode_failed");
      if (blob.size <= MAX_UPLOAD_BYTES) return { blob, mime };
    }
    throw new AvatarPrepareError("file_too_large");
  } finally {
    source.close();
  }
}
