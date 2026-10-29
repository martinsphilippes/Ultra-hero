import { AVATAR_BUCKET } from "./constants";

// URLs das imagens nos buckets públicos: <base>/storage/v1/object/public/<bucket>/<user>/<uuid>.(webp|jpg).
// Funções puras (cliente e servidor). A regex do caminho é a mesma do CHECK de avatar_uploads (0031)
// e de hero_cover_uploads (0042).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const AVATAR_PATH_RE = new RegExp(`^(${UUID})/${UUID}\\.(webp|jpg)$`);
const publicPrefix = (bucket: string) => `/storage/v1/object/public/${bucket}/`;

function normalizeBase(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Base do Supabase vista pelo app (a mesma variável pública no cliente e no servidor). */
export function supabaseBaseUrl(): string | null {
  return normalizeBase(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** URL pública de um objeto do bucket (uso comum de avatar e capa). */
export function publicBucketUrl(bucket: string, baseUrl: string, path: string): string {
  return `${normalizeBase(baseUrl) ?? baseUrl.replace(/\/+$/, "")}${publicPrefix(bucket)}${path}`;
}

/** Caminho "<user>/<uuid>.ext" quando a URL é um objeto do bucket deste projeto; senão null. */
export function storedBucketPath(bucket: string, url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  const base = normalizeBase(baseUrl);
  if (!url || !base || url.length > 300) return null;
  const prefix = `${base}${publicPrefix(bucket)}`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  return AVATAR_PATH_RE.test(path) ? path : null;
}

export function publicAvatarUrl(baseUrl: string, path: string): string {
  return publicBucketUrl(AVATAR_BUCKET, baseUrl, path);
}

/** Caminho "<user>/<uuid>.ext" quando a URL é uma foto do bucket deste projeto; senão null. */
export function storedAvatarPath(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  return storedBucketPath(AVATAR_BUCKET, url, baseUrl);
}

/** Dono (user_id) da foto, lido do prefixo do caminho. */
export function storedAvatarOwner(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  const path = storedAvatarPath(url, baseUrl);
  return path ? (AVATAR_PATH_RE.exec(path)?.[1] ?? null) : null;
}

export function isStoredAvatarUrl(url: string | null | undefined, baseUrl: string | null | undefined): boolean {
  return storedAvatarPath(url, baseUrl) !== null;
}

/** Caminho servido pelo próprio app ("/x"); "//host" e barra invertida apontam para fora. */
export function isLocalPath(src: string | null | undefined): src is string {
  return typeof src === "string" && src.startsWith("/") && !src.startsWith("//") && !src.includes("\\");
}

/** Avatar desenhado antigo (/placeholders/avatar-*.svg): fica no banco, mas a tela mostra "sem foto". */
export function isLegacyAvatarArt(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith("/placeholders/avatar-");
}

/**
 * O que o navegador pode carregar como avatar: foto real (caminho local, como as fotos oficiais dos
 * heróis demo, ou foto do bucket deste projeto). Sem foto, ilustração antiga ou URL de outro host:
 * null, e a tela mostra as iniciais. avatar_url é gravável pela própria pessoa (API REST): URL de
 * outro host viraria um <img> de terceiro para todo visitante (rastreio, imagem sem checagem).
 */
export function safeAvatarSrc(src: string | null | undefined, baseUrl: string | null | undefined): string | null {
  if (!src || isLegacyAvatarArt(src)) return null;
  if (isLocalPath(src) || storedAvatarPath(src, baseUrl)) return src;
  return null;
}

/**
 * Avatar que a própria pessoa pode gravar por um formulário de perfil: nenhum ou a foto atual dela
 * mesma (foto nova só entra pelo envio, avatar_set_photo; ilustração não é mais opção). A mesma regra
 * vale no app (profiles) e no perfil público do herói, que recebem o mesmo valor.
 */
export function acceptsAvatarChoice(next: string | null, current: string | null | undefined, userId: string, baseUrl: string | null | undefined): boolean {
  if (next === null) return true;
  return isStoredAvatarUrl(next, baseUrl) && next === current && storedAvatarOwner(next, baseUrl) === userId;
}
