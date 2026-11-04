// Saneamento do que vem do banco (módulo puro, testado): mesmo com os checks da 0100, o app só usa cores #rrggbb,
// URLs do bucket theme-assets ou ilustrações do próprio app em /temas/ (0102) e links internos/https — o tema nunca injeta CSS ou endereço arbitrário.
import type { Decoration, PublicSeasonTheme, SeasonArea, ThemeBackground, ThemeBanner, ThemeTokens } from "./vocab";
import { DECOR_POSITIONS, DECOR_SIZES, isAssetUrl, isBannerHref, isHexColor, isSeasonArea } from "./vocab";

type Row = Record<string, unknown>;

export function sanitizeTokens(value: unknown): ThemeTokens {
  const out: ThemeTokens = {};
  if (!value || typeof value !== "object") return out;
  for (const mode of ["light", "dark"] as const) {
    const m = (value as Record<string, unknown>)[mode];
    if (!m || typeof m !== "object") continue;
    const clean: Record<string, string> = {};
    for (const key of ["accent", "accentSoft", "bg", "surface"]) {
      const c = (m as Record<string, unknown>)[key];
      if (isHexColor(c)) clean[key] = c;
    }
    if (Object.keys(clean).length) out[mode] = clean;
  }
  return out;
}

export function sanitizeBackground(value: unknown): ThemeBackground {
  const v = (value ?? {}) as Record<string, unknown>;
  const intensity = typeof v.intensity === "number" ? Math.min(40, Math.max(5, v.intensity)) : 20;
  if (v.type === "gradient" && isHexColor(v.from) && isHexColor(v.to)) {
    return { type: "gradient", from: v.from, to: v.to, angle: typeof v.angle === "number" ? v.angle : 180, intensity };
  }
  if (v.type === "image" && isAssetUrl(v.url)) return { type: "image", url: v.url, fit: v.fit === "repeat" ? "repeat" : "cover", intensity };
  return { type: "none" };
}

export function sanitizeDecorations(value: unknown): Decoration[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((d): d is Decoration => !!d && typeof d === "object" && isAssetUrl(d.url) && (DECOR_POSITIONS as readonly string[]).includes(d.position) && (DECOR_SIZES as readonly string[]).includes(d.size))
    .slice(0, 6)
    .map((d) => ({ url: d.url, position: d.position, size: d.size }));
}

export function sanitizeBanner(value: unknown): ThemeBanner {
  const v = (value ?? {}) as Record<string, unknown>;
  const text = v.text as Record<string, unknown> | undefined;
  if (!text || typeof text["pt-BR"] !== "string" || !text["pt-BR"].trim()) return {};
  const pick = (o: Record<string, unknown> | undefined, max: number) => {
    const r: Record<string, string> = {};
    for (const l of ["pt-BR", "en", "es"]) if (o && typeof o[l] === "string") r[l] = (o[l] as string).slice(0, max);
    return r;
  };
  return {
    text: pick(text, 120) as ThemeBanner["text"],
    label: pick(v.label as Record<string, unknown> | undefined, 40),
    href: isBannerHref(v.href) ? v.href : undefined,
  };
}

/** Linha do banco (snake_case, colunas públicas) → tema público saneado; janela incompleta → null. */
export function toPublicTheme(r: Row): PublicSeasonTheme | null {
  if (typeof r.id !== "string" || typeof r.window_start !== "string" || typeof r.window_end !== "string") return null;
  const areas = Array.isArray(r.areas) ? r.areas.filter(isSeasonArea) : [];
  return {
    id: r.id,
    priority: typeof r.priority === "number" ? r.priority : 0,
    areas: areas as SeasonArea[],
    tokens: sanitizeTokens(r.tokens),
    background: sanitizeBackground(r.background),
    decorations: sanitizeDecorations(r.decorations),
    animations: r.animations === true,
    banner: sanitizeBanner(r.banner),
    windowStart: r.window_start,
    windowEnd: r.window_end,
  };
}
