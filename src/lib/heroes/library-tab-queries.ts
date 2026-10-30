import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoryLinkRow, CategoryTabRow, OverrideRow } from "./library-tabs";

// Leituras da configuração dos atalhos do herói (0050). Sem a 0050 no banco (tabelas ausentes) ou
// com erro de leitura, devolve listas vazias: a página do herói usa os padrões do código.

type Client = SupabaseClient<Database>;

export type CreatorLibraryConfig = {
  links: CategoryLinkRow[];
  categoryRows: CategoryTabRow[];
  overrideRows: OverrideRow[];
  /** false = 0050 ausente ou erro (os padrões valem). */
  available: boolean;
};

type TabRow = { source_key: string; label: unknown; icon: string | null; sort_order: number; is_visible: boolean };
type LinkRow = { category_id: string; position: number; category: { id: string; is_active: boolean; tabs: TabRow[] | null } | null };
type OverrideDbRow = { source_key: string; label: unknown; icon: string | null; sort_order: number | null; is_visible: boolean | null };

export const EMPTY_LIBRARY_CONFIG: CreatorLibraryConfig = { links: [], categoryRows: [], overrideRows: [], available: false };

export function toCategoryTabRow(categoryId: string, row: TabRow): CategoryTabRow {
  return { categoryId, sourceKey: row.source_key, label: row.label, icon: row.icon, sortOrder: row.sort_order, isVisible: row.is_visible };
}

export function toOverrideRow(row: OverrideDbRow): OverrideRow {
  return { sourceKey: row.source_key, label: row.label, icon: row.icon, sortOrder: row.sort_order, isVisible: row.is_visible };
}

/** Categorias do herói (só ativas, na ordem da posição) com os atalhos de cada uma, e a exceção do herói. */
export async function fetchCreatorLibraryConfig(supabase: Client, creatorId: string): Promise<CreatorLibraryConfig> {
  try {
    const [linksRes, overridesRes] = await Promise.all([
      supabase
        .from("creator_category_links")
        .select("category_id, position, category:hero_categories(id, is_active, tabs:hero_library_tabs(source_key, label, icon, sort_order, is_visible))")
        .eq("creator_id", creatorId)
        .order("position"),
      supabase.from("creator_library_overrides").select("source_key, label, icon, sort_order, is_visible").eq("creator_id", creatorId),
    ]);
    if (linksRes.error || overridesRes.error) return EMPTY_LIBRARY_CONFIG;
    // ativo explícito: o admin também lê as categorias inativas pela política de escrita
    const links = ((linksRes.data ?? []) as unknown as LinkRow[]).filter((row) => row.category?.is_active);
    return {
      links: links.map((row) => ({ categoryId: row.category_id, position: row.position })),
      categoryRows: links.flatMap((row) => (row.category?.tabs ?? []).map((tab) => toCategoryTabRow(row.category_id, tab))),
      overrideRows: ((overridesRes.data ?? []) as OverrideDbRow[]).map(toOverrideRow),
      available: true,
    };
  } catch {
    return EMPTY_LIBRARY_CONFIG;
  }
}
