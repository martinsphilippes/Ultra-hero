import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pageSlice, parseFilterParam, productsForFilter, resolveFilter, SHOP_PAGE_SIZE, visibleFilters, type ShopFilterRule, type ShopIndexItem } from "./filters";

// Leituras da aba Comprar. A visibilidade do produto é a da loja (publicado, sem moderação,
// fornecedor ativo) e a RLS de products continua valendo; os filtros (0047) só recortam.

type Client = SupabaseClient<Database>;

export type ShopTileData = {
  id: string;
  slug: string;
  title: string;
  image_url: string;
  price_cents_demo: number;
  availability: "available" | "unavailable";
  demo_stock: number | null;
};

export type VisibleShopFilter = ShopFilterRule & { count: number };

/** Teto do índice leve (id + categoria) da loja; o catálogo de demonstração tem dezenas. */
const INDEX_LIMIT = 1000;

const TILE_SELECT = "id, slug, title, image_url, price_cents_demo, availability, demo_stock";

type FilterRow = {
  id: string;
  slug: string;
  name: unknown;
  sort_order: number;
  categories: { category: { code: string } | null }[] | null;
  products: { product_id: string }[] | null;
};

/**
 * Filtros ativos na ordem do admin. Sem a 0047 no banco (tabela ausente) ou com erro de leitura,
 * devolve [] e a loja mostra só "Tudo" com todos os produtos.
 */
export async function fetchShopFilters(supabase: Client): Promise<ShopFilterRule[]> {
  try {
    const { data, error } = await supabase
      .from("shop_filters")
      .select("id, slug, name, sort_order, categories:shop_filter_categories(category:product_categories(code)), products:shop_filter_products(product_id)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("slug", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as FilterRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sort_order,
      categoryCodes: (row.categories ?? []).map((c) => c.category?.code).filter((code): code is string => Boolean(code)),
      productIds: (row.products ?? []).map((p) => p.product_id),
    }));
  } catch {
    return [];
  }
}

type IndexRow = { id: string; category: { code: string } | null };

/** Produtos visíveis na loja (só id e categoria), do mais novo para o mais antigo. */
export async function fetchShopIndex(supabase: Client): Promise<ShopIndexItem[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, category:product_categories!inner(code), seller:seller_organizations!inner(status)")
    .eq("status", "published")
    .eq("moderation_status", "clear")
    .eq("seller.status", "active")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(INDEX_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as IndexRow[]).map((row) => ({ id: row.id, categoryCode: row.category?.code ?? null }));
}

/** Dados dos quadros, na ordem dos ids pedidos. */
export async function fetchShopTiles(supabase: Client, ids: string[]): Promise<ShopTileData[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("products").select(TILE_SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map(((data ?? []) as unknown as ShopTileData[]).map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ShopTileData => Boolean(row));
}

export type ShopView = {
  filters: VisibleShopFilter[];
  selected: VisibleShopFilter | null;
  total: number;
  tiles: ShopTileData[];
  hasMore: boolean;
  nextOffset: number;
};

/** Chips visíveis, filtro escolhido e uma página de quadros a partir do offset. */
export async function loadShopView(supabase: Client, rawFilter: string | string[] | null | undefined, offset = 0): Promise<ShopView> {
  const [rules, index] = await Promise.all([fetchShopFilters(supabase), fetchShopIndex(supabase)]);
  const filters = visibleFilters(rules, index);
  const selected = resolveFilter(parseFilterParam(rawFilter), filters);
  const items = productsForFilter(index, selected);
  const { page, hasMore, nextOffset } = pageSlice(items, offset, SHOP_PAGE_SIZE);
  const tiles = await fetchShopTiles(
    supabase,
    page.map((item) => item.id),
  );
  return { filters, selected, total: items.length, tiles, hasMore, nextOffset };
}
