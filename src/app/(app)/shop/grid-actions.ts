"use server";

import type { ReactNode } from "react";
import { z } from "zod";
import { renderShopTiles } from "@/components/commerce/shop/renderShopTiles";
import { SHOP_MAX_OFFSET } from "@/lib/shop/filters";
import { loadShopView } from "@/lib/shop/queries";
import { createClient } from "@/lib/supabase/server";

// Aba Comprar: próxima página da grade (quadros renderizados no servidor + cursor).

const schema = z.object({
  filtro: z.string().max(40).nullable(),
  offset: z.number().int().min(1).max(SHOP_MAX_OFFSET),
});

export type LoadMoreShopResult = { ok: true; nodes: ReactNode; count: number; hasMore: boolean; nextOffset: number } | { ok: false; error: string };

export async function loadMoreShop(input: z.input<typeof schema>): Promise<LoadMoreShopResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const supabase = await createClient();
    const view = await loadShopView(supabase, parsed.data.filtro, parsed.data.offset);
    return { ok: true, nodes: renderShopTiles(view.tiles, parsed.data.offset), count: view.tiles.length, hasMore: view.hasMore, nextOffset: view.nextOffset };
  } catch {
    return { ok: false, error: "failed" };
  }
}
