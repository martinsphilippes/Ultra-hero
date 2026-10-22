// Parâmetros do catálogo de receitas (aba Receitas do Explorar e busca dentro do chef). Puro: lido
// no servidor, na action "carregar mais" e nos testes. Tudo vive na URL (compartilhável, sem JS);
// valor inválido cai no padrão em vez de quebrar a página. Dieta e alérgeno só entram quando a
// pessoa marca: o catálogo nunca usa os dados de saúde da etapa demonstrativa (seção 2.6).
import { z } from "zod";
import { RECIPE_ALLERGENS, RECIPE_CATALOG_SORTS, RECIPE_DIETS, type RecipeAllergen, type RecipeDiet } from "./codes";
import { RECIPE_DIFFICULTIES, type RecipeDifficulty } from "./payload";

export const RECIPE_TIME_LIMITS = [15, 30, 60] as const;
export type RecipeTimeLimit = (typeof RECIPE_TIME_LIMITS)[number];
export type RecipeCatalogSort = (typeof RECIPE_CATALOG_SORTS)[number];

/** Itens por carga do catálogo (6 linhas de 4 no desktop; recipe_catalog aceita até 48). */
export const RECIPE_PAGE_SIZE = 24;
export const RECIPE_QUERY_MAX = 100;

export type RecipeCatalogParams = {
  q: string;
  cat: string | null;
  tempo: RecipeTimeLimit | null;
  dif: RecipeDifficulty | null;
  dieta: RecipeDiet[];
  sem: RecipeAllergen[];
  ordem: RecipeCatalogSort;
};

export const EMPTY_RECIPE_PARAMS: RecipeCatalogParams = { q: "", cat: null, tempo: null, dif: null, dieta: [], sem: [], ordem: "relevance" };

type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const all = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

/** Mantém só os códigos conhecidos, sem repetir e na ordem da lista fixa (URL estável). */
function known<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const set = new Set(values);
  return allowed.filter((v) => set.has(v));
}

const CATEGORY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const recipeCatalogParamsSchema = z.object({
  q: z.string().catch("").transform((s) => s.trim().slice(0, RECIPE_QUERY_MAX)),
  cat: z
    .string()
    .max(40)
    .regex(CATEGORY)
    .nullable()
    .catch(null),
  tempo: z.union([z.literal(15), z.literal(30), z.literal(60)]).nullable().catch(null),
  dif: z.enum(RECIPE_DIFFICULTIES).nullable().catch(null),
  dieta: z.array(z.enum(RECIPE_DIETS)).max(RECIPE_DIETS.length).catch([]),
  sem: z.array(z.enum(RECIPE_ALLERGENS)).max(RECIPE_ALLERGENS.length).catch([]),
  ordem: z.enum(RECIPE_CATALOG_SORTS).catch("relevance"),
});

export function parseRecipeCatalogParams(raw: Raw): RecipeCatalogParams {
  const tempo = Number(first(raw.tempo));
  return recipeCatalogParamsSchema.parse({
    q: first(raw.q) ?? "",
    cat: first(raw.cat) || null,
    tempo: Number.isFinite(tempo) ? tempo : null,
    dif: first(raw.dif) || null,
    dieta: known(all(raw.dieta), RECIPE_DIETS),
    sem: known(all(raw.sem), RECIPE_ALLERGENS),
    ordem: first(raw.ordem) ?? "relevance",
  });
}

export type RecipeFilterKey = "cat" | "tempo" | "dif" | "dieta" | "sem";
export type ActiveRecipeFilter = { key: RecipeFilterKey; value: string };

/** Filtros marcados (sem a busca nem a ordem), na ordem em que aparecem na tela. */
export function activeRecipeFilters(p: RecipeCatalogParams): ActiveRecipeFilter[] {
  return [
    ...(p.cat ? [{ key: "cat" as const, value: p.cat }] : []),
    ...(p.tempo ? [{ key: "tempo" as const, value: String(p.tempo) }] : []),
    ...(p.dif ? [{ key: "dif" as const, value: p.dif }] : []),
    ...p.dieta.map((value) => ({ key: "dieta" as const, value })),
    ...p.sem.map((value) => ({ key: "sem" as const, value })),
  ];
}

