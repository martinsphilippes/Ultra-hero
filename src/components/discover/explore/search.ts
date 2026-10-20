import "server-only";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import type { ExploreParams } from "./params";

export const PAGE_SIZE = 12;
// search_content limita p_limit a 100 (ver 0006_ops.sql).
const RPC_CAP = 100;
const MAX_OFFSET = 5000;

export type SearchQuery = Omit<ExploreParams, "tab">;
export type SearchPage = { items: ContentCardData[]; hasMore: boolean; nextOffset: number };

// Busca paginada: a RPC devolve as linhas de content (ranking); depois buscamos os dados
// de card (criador, módulo) numa única query, preservando a ordem da RPC.
export async function searchContentPage(query: SearchQuery, offset: number): Promise<SearchPage> {
  const supabase = await createClient();
  const safeOffset = Math.max(0, Math.min(Math.trunc(offset) || 0, MAX_OFFSET));
  const base = {
    p_query: query.q,
    p_pillar: query.pillar,
    p_type: query.type,
    p_access: query.access,
  };

  let ids: string[];
  let hasMore: boolean;

  if (query.difficulty) {
    // A RPC não filtra por nível: busca a janela máxima e filtra em memória (POC; até 100 itens).
    const { data, error } = await supabase.rpc("search_content", { ...base, p_limit: RPC_CAP, p_offset: 0 });
    if (error) throw error;
    const filtered = (data ?? []).filter((row) => row.difficulty === query.difficulty);
    const slice = filtered.slice(safeOffset, safeOffset + PAGE_SIZE + 1);
    hasMore = slice.length > PAGE_SIZE;
    ids = slice.slice(0, PAGE_SIZE).map((row) => row.id);
  } else {
    const { data, error } = await supabase.rpc("search_content", { ...base, p_limit: PAGE_SIZE + 1, p_offset: safeOffset });
    if (error) throw error;
    const rows = data ?? [];
    hasMore = rows.length > PAGE_SIZE;
    ids = rows.slice(0, PAGE_SIZE).map((row) => row.id);
  }

  if (ids.length === 0) return { items: [], hasMore: false, nextOffset: safeOffset };

  const { data: cards, error: cardsError } = await supabase.from("content").select(CONTENT_CARD_SELECT).in("id", ids);
  if (cardsError) throw cardsError;

  const byId = new Map((cards as unknown as ContentCardData[]).map((card) => [card.id, card]));
  const items = ids.map((id) => byId.get(id)).filter((card): card is ContentCardData => Boolean(card));
  return { items, hasMore, nextOffset: safeOffset + PAGE_SIZE };
}
