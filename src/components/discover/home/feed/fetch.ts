import "server-only";
import { MAX_OFFSET, pageCursor, spreadCreators } from "@/components/discover/explore/tiles";
import { createClient } from "@/lib/supabase/server";
import { FEED_PAGE_SIZE, FEED_POST_SELECT, type FeedPostData } from "./posts";

export type HomeFeedPage = { items: FeedPostData[]; hasMore: boolean; nextOffset: number };

// Uma página do feed do Início. Usa a mesma RPC do Explorar (explore_feed): variedade de heróis e ordem
// que gira uma vez por dia pela semente, estável entre páginas. Igual para todos por enquanto; a
// personalização entra depois trocando só esta função.
export async function homeFeedPage(seed: number, offset: number): Promise<HomeFeedPage> {
  const supabase = await createClient();
  const safeOffset = Math.max(0, Math.min(Math.trunc(offset) || 0, MAX_OFFSET));
  const { data, error } = await supabase
    .rpc("explore_feed", { p_seed: Math.max(0, Math.trunc(seed) || 0), p_limit: FEED_PAGE_SIZE + 1, p_offset: safeOffset })
    .select("id");
  if (error) throw error;

  const rows = data ?? [];
  const { hasMore, nextOffset } = pageCursor(rows.length, safeOffset, FEED_PAGE_SIZE);
  const ids = rows.slice(0, FEED_PAGE_SIZE).map((row) => row.id);
  if (ids.length === 0) return { items: [], hasMore: false, nextOffset: safeOffset };

  const { data: posts, error: postsError } = await supabase.from("content").select(FEED_POST_SELECT).in("id", ids);
  if (postsError) throw postsError;
  const byId = new Map((posts as unknown as FeedPostData[]).map((post) => [post.id, post]));
  const items = ids.map((id) => byId.get(id)).filter((post): post is FeedPostData => Boolean(post));
  return { items: spreadCreators(items), hasMore, nextOffset };
}
