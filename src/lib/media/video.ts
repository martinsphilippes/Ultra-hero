// Vídeo do entregável (0083): reconhecer o link (YouTube, Vimeo ou arquivo de vídeo direto), montar o player
// embutido já no segundo certo e converter o tempo do comentário (mm:ss ↔ segundos). Lógica pura (vitest).

export type VideoSource = { kind: "youtube"; id: string } | { kind: "vimeo"; id: string } | { kind: "file"; url: string };

export const MAX_SECONDS = 86400;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function parseHttps(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Id do vídeo do YouTube (watch, youtu.be, shorts, embed, live; com ou sem www/m). */
export function youTubeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = parseHttps(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

/** Id numérico do Vimeo (vimeo.com/123, vimeo.com/channels/x/123, player.vimeo.com/video/123). */
export function vimeoId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = parseHttps(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = [...parts].reverse().find((p) => /^\d{5,12}$/.test(p));
  return id ?? null;
}

/** Arquivo de vídeo direto (https, extensão de vídeo). */
export function isVideoFileUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const url = parseHttps(raw);
  return Boolean(url && /\.(mp4|webm|mov|m4v|ogv)$/i.test(url.pathname));
}

export function videoSource(raw: string | null | undefined): VideoSource | null {
  const yt = youTubeId(raw);
  if (yt) return { kind: "youtube", id: yt };
  const vm = vimeoId(raw);
  if (vm) return { kind: "vimeo", id: vm };
  if (raw && isVideoFileUrl(raw)) return { kind: "file", url: raw.trim() };
  return null;
}

/** Endereço do player embutido começando em `seconds` (sem cookies do YouTube; autoplay quando há tempo). */
export function embedUrl(source: VideoSource, seconds: number | null): string {
  const s = seconds !== null && Number.isFinite(seconds) ? Math.max(0, Math.min(MAX_SECONDS, Math.floor(seconds))) : null;
  if (source.kind === "youtube") return `https://www.youtube-nocookie.com/embed/${source.id}?rel=0${s !== null ? `&start=${s}&autoplay=1` : ""}`;
  if (source.kind === "vimeo") return `https://player.vimeo.com/video/${source.id}${s !== null ? `?autoplay=1#t=${s}s` : ""}`;
  return s !== null ? `${source.url.split("#")[0]}#t=${s}` : source.url;
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "1:15" → 75; "01:02:05" → 3725; "90" → 90; vazio → null; inválido → undefined. */
export function parseTimestamp(text: string): number | null | undefined {
  const v = text.trim();
  if (!v) return null;
  if (/^\d{1,5}$/.test(v)) {
    const n = Number(v);
    return n <= MAX_SECONDS ? n : undefined;
  }
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const [, h, mm, ss] = m;
  if (Number(ss) > 59 || (h !== undefined && Number(mm) > 59)) return undefined;
  const total = Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
  return total <= MAX_SECONDS ? total : undefined;
}
