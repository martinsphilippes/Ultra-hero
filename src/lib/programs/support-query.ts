import "server-only";
import { maxCartQuantity } from "@/lib/catalog/creator-products";
import type { createClient } from "@/lib/supabase/server";
import { NUTRITION_PRODUCT_SELECT, type NutritionProduct, type NutritionProductData } from "./nutrition-query";

type Client = Awaited<ReturnType<typeof createClient>>;

// Produtos ligados ao programa pelo admin (0059, program_products): até 3, na ordem, com a nota
// "por que este produto". Mesmas regras de compra do resto: product_is_purchasable e, quem chama,
// kill switch do comércio e app das lojas. Sem a 0059 no banco (tabela ausente) volta vazio.

export type ProgramProduct = NutritionProduct & { note: string };

type Row = { id: string; sort_order: number; note: string; product: NutritionProductData | NutritionProductData[] | null };

export async function loadProgramProducts(supabase: Client, { programId, userId }: { programId: string; userId: string | null }): Promise<ProgramProduct[]> {
  try {
    const { data, error } = await supabase
      .from("program_products")
      .select(`id, sort_order, note, product:products(${NUTRITION_PRODUCT_SELECT})`)
      .eq("program_id", programId)
      .order("sort_order")
      .limit(3);
    if (error) return [];
    const rows = ((data ?? []) as unknown as Row[])
      .map((r) => ({ note: r.note ?? "", product: Array.isArray(r.product) ? (r.product[0] ?? null) : r.product }))
      .filter((r): r is { note: string; product: NutritionProductData } => Boolean(r.product));
    if (rows.length === 0) return [];
    const [purchasable, cartRes] = await Promise.all([
      Promise.all(rows.map(async ({ product }) => Boolean((await supabase.rpc("product_is_purchasable", { p_product: product.id })).data))),
      userId ? supabase.from("cart_items").select("product_id, quantity").in("product_id", rows.map(({ product }) => product.id)) : null,
    ]);
    const inCart = new Map((cartRes?.data ?? []).map((row) => [row.product_id, row.quantity]));
    return rows
      .filter((_, i) => purchasable[i])
      .map(({ note, product }) => ({ product, usedIn: [], note, maxQuantity: maxCartQuantity(product.demo_stock), inCart: inCart.get(product.id) ?? 0 }));
  } catch {
    return [];
  }
}
