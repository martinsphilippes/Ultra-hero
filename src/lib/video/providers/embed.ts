import {
  InvalidMediaRefError,
  type EmbedInfo,
  type MediaRef,
  type PlaybackOptions,
  type PlaybackSource,
  type VideoProvider,
} from "../types";

// Provedor de custo zero do POC: YouTube e Vimeo via iframe com domínios de privacidade.
// Aceita ID puro ou URL conhecida; qualquer outra coisa é rejeitada (nunca monta src a partir de texto livre).

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Extrai o ID de um vídeo do YouTube a partir de ID ou URL (watch, youtu.be, embed, shorts, live). */
export function parseYouTubeId(raw: string): string | null {
  const value = raw.trim();
  if (YOUTUBE_ID.test(value)) return value;
  const url = parseUrl(value);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname) || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  let candidate: string | null = null;
  if (url.hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.searchParams.get("v")) {
    candidate = url.searchParams.get("v");
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["embed", "shorts", "live", "v"].includes(parts[0])) candidate = parts[1];
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/** Extrai o ID numérico de um vídeo do Vimeo a partir de ID ou URL (vimeo.com/<id>, player.vimeo.com/video/<id>). */
export function parseVimeoId(raw: string): string | null {
  const value = raw.trim();
  if (VIMEO_ID.test(value)) return value;
  const url = parseUrl(value);
  if (!url || !VIMEO_HOSTS.has(url.hostname) || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = parts.find((p) => VIMEO_ID.test(p)) ?? null;
  return candidate;
}

function youtubeLang(locale?: string): string | undefined {
  if (!locale) return undefined;
  const base = locale.toLowerCase().split("-")[0];
  return ["pt", "en", "es"].includes(base) ? base : undefined;
}

export class EmbedProvider implements VideoProvider {
  readonly kind = "embed" as const;

  /** Valida a referência e devolve a URL segura do player. */
  private buildUrl(ref: MediaRef, locale?: string): string {
    if (ref.source === "youtube") {
      const id = parseYouTubeId(ref.id);
      if (!id) throw new InvalidMediaRefError("ID do YouTube inválido");
      const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      url.searchParams.set("rel", "0");
      url.searchParams.set("modestbranding", "1");
      url.searchParams.set("playsinline", "1");
      const lang = youtubeLang(locale);
      if (lang) {
        url.searchParams.set("hl", lang);
        url.searchParams.set("cc_lang_pref", lang);
      }
      return url.toString();
    }
    if (ref.source === "vimeo") {
      const id = parseVimeoId(ref.id);
      if (!id) throw new InvalidMediaRefError("ID do Vimeo inválido");
      const url = new URL(`https://player.vimeo.com/video/${id}`);
      url.searchParams.set("dnt", "1");
      url.searchParams.set("playsinline", "1");
      return url.toString();
    }
    throw new InvalidMediaRefError("fonte de embed desconhecida");
  }

  getEmbed(ref: MediaRef): EmbedInfo {
    return { url: this.buildUrl(ref), aspectRatio: "16/9" };
  }

  async getPlaybackSource(ref: MediaRef, opts: PlaybackOptions): Promise<PlaybackSource> {
    // Embeds não têm URL assinada: no POC o premium é protegido pela UI/RLS (aviso apenas em dev).
    if (opts.signed && process.env.NODE_ENV !== "production") {
      console.warn("[video] EmbedProvider ignora `signed`: embeds não suportam URL assinada.");
    }
    try {
      return { type: "iframe", url: this.buildUrl(ref, opts.locale), title: "" };
    } catch (error) {
      if (error instanceof InvalidMediaRefError) return { type: "unavailable", reason: "invalid-ref" };
      throw error;
    }
  }
}
