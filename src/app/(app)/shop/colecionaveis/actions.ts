"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { bidErrorCode, type BidErrorCode } from "@/lib/collectibles/rules";
import { createClient } from "@/lib/supabase/server";

// Lance e pagamento simulado dos Colecionáveis. As regras ficam no banco (place_bid e
// collectible_pay, 0054); aqui só validamos a forma e traduzimos o código de erro.

export type PlaceBidResult =
  | { ok: true; bidId: string; amountCents: number; endsAt: string; extended: boolean; bidsCount: number; serverNow: string }
  | { ok: false; code: BidErrorCode };

const bidInput = z.object({ id: z.uuid(), increment: z.number().int().positive().max(10_000_000) });

export async function placeBidAction(id: string, increment: number): Promise<PlaceBidResult> {
  const parsed = bidInput.safeParse({ id, increment });
  if (!parsed.success) return { ok: false, code: "invalid_increment" };
  const user = await getUser();
  if (!user) return { ok: false, code: "unauthenticated" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_bid", { auction_id: parsed.data.id, increment_cents: parsed.data.increment });
  if (error || !data) return { ok: false, code: bidErrorCode(error?.message) };
  const result = data as { bid_id: string; amount_cents: number; ends_at: string; extended: boolean; bids_count: number; server_now: string };
  return {
    ok: true,
    bidId: result.bid_id,
    amountCents: result.amount_cents,
    endsAt: result.ends_at,
    extended: result.extended,
    bidsCount: result.bids_count,
    serverNow: result.server_now,
  };
}

export type PayResult = { ok: false; code: "forbidden" | "invalid_destination" | "commerce_disabled" | "generic" };

const payInput = z.object({ id: z.uuid(), destination: z.uuid() });

/** Vencedor conclui o pagamento simulado: vira um pedido de teste e abre o pedido. */
export async function payCollectibleAction(id: string, destination: string): Promise<PayResult> {
  const parsed = payInput.safeParse({ id, destination });
  if (!parsed.success) return { ok: false, code: "invalid_destination" };
  const user = await getUser();
  if (!user) return { ok: false, code: "forbidden" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("collectible_pay", { p_collectible: parsed.data.id, p_destination: parsed.data.destination });
  if (error || !data) {
    const message = error?.message ?? "";
    const code = (["forbidden", "invalid_destination", "commerce_disabled"] as const).find((c) => message.includes(c)) ?? "generic";
    return { ok: false, code };
  }
  await trackEvent("order.test_confirmed", { source: "collectible" });
  revalidatePath("/shop/compras");
  revalidatePath(`/shop/colecionaveis/${parsed.data.id}`);
  redirect(`/orders/${data}`);
}
