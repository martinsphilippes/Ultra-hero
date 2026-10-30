import "server-only";
import { MAX_OFFSET, pageCursor, spreadCreators } from "@/components/discover/explore/tiles";
import { createClient } from "@/lib/supabase/server";
import { FEED_PAGE_SIZE, FEED_POST_SELECT, type FeedPostData } from "./posts";

export type HomeFeedPage = { items: FeedPostData[]; hasMore: boolean; nextOffset: number };

type Client = Awaited<ReturnType<typeof createClient>>;

async function postsByIds(supabase: Client, ids: string[]): Promise<FeedPostData[]> {
  const { data: posts, error } = await supabase.from("content").select(FEED_POST_SELECT).in("id", ids);
  if (error) throw error;
  const byId = new Map((posts as unknown as FeedPostData[]).map((post) => [post.id, post]));
  return ids.map((id) => byId.get(id)).filter((post): post is FeedPostData => Boolean(post));
}

// Uma página do feed do Início ("Todos"). Usa a mesma RPC do Explorar (explore_feed): variedade de
// heróis e ordem que gira uma vez por dia pela semente, estável entre páginas.
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
  return { items: spreadCreators(await postsByIds(supabase, ids)), hasMore, nextOffset };
}

// Feed "Seguindo": só posts no ar dos heróis seguidos, do mais recente ao mais antigo (a RLS de
// content já esconde o que não está no ar; o filtro repete a regra para não depender só dela).
export async function followingFeedPage(creatorIds: readonly string[], offset: number): Promise<HomeFeedPage> {
  const safeOffset = Math.max(0, Math.min(Math.trunc(offset) || 0, MAX_OFFSET));
  if (creatorIds.length === 0) return { items: [], hasMore: false, nextOffset: safeOffset };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("content")
    .select("id")
    .in("creator_id", creatorIds.slice(0, 500))
    .eq("status", "published")
    .or(`publish_at.is.null,publish_at.lte.${now}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id")
    .range(safeOffset, safeOffset + FEED_PAGE_SIZE);
  if (error) throw error;

  const rows = data ?? [];
  const { hasMore, nextOffset } = pageCursor(rows.length, safeOffset, FEED_PAGE_SIZE);
  const ids = rows.slice(0, FEED_PAGE_SIZE).map((row) => row.id);
  if (ids.length === 0) return { items: [], hasMore: false, nextOffset: safeOffset };
  return { items: await postsByIds(supabase, ids), hasMore, nextOffset };
}
