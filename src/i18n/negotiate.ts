import { defaultLocale, locales, type Locale } from "./config";

// Mapeia uma tag de idioma (ex.: "pt-PT", "es-MX", "en-GB") para um locale suportado.
function matchTag(tag: string): Locale | null {
  const lower = tag.toLowerCase();
  if (lower === "*") return null;
  const exact = locales.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split("-")[0];
  if (base === "pt") return "pt-BR";
  return locales.find((l) => l.toLowerCase().split("-")[0] === base) ?? null;
}

// Negocia o idioma a partir do cabeçalho Accept-Language (q-values respeitados).
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const candidates = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((c) => c.tag && c.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const candidate of candidates) {
    const matched = matchTag(candidate.tag);
    if (matched) return matched;
  }
  return defaultLocale;
}
