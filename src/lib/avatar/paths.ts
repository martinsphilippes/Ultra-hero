import { AVATAR_BUCKET, ILLUSTRATION_RE } from "./constants";

// URLs das fotos de perfil no bucket público: <base>/storage/v1/object/public/avatars/<user>/<uuid>.(webp|jpg).
// Funções puras (cliente e servidor). A regex do caminho é a mesma do CHECK de avatar_uploads (0031).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const AVATAR_PATH_RE = new RegExp(`^(${UUID})/${UUID}\\.(webp|jpg)$`);
const PUBLIC_PREFIX = `/storage/v1/object/public/${AVATAR_BUCKET}/`;

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

export function publicAvatarUrl(baseUrl: string, path: string): string {
  return `${normalizeBase(baseUrl) ?? baseUrl.replace(/\/+$/, "")}${PUBLIC_PREFIX}${path}`;
}

/** Caminho "<user>/<uuid>.ext" quando a URL é uma foto do bucket deste projeto; senão null. */
export function storedAvatarPath(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  const base = normalizeBase(baseUrl);
  if (!url || !base || url.length > 300) return null;
  const prefix = `${base}${PUBLIC_PREFIX}`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  return AVATAR_PATH_RE.test(path) ? path : null;
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

/**
 * O que o navegador pode carregar como avatar: caminho local ou foto do bucket deste projeto.
 * avatar_url é gravável pela própria pessoa (API REST): URL de outro host viraria um <img> de
 * terceiro para todo visitante (rastreio, imagem sem checagem), então cai na ilustração.
 */
export function safeAvatarSrc(src: string | null | undefined, fallbackSrc: string, baseUrl: string | null | undefined): string {
  if (isLocalPath(src) || storedAvatarPath(src, baseUrl)) return src as string;
  return fallbackSrc;
}

/**
 * O rascunho do formulário tira a foto salva (ilustração ou nenhuma no lugar): ao salvar, a foto é
 * apagada. A tela avisa e oferece voltar à foto; "salva" é o valor no servidor, não o rascunho.
 */
export function discardsSavedPhoto(savedPhoto: string | null, draft: string | null | undefined): boolean {
  return savedPhoto !== null && (draft || null) !== savedPhoto;
}

/**
 * Avatar que a própria pessoa pode gravar por um formulário de perfil: nenhum, uma ilustração da
 * lista ou a foto atual dela mesma (foto nova só entra pelo envio, avatar_set_photo). A mesma regra
 * vale no app (profiles) e no perfil público do herói, que recebem o mesmo valor.
 */
export function acceptsAvatarChoice(next: string | null, current: string | null | undefined, userId: string, baseUrl: string | null | undefined): boolean {
  if (next === null) return true;
  if (ILLUSTRATION_RE.test(next)) return true;
  return isStoredAvatarUrl(next, baseUrl) && next === current && storedAvatarOwner(next, baseUrl) === userId;
}
