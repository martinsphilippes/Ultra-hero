import { AVATAR_BUCKET } from "./constants";

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
