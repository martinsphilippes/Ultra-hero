"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { bidErrorCode, type BidErrorCode } from "@/lib/collectibles/rules";
import { createClient } from "@/lib/supabase/server";

// Lance dos Colecionáveis. As regras ficam no banco (place_bid, 0057); aqui só validamos a forma
// e traduzimos o código de erro. Não há pagamento online: a equipe contata quem arrematar.

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
