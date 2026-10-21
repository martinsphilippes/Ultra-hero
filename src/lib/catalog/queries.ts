// Seleções padronizadas para cards. Use com supabase.from(...).select(X_SELECT)
// e tipe o resultado com o tipo correspondente (cast via `as unknown as`).
import type { AccessLevel, ContentType, LocaleCode, Pillar } from "@/lib/supabase/helpers";

export const CONTENT_CARD_SELECT =
  "id, slug, title, summary, cover_url, pillar, type, duration_minutes, difficulty, access_level, is_featured, has_captions, source_locale, published_at, " +
  "required_module:plan_modules(code, name), creator:creator_profiles(slug, name, avatar_url)";

export type ContentCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_url: string | null;
  pillar: Pillar;
  type: ContentType;
  duration_minutes: number | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  access_level: AccessLevel | null;
  is_featured: boolean;
  has_captions: boolean;
  source_locale: LocaleCode;
  published_at: string | null;
  required_module: { code: string; name: string } | null;
  creator: { slug: string; name: string; avatar_url: string | null } | null;
};

// A relação programs↔program_versions é dupla; o hint desambigua para a versão atual.
export const PROGRAM_CARD_SELECT =
  "id, slug, pillar, cover_url, is_featured, " +
  "creator:creator_profiles(slug, name, avatar_url), " +
  "version:program_versions!programs_current_version_fk(title, summary, estimated_weeks)";

export type ProgramCardData = {
  id: string;
  slug: string;
  pillar: Pillar;
  cover_url: string | null;
  is_featured: boolean;
  creator: { slug: string; name: string; avatar_url: string | null } | null;
  version: { title: string; summary: string | null; estimated_weeks: number | null } | null;
};

export const CREATOR_CARD_SELECT = "id, slug, name, headline, avatar_url, cover_url, pillars, is_fictional, rights_status, rights_valid_until";

export type CreatorCardData = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  pillars: Pillar[];
  is_fictional: boolean;
  rights_status: string;
  rights_valid_until: string | null;
};

// Filtro PostgREST "no ar" (RF-007) para listas públicas: a RLS já esconde agendados do público;
// aqui evita que admin e a própria personalidade vejam agendados misturados no catálogo.
export function liveContentFilter(now: Date = new Date()): string {
  return `publish_at.is.null,publish_at.lte.${now.toISOString()}`;
}

// attributes entra só pelo external_url (link da loja oficial); o resto do jsonb fica na página do produto.
export const PRODUCT_CARD_SELECT =
  "id, slug, title, image_url, price_cents_demo, availability, attributes, " +
  "category:product_categories(code, name), seller:seller_organizations(slug, name)";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  image_url: string;
  price_cents_demo: number;
  availability: "available" | "unavailable";
  /** jsonb livre do produto; opcional porque a loja usa um select próprio sem ele. */
  attributes?: unknown;
  category: { code: string; name: Record<string, string> } | null;
  seller: { slug: string; name: string } | null;
};

// Rótulo localizado de campos jsonb {"pt-BR":..,"en":..,"es":..} com fallback.
export function localizedLabel(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const map = value as Record<string, string>;
  return map[locale] ?? map["pt-BR"] ?? Object.values(map)[0] ?? "";
}
