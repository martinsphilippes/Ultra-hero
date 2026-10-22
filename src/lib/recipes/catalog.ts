import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { orderByIds, RECIPE_CARD_SELECT, toRecipeCard, type RecipeCardData } from "./card";
import { nextRecipeCursor, RECIPE_PAGE_SIZE, recipeCatalogArgs, type RecipeCatalogParams } from "./catalog-params";
import { RECIPE_CATEGORY_CODES } from "./codes";

// Leitura do catálogo de receitas com o cliente de quem pede (a RLS decide): recipe_catalog (0027,
// invoker) devolve só ids e cursor, e os cards vêm numa segunda consulta (content + recipe_details),
// na mesma ordem. Sem `can_access_content` aqui: os cards são públicos (P2); abrir a receita é que
// exige a etapa demonstrativa.

type Client = SupabaseClient<Database>;

export type RecipeCatalogPage = { items: RecipeCardData[]; nextCursor: string | null };

/** Cards pelos ids, na ordem pedida. Ids fora do ar ou invisíveis pela RLS simplesmente somem. */
export async function loadRecipeCards(supabase: Client, ids: readonly string[]): Promise<RecipeCardData[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("content").select(RECIPE_CARD_SELECT).in("id", [...ids]).eq("type", "recipe");
  if (error) throw new Error(error.message);
  return orderByIds(((data ?? []) as unknown as Parameters<typeof toRecipeCard>[0][]).map(toRecipeCard), ids);
}

/** Uma página do catálogo. `exclude` tira ids (a receita aberta, nas relacionadas). */
export async function fetchRecipeCatalog(
  supabase: Client,
  params: RecipeCatalogParams,
  opts: { creator?: string | null; cursor?: string | null; limit?: number; exclude?: readonly string[] } = {},
): Promise<RecipeCatalogPage> {
  const limit = opts.limit ?? RECIPE_PAGE_SIZE;
  const { data, error } = await supabase.rpc("recipe_catalog", recipeCatalogArgs(params, { creator: opts.creator, cursor: opts.cursor, limit }));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { content_id: string; cursor: string | null }[];
  const exclude = new Set(opts.exclude ?? []);
  const ids = rows.map((r) => r.content_id).filter((id) => !exclude.has(id));
  return { items: await loadRecipeCards(supabase, ids), nextCursor: nextRecipeCursor(rows, limit) };
}

export type RecipeCategoryOption = { code: string; label: string };

/**
 * Categorias ativas, na ordem do admin, com o nome no idioma da tela (cai para pt-BR e, se a tabela
 * não existir ainda, para a taxonomia fixa das mensagens).
 */
export async function loadRecipeCategories(supabase: Client, locale: string, fallbackLabel: (code: string) => string): Promise<RecipeCategoryOption[]> {
  const { data, error } = await supabase.from("recipe_categories").select("code, name, sort_order").eq("active", true).order("sort_order").order("code");
  if (error || !data) return RECIPE_CATEGORY_CODES.map((code) => ({ code, label: fallbackLabel(code) }));
  return (data as { code: string; name: Record<string, string> | null }[]).map((c) => ({
    code: c.code,
    label: c.name?.[locale] ?? (RECIPE_CATEGORY_CODES.includes(c.code as (typeof RECIPE_CATEGORY_CODES)[number]) ? fallbackLabel(c.code) : (c.name?.["pt-BR"] ?? c.code)),
  }));
}
