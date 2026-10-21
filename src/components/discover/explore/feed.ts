import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExploreParams } from "./params";
import { CONTENT_TILE_SELECT, MAX_OFFSET, pageCursor, spreadCreators, TILE_PAGE_SIZE, type ContentTileData } from "./tiles";

export type SearchQuery = Omit<ExploreParams, "tab">;
export type FeedPage = { items: ContentTileData[]; hasMore: boolean; nextOffset: number };

// Uma página da grade. Sem texto: explore_feed (variedade de heróis, ordem rotacionada pela semente).
// Com texto: search_content (relevância). Nas duas, pedimos um a mais para saber se há próxima página
// e depois buscamos os dados dos quadros numa única query, preservando a ordem da RPC.
export async function exploreFeedPage(query: SearchQuery, seed: number, offset: number): Promise<FeedPage> {
  const supabase = await createClient();
  const safeOffset = Math.max(0, Math.min(Math.trunc(offset) || 0, MAX_OFFSET));
  const filters = { p_pillar: query.pillar, p_type: query.type, p_access: query.access, p_difficulty: query.difficulty };
  const q = query.q.trim();

  const { data, error } = q
    ? await supabase.rpc("search_content", { p_query: q, ...filters, p_limit: TILE_PAGE_SIZE + 1, p_offset: safeOffset }).select("id")
    : await supabase.rpc("explore_feed", { ...filters, p_seed: Math.max(0, Math.trunc(seed) || 0), p_limit: TILE_PAGE_SIZE + 1, p_offset: safeOffset }).select("id");
  if (error) throw error;

  const rows = data ?? [];
  // Só os ids voltam da RPC (select("id")): os dados do quadro vêm na consulta seguinte.
  const { hasMore, nextOffset } = pageCursor(rows.length, safeOffset);
  const ids = rows.slice(0, TILE_PAGE_SIZE).map((row) => row.id);
  if (ids.length === 0) return { items: [], hasMore: false, nextOffset: safeOffset };

  const { data: tiles, error: tilesError } = await supabase.from("content").select(CONTENT_TILE_SELECT).in("id", ids);
  if (tilesError) throw tilesError;

  const byId = new Map((tiles as unknown as ContentTileData[]).map((tile) => [tile.id, tile]));
  const items = ids.map((id) => byId.get(id)).filter((tile): tile is ContentTileData => Boolean(tile));
  // Com texto a ordem é por relevância; só o feed ganha o afastamento de vizinhos do mesmo herói.
  return { items: q ? items : spreadCreators(items), hasMore, nextOffset };
}