/** Há busca ou filtro? (a ordem sozinha não conta: não muda o que aparece) */
export function hasRecipeCriteria(p: RecipeCatalogParams): boolean {
  return p.q !== "" || activeRecipeFilters(p).length > 0;
}

/** Tira um filtro (chip removível); os demais ficam. */
export function withoutRecipeFilter(p: RecipeCatalogParams, filter: ActiveRecipeFilter): RecipeCatalogParams {
  switch (filter.key) {
    case "cat":
      return { ...p, cat: null };
    case "tempo":
      return { ...p, tempo: null };
    case "dif":
      return { ...p, dif: null };
    case "dieta":
      return { ...p, dieta: p.dieta.filter((d) => d !== filter.value) };
    case "sem":
      return { ...p, sem: p.sem.filter((a) => a !== filter.value) };
  }
}

/** Pares chave/valor da URL (repetidos para dieta e sem); omite o padrão. */
export function recipeParamEntries(p: RecipeCatalogParams): [string, string][] {
  const out: [string, string][] = [];
  if (p.q) out.push(["q", p.q]);
  if (p.cat) out.push(["cat", p.cat]);
  if (p.tempo) out.push(["tempo", String(p.tempo)]);
  if (p.dif) out.push(["dif", p.dif]);
  for (const d of p.dieta) out.push(["dieta", d]);
  for (const a of p.sem) out.push(["sem", a]);
  if (p.ordem !== "relevance") out.push(["ordem", p.ordem]);
  return out;
}

/**
 * Endereço do catálogo com estes parâmetros. `base` é a rota ("/explore" ou a biblioteca do chef);
 * `fixed` vem antes (ex.: tab=receitas no Explorar).
 */
export function recipeCatalogHref(base: string, p: RecipeCatalogParams, fixed: [string, string][] = []): string {
  const sp = new URLSearchParams([...fixed, ...recipeParamEntries(p)]);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Nomes dos filtros usados, para o evento recipe.catalog_filter: nunca os valores (dieta e alergia são dado de saúde). */
export function catalogFilterNames(p: RecipeCatalogParams): string[] {
  const names: string[] = [];
  if (p.q) names.push("q");
  if (p.cat) names.push("cat");
  if (p.tempo) names.push("tempo");
  if (p.dif) names.push("dif");
  if (p.dieta.length) names.push("dieta");
  if (p.sem.length) names.push("sem");
  if (p.ordem !== "relevance") names.push("ordem");
  return names;
}

/** Argumentos de public.recipe_catalog (0027); listas vazias viram nulo (= sem filtro). */
export function recipeCatalogArgs(p: RecipeCatalogParams, opts: { creator?: string | null; cursor?: string | null; limit?: number } = {}) {
  return {
    p_query: p.q || undefined,
    p_categories: p.cat ? [p.cat] : undefined,
    p_max_minutes: p.tempo ?? undefined,
    p_difficulty: p.dif ?? undefined,
    p_diets: p.dieta.length ? p.dieta : undefined,
    p_exclude_allergens: p.sem.length ? p.sem : undefined,
    p_creator: opts.creator ?? undefined,
    p_sort: p.ordem,
    p_cursor: opts.cursor ?? undefined,
    p_limit: opts.limit ?? RECIPE_PAGE_SIZE,
  };
}

/**
 * Cursor da próxima página a partir das linhas devolvidas: só existe quando a página veio cheia
 * (a função devolve o cursor de cada linha; o da última continua a lista).
 */
export function nextRecipeCursor(rows: { cursor: string | null }[], limit: number = RECIPE_PAGE_SIZE): string | null {
  if (rows.length < limit) return null;
  return rows[rows.length - 1]?.cursor ?? null;
}
