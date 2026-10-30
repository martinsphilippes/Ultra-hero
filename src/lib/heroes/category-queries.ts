import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { HeroCategory, HeroCategoryLink } from "./categories";

// Leituras das categorias dos heróis (0049). Sem a 0049 no banco (tabelas ausentes) ou com erro de
// leitura, devolve listas vazias: a aba Hero mostra só "Todos" e os cards ficam sem selo.

type Client = SupabaseClient<Database>;

export type HeroCategoryData = { categories: HeroCategory[]; links: HeroCategoryLink[]; available: boolean };

export async function fetchHeroCategories(supabase: Client): Promise<HeroCategoryData> {
  try {
    const [categoriesRes, linksRes] = await Promise.all([
      // ativo explícito: o admin também lê as inativas pela política de escrita
      supabase.from("hero_categories").select("id, slug, name, sort_order").eq("is_active", true).order("sort_order").order("slug"),
      supabase.from("creator_category_links").select("creator_id, category_id, position"),
    ]);
    if (categoriesRes.error || linksRes.error) return { categories: [], links: [], available: false };
    const categories = (categoriesRes.data ?? []).map((row) => ({ id: row.id, slug: row.slug, name: row.name, sortOrder: row.sort_order }));
    const active = new Set(categories.map((c) => c.id));
    const links = (linksRes.data ?? [])
      .filter((row) => active.has(row.category_id))
      .map((row) => ({ creatorId: row.creator_id, categoryId: row.category_id, position: row.position }));
    return { categories, links, available: true };
  } catch {
    return { categories: [], links: [], available: false };
  }
}
