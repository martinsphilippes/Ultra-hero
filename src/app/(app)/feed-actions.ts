"use server";

import type { ReactNode } from "react";
import { z } from "zod";
import { MAX_OFFSET } from "@/components/discover/explore/tiles";
import { followingFeedPage, homeFeedPage } from "@/components/discover/home/feed/fetch";
import { renderFeedPosts } from "@/components/discover/home/feed/renderPosts";
import { feedFollowProps } from "@/components/discover/home/feed/follow";
import { getFollowContext } from "@/lib/heroes/follow-context";

// Paginação do feed do Início. A semente vem do cliente para a página seguinte continuar a mesma ordem;
// no "Seguindo" a lista de heróis é relida aqui (nunca vem do cliente).
const schema = z.object({
  seed: z.number().int().min(0).max(2_147_483_647),
  offset: z.number().int().min(0).max(MAX_OFFSET),
  feed: z.enum(["seguindo", "todos"]).default("todos"),
});

export type LoadMoreFeedResult = { ok: true; nodes: ReactNode; count: number; hasMore: boolean; nextOffset: number } | { ok: false; error: string };

export async function loadMoreFeed(input: z.input<typeof schema>): Promise<LoadMoreFeedResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const follow = await getFollowContext();
    const { seed, offset, feed } = parsed.data;
    const page = feed === "seguindo" && follow.available ? await followingFeedPage([...follow.following], offset) : await homeFeedPage(seed, offset);
    return { ok: true, nodes: renderFeedPosts(page.items, feedFollowProps(follow)), count: page.items.length, hasMore: page.hasMore, nextOffset: page.nextOffset };
  } catch {
    return { ok: false, error: "failed" };
  }
}
