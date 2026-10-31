// Card de receita do catálogo (público): só o que o visitante pode ver pela RLS — foto, título,
// chef, tempo total, porções, dificuldade e os alérgenos e dietas DECLARADOS. Nenhum selo de
// adequação (o catálogo não usa os dados de saúde da etapa). Puro: servidor e testes.
import type { RecipeAllergen, RecipeDiet } from "./codes";
import { RECIPE_ALLERGENS, RECIPE_DIETS } from "./codes";
import type { RecipeDifficulty } from "./payload";
import type { SignerOverride } from "./showcase";

export type RecipeCardData = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  pillar: "routine" | "training" | "nutrition" | "gastronomy";
  access_level: "free" | "premium" | null;
  difficulty: RecipeDifficulty | null;
  creator: { slug: string; name: string; avatar_url: string | null; is_fictional: boolean } | null;
  totalMinutes: number | null;
  servings: number | null;
  allergensDeclared: boolean;
  allergens: RecipeAllergen[];
  diets: RecipeDiet[];
  /** Assinatura escolhida pelo admin (0051); ausente = o autor (creator) assina. */
  signer?: SignerOverride;
};

/** Colunas do card (content + recipe_details embutido, 1:1 pela PK). */
export const RECIPE_CARD_SELECT =
  "id, slug, title, cover_url, pillar, access_level, difficulty, " +
  "creator:creator_profiles(slug, name, avatar_url, is_fictional), details:recipe_details(total_minutes, servings, diets, allergens, allergens_declared)";

type Row = Omit<RecipeCardData, "totalMinutes" | "servings" | "allergensDeclared" | "allergens" | "diets" | "signer"> & {
  details:
    | { total_minutes: number | null; servings: number | null; diets: string[] | null; allergens: string[] | null; allergens_declared: boolean | null }
    | { total_minutes: number | null; servings: number | null; diets: string[] | null; allergens: string[] | null; allergens_declared: boolean | null }[]
    | null;
};

function known<T extends string>(values: readonly unknown[] | null | undefined, allowed: readonly T[]): T[] {
  const set = new Set((values ?? []).filter((v): v is string => typeof v === "string"));
  return allowed.filter((v) => set.has(v));
}

/** Linha do PostgREST → card. Sem recipe_details (não deveria acontecer) o card fica sem os números. */
export function toRecipeCard(row: Row): RecipeCardData {
  const d = Array.isArray(row.details) ? (row.details[0] ?? null) : row.details;
  const declared = Boolean(d?.allergens_declared);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    cover_url: row.cover_url,
    pillar: row.pillar,
    access_level: row.access_level,
    difficulty: row.difficulty,
    creator: row.creator,
    totalMinutes: d?.total_minutes ?? null,
    servings: d?.servings ?? null,
    allergensDeclared: declared,
    allergens: declared ? known(d?.allergens, RECIPE_ALLERGENS) : [],
    diets: known(d?.diets, RECIPE_DIETS),
  };
}

/** Reordena os cards pela ordem dos ids do catálogo (o `in` do PostgREST não preserva ordem). */
export function orderByIds<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

/** "35 min", "1 h", "1 h 05 min" (sem depender do idioma: os rótulos vêm das mensagens). */
export function splitMinutes(minutes: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(minutes));
  return { h: Math.floor(total / 60), m: total % 60 };
}
