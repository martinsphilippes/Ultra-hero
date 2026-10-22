// Fotos de receita (bucket privado recipe-media, 0028): caminho, tipo pelos bytes mágicos e o
// cabeçalho de cache do proxy /media/recipe/[id]. Regras puras (servidor, navegador e testes).

export const RECIPE_MEDIA_BUCKET = "recipe-media";
export const RECIPE_MEDIA_URL_PREFIX = "/media/recipe/";
/** Lado maior depois da redução no navegador (remove EXIF e localização ao redesenhar). */
export const RECIPE_IMAGE_MAX_SIDE = 2048;
export const RECIPE_IMAGE_QUALITY = 0.82;

export type RecipeImageMime = "image/jpeg" | "image/png" | "image/webp";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID})/(${UUID})/(${UUID})\\.(jpg|png|webp)$`);

/** Tipo real pelos primeiros bytes: JPEG FFD8FF, PNG 89 50 4E 47 0D 0A 1A 0A, WEBP "RIFF"…"WEBP". */
export function sniffImageMime(bytes: Uint8Array): RecipeImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export function extForMime(mime: RecipeImageMime): "jpg" | "png" | "webp" {
  return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
}

export function mimeForExt(ext: string): RecipeImageMime | null {
  return ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : null;
}

/** <creator_id>/<content_id>/<uuid>.<ext> — o mesmo formato que a política do Storage exige. */
export function recipeMediaPath(creatorId: string, contentId: string, fileId: string, mime: RecipeImageMime): string {
  return `${creatorId}/${contentId}/${fileId}.${extForMime(mime)}`;
}

/** Caminho válido para este herói e esta receita? (ids em minúsculas, como o Postgres grava uuid) */
export function parseRecipeMediaPath(path: string): { creatorId: string; contentId: string; fileId: string; mime: RecipeImageMime } | null {
  const m = PATH_RE.exec(path);
  if (!m) return null;
  return { creatorId: m[1], contentId: m[2], fileId: m[3], mime: mimeForExt(m[4]) as RecipeImageMime };
}

export function recipeMediaUrl(mediaId: string): string {
  return `${RECIPE_MEDIA_URL_PREFIX}${mediaId}`;
}

export function isRecipeMediaUrl(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith(RECIPE_MEDIA_URL_PREFIX));
}

/**
 * Cache do proxy: foto de galeria de receita no ar é pública (CDN por poucos minutos); rascunho,
 * agendada e foto de etapa (só com acesso) nunca entram em cache compartilhado.
 */
export function recipeMediaCacheControl(isPublic: boolean): string {
  return isPublic ? "public, max-age=60, s-maxage=300, stale-while-revalidate=60" : "private, no-store";
}

/** Dimensões para caber em `max` mantendo a proporção (nunca amplia). */
export function fitWithin(width: number, height: number, max: number = RECIPE_IMAGE_MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Mesma regra de public.content_is_live: publicado e sem data futura. */
export function isLive(status: string, publishAt: string | null | undefined, now: Date = new Date()): boolean {
  if (status !== "published") return false;
  if (!publishAt) return true;
  const at = Date.parse(publishAt);
  return !Number.isFinite(at) || at <= now.getTime();
}
