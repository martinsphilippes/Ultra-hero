"use client";

import { RECIPE_IMAGE_QUALITY, fitWithin, type RecipeImageMime } from "@/lib/recipes/media";
import { RECIPE_LIMITS } from "@/lib/recipes/codes";

export type PreparedImage = { blob: Blob; mime: RecipeImageMime; width: number; height: number };
export type PrepareError = "not_image" | "decode" | "too_large";

/**
 * Redesenha a foto num canvas de até 2048 px (WebP 0,82; JPEG quando o navegador não gera WebP).
 * Redesenhar descarta o EXIF (localização, câmera); a orientação é aplicada antes.
 */
export async function prepareRecipeImage(file: File): Promise<PreparedImage | { error: PrepareError }> {
  if (!file.type.startsWith("image/")) return { error: "not_image" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { error: "decode" };
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  if (!width || !height) return { error: "decode" };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "decode" };
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, RECIPE_IMAGE_QUALITY));
  let blob = await toBlob("image/webp");
  let mime: RecipeImageMime = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob("image/jpeg");
    mime = "image/jpeg";
  }
  if (!blob) return { error: "decode" };
  if (blob.size > RECIPE_LIMITS.mediaBytes) return { error: "too_large" };
  return { blob, mime, width, height };
}
