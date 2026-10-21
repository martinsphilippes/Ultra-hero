"use server";

import type { ReactNode } from "react";
import { z } from "zod";
import { MAX_OFFSET } from "@/components/discover/explore/tiles";
import { homeFeedPage } from "@/components/discover/home/feed/fetch";
import { renderFeedPosts } from "@/components/discover/home/feed/renderPosts";

// Paginação do feed do Início. A semente vem do cliente para a página seguinte continuar a mesma ordem.
const schema = z.object({
  seed: z.number().int().min(0).max(2_147_483_647),
  offset: z.number().int().min(0).max(MAX_OFFSET),
});

export type LoadMoreFeedResult = { ok: true; nodes: ReactNode; count: number; hasMore: boolean; nextOffset: number } | { ok: false; error: string };

export async function loadMoreFeed(input: z.infer<typeof schema>): Promise<LoadMoreFeedResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const page = await homeFeedPage(parsed.data.seed, parsed.data.offset);
    return { ok: true, nodes: renderFeedPosts(page.items), count: page.items.length, hasMore: page.hasMore, nextOffset: page.nextOffset };
  } catch {
    return { ok: false, error: "failed" };
  }
}
