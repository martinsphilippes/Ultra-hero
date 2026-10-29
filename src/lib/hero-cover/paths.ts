import { AVATAR_PATH_RE, isLocalPath, publicBucketUrl, storedBucketPath } from "@/lib/avatar/paths";
import { COVER_BUCKET } from "./constants";

// URLs das capas no bucket público hero-covers (0042): <base>/storage/v1/object/public/hero-covers/<user>/<uuid>.(webp|jpg).

export function publicCoverUrl(baseUrl: string, path: string): string {
  return publicBucketUrl(COVER_BUCKET, baseUrl, path);
}

export function storedCoverPath(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  return storedBucketPath(COVER_BUCKET, url, baseUrl);
}

/** Dono (user_id) da capa, lido do prefixo do caminho. */
export function storedCoverOwner(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  const path = storedCoverPath(url, baseUrl);
  return path ? (AVATAR_PATH_RE.exec(path)?.[1] ?? null) : null;
}

export function isStoredCoverUrl(url: string | null | undefined, baseUrl: string | null | undefined): boolean {
  return storedCoverPath(url, baseUrl) !== null;
}

/**
 * O que o navegador pode carregar como capa do herói: foto real (caminho local do app, como as capas
 * oficiais dos heróis demo, ou foto do bucket deste projeto). Sem capa, capa desenhada antiga
 * (/placeholders/…) ou URL de outro host (cover_url é gravável pelo herói pela API): null, e a tela
 * mostra uma superfície lisa do tema.
 */
export function safeCoverSrc(src: string | null | undefined, baseUrl: string | null | undefined): string | null {
  if (!src || src.startsWith("/placeholders/")) return null;
  if (isLocalPath(src) || storedCoverPath(src, baseUrl)) return src;
  return null;
}
