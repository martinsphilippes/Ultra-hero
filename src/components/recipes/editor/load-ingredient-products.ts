import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientLink, IngredientLinkStatus } from "@/lib/recipes/ingredient-products";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export const INGREDIENT_LINK_SELECT = "id, ingredient_id, status, note, suspended_reason, updated_at, product:products(id, title)";

type Row = {
  id: string;
  ingredient_id: string;
  status: IngredientLinkStatus;
  note: string | null;
  suspended_reason: string | null;
  updated_at: string;
  product: { id: string; title: string } | { id: string; title: string }[] | null;
};

/** Linha do banco + "comprável agora" (product_is_purchasable) → o que o editor mostra. */
export async function toIngredientLinks(supabase: Client, rows: Row[]): Promise<IngredientLink[]> {
  const products = [...new Set(rows.map((r) => (Array.isArray(r.product) ? r.product[0] : r.product)?.id).filter((id): id is string => Boolean(id)))];
  const purchasable = new Map(await Promise.all(products.map(async (id) => [id, Boolean((await supabase.rpc("product_is_purchasable", { p_product: id })).data)] as const)));
  return rows.map((r) => {
    const p = Array.isArray(r.product) ? (r.product[0] ?? null) : r.product;
    return {
      id: r.id,
      ingredientId: r.ingredient_id,
      status: r.status,
      note: r.note,
      suspendedReason: r.suspended_reason,
      updatedAt: r.updated_at,
      product: p ? { id: p.id, title: p.title, purchasable: purchasable.get(p.id) ?? false } : null,
    };
  });
}

/**
 * Vínculos ingrediente ↔ produto da receita do herói (a RLS da 0027 devolve ao dono todos os
 * estados). Sem a tabela ou sem leitura: lista vazia e o campo some (available=false).
 */
export async function loadIngredientProductLinks(supabase: Client, contentId: string): Promise<{ available: boolean; links: IngredientLink[] }> {
  const { data, error } = await supabase.from("recipe_ingredient_products").select(INGREDIENT_LINK_SELECT).eq("content_id", contentId).order("updated_at", { ascending: false }).limit(300);
  if (error) return { available: false, links: [] };
  return { available: true, links: await toIngredientLinks(supabase, (data ?? []) as unknown as Row[]) };
}
