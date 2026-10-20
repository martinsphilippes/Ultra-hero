// Validação de referência de mídia no formulário (ID ou URL de YouTube/Vimeo).
// A validação definitiva na reprodução fica em src/lib/video (servidor); aqui só
// extraímos o ID para salvar uma referência limpa e dar feedback imediato.

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** ID do YouTube a partir de ID (11 caracteres) ou URL (watch, youtu.be, embed, shorts, live). */
export function parseYouTubeId(raw: string): string | null {
  const value = raw.trim();
  if (YOUTUBE_ID.test(value)) return value;
  const url = parseUrl(value);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname)) return null;
  let candidate: string | null = null;
  if (url.hostname === "youtu.be") candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  else if (url.searchParams.get("v")) candidate = url.searchParams.get("v");
  else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["embed", "shorts", "live", "v"].includes(parts[0])) candidate = parts[1];
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/** ID numérico do Vimeo a partir de ID ou URL (vimeo.com/<id>, player.vimeo.com/video/<id>). */
export function parseVimeoId(raw: string): string | null {
  const value = raw.trim();
  if (VIMEO_ID.test(value)) return value;
  const url = parseUrl(value);
  if (!url || !VIMEO_HOSTS.has(url.hostname)) return null;
  return url.pathname.split("/").filter(Boolean).find((p) => VIMEO_ID.test(p)) ?? null;
}

export function parseMediaRef(provider: string, raw: string): string | null {
  if (provider === "embed_youtube") return parseYouTubeId(raw);
  if (provider === "embed_vimeo") return parseVimeoId(raw);
  return null;
}
