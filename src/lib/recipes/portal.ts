// Regras puras de "Minhas Receitas" (Portal do Chef): situação derivada de status + revisão +
// agendamento, filtros da URL (Zod com .catch: valor ruim vira "sem filtro") e indicadores.
import { z } from "zod";
import { isLive } from "./media";
import { RECIPE_DIFFICULTIES } from "./payload";

export const MY_RECIPE_STATUSES = ["draft", "in_review", "returned", "scheduled", "published", "archived"] as const;
export type MyRecipeStatus = (typeof MY_RECIPE_STATUSES)[number];

type StatusInput = { status: string; review_status: string; publish_at: string | null };

/** "Agendada" = publicada com data futura; "devolvida" inclui a rejeitada (a mensagem do admin explica). */
export function myRecipeStatus(row: StatusInput, now: Date = new Date()): MyRecipeStatus {
  if (row.status === "archived") return "archived";
  if (row.status === "published") return isLive(row.status, row.publish_at, now) ? "published" : "scheduled";
  if (row.review_status === "in_review") return "in_review";
  if (row.review_status === "returned" || row.review_status === "rejected") return "returned";
  return "draft";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const myRecipesFilterSchema = z.object({
  q: z.string().trim().max(80).catch(""),
  cat: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(40)
    .or(z.literal(""))
    .catch(""),
  status: z.enum(["all", ...MY_RECIPE_STATUSES]).catch("all"),
  diff: z.enum(["all", ...RECIPE_DIFFICULTIES]).catch("all"),
  from: z.string().regex(DATE).or(z.literal("")).catch(""),
  to: z.string().regex(DATE).or(z.literal("")).catch(""),
});
export type MyRecipesFilters = z.infer<typeof myRecipesFilterSchema>;

export function parseMyRecipesFilters(raw: Record<string, string | string[] | undefined>): MyRecipesFilters {
  const pick = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : undefined);
  return myRecipesFilterSchema.parse({ q: pick("q"), cat: pick("cat"), status: pick("status"), diff: pick("diff"), from: pick("from"), to: pick("to") });
}

export function hasActiveFilters(f: MyRecipesFilters): boolean {
  return f.q !== "" || f.cat !== "" || f.status !== "all" || f.diff !== "all" || f.from !== "" || f.to !== "";
}

/** Escapa % _ \ para usar o texto num ilike sem curinga acidental. */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/** Intervalo de datas (dia inteiro, UTC) para filtrar por "atualizada em". Datas invertidas são trocadas. */
export function dateRange(from: string, to: string): { gte: string | null; lt: string | null } {
  let a = from || null;
  let b = to || null;
  if (a && b && a > b) [a, b] = [b, a];
  const next = (d: string) => {
    const date = new Date(`${d}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  };
  return { gte: a ? `${a}T00:00:00.000Z` : null, lt: b ? next(b) : null };
}

export type RecipeStats = { visitors: number; favorites: number; ratingCount: number; ratingAvg: number | null };

/** Visitantes só aparecem a partir de 5 (aproximado, decisão do desenho); nota só com 3 avaliações. */
export const MIN_VISITORS_SHOWN = 5;
export const MIN_RATINGS_SHOWN = 3;

export type StatsDisplay = { visitors: number | null; favorites: number | null; rating: number | null };

/** Só dado real: abaixo do mínimo (ou zero) o indicador não aparece ("—"). */
export function statsDisplay(stats: RecipeStats | undefined): StatsDisplay {
  if (!stats) return { visitors: null, favorites: null, rating: null };
  return {
    visitors: stats.visitors >= MIN_VISITORS_SHOWN ? stats.visitors : null,
    favorites: stats.favorites > 0 ? stats.favorites : null,
    rating: stats.ratingCount >= MIN_RATINGS_SHOWN && stats.ratingAvg !== null ? Math.round(stats.ratingAvg * 10) / 10 : null,
  };
}

export function hasAnyStats(list: StatsDisplay[]): boolean {
  return list.some((s) => s.visitors !== null || s.favorites !== null || s.rating !== null);
}

/** O que cada situação permite no portal (o banco confere de novo em cada RPC). */
export function recipeActions(status: MyRecipeStatus, row: { published_at: string | null; archived_by: string | null }) {
  return {
    edit: status === "draft" || status === "returned",
    unpublish: status === "published" || status === "scheduled",
    withdraw: status === "in_review",
    archive: status !== "archived",
    restore: status === "archived" && row.archived_by === "creator",
    remove: (status === "draft" || status === "returned") && row.published_at === null,
    duplicate: true,
  };
}
