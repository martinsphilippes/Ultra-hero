import { z } from "zod";
import { CONTENT_TYPES, PILLARS, type ContentType, type Pillar } from "@/lib/supabase/helpers";

// Parâmetros da URL do Explorar. Tudo que é filtro vive na URL (compartilhável, sem JS).
// A aba "receitas" tem filtros próprios (decisão 1), lidos por parseRecipeCatalogParams.
export const EXPLORE_TABS = ["conteudos", "receitas", "programas", "produtos", "listas"] as const;
export type ExploreTab = (typeof EXPLORE_TABS)[number];

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ACCESS_LEVELS = ["free", "premium"] as const;
export type Access = (typeof ACCESS_LEVELS)[number];

export type ExploreParams = {
  tab: ExploreTab;
  q: string;
  pillar?: Pillar;
  type?: ContentType;
  access?: Access;
  difficulty?: Difficulty;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const MAX_QUERY_LENGTH = 100;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const schema = z.object({
  tab: z.enum(EXPLORE_TABS).catch("conteudos"),
  q: z.string().catch("").transform((s) => s.trim().slice(0, MAX_QUERY_LENGTH)),
  pillar: z.enum(PILLARS).optional().catch(undefined),
  type: z.enum(CONTENT_TYPES).optional().catch(undefined),
  access: z.enum(ACCESS_LEVELS).optional().catch(undefined),
  difficulty: z.enum(DIFFICULTIES).optional().catch(undefined),
});

// Valores inválidos caem no padrão em vez de quebrar a página.
export function parseExploreParams(raw: RawSearchParams): ExploreParams {
  return schema.parse({
    tab: first(raw.tab),
    q: first(raw.q),
    pillar: first(raw.pillar),
    type: first(raw.type),
    access: first(raw.access),
    difficulty: first(raw.difficulty),
  });
}

type Overrides = Partial<{ [K in keyof ExploreParams]: ExploreParams[K] | null }>;

// Monta /explore?… a partir dos parâmetros atuais; `null` remove a chave.
export function exploreHref(params: Partial<ExploreParams>, overrides: Overrides = {}): string {
  const merged: Record<string, string | undefined> = { ...params };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  const sp = new URLSearchParams();
  if (merged.tab && merged.tab !== "conteudos") sp.set("tab", merged.tab);
  if (merged.q) sp.set("q", merged.q);
  for (const key of ["pillar", "type", "access", "difficulty"] as const) {
    if (merged[key]) sp.set(key, merged[key] as string);
  }
  const qs = sp.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export function activeFilterCount(params: ExploreParams): number {
  return [params.pillar, params.type, params.access, params.difficulty].filter(Boolean).length;
}

// Filtros "secundários" (fora da linha de pilares).
export function secondaryFilterCount(params: ExploreParams): number {
  return [params.type, params.access, params.difficulty].filter(Boolean).length;
}
