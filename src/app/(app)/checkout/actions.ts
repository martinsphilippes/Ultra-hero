"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseCartIssues, parseRpcError, type CartIssue } from "@/components/commerce/lib/errors";
import { writeExpectedPrices } from "@/components/commerce/server/cookies";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Confirmação do pedido de teste. Toda a validação (kill switch, destino, carrinho, preços,
// snapshots, remessas) acontece em checkout_cart (security definer). Nenhum pagamento existe.

export type CheckoutResult =
  | { ok: true; orderId: string }
  | { ok: false; error: "cart_changed"; issues: CartIssue[] }
  | { ok: false; error: string };

const uuid = z.uuid();

export async function confirmCheckout(input: {
  destinationId: string;
  expected: { product_id: string; price_cents: number }[];
  acceptChanges: boolean;
}): Promise<CheckoutResult> {
  const parsed = z
    .object({
      destinationId: uuid,
      expected: z.array(z.object({ product_id: uuid, price_cents: z.number().int().min(0) })).max(40),
      acceptChanges: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("checkout_cart", {
      p_destination: parsed.data.destinationId,
      p_expected: parsed.data.expected,
      p_accept_changes: parsed.data.acceptChanges,
    });
    if (error) {
      const parsedError = parseRpcError(error.message);
      if (parsedError.code === "cart_changed") {
        revalidatePath("/cart");
        return { ok: false, error: "cart_changed", issues: parseCartIssues(parsedError.detail) };
      }
      return { ok: false, error: parsedError.code };
    }
    if (typeof data !== "string") return { ok: false, error: "generic" };

    // carrinho foi esvaziado pelo banco: limpa o cookie de preços vistos
    await writeExpectedPrices({});
    const { data: order } = await supabase.from("test_orders").select("total_cents, fulfillments:test_fulfillments(id)").eq("id", data).maybeSingle();
    await trackEvent("order.test_confirmed", {
      order_id: data,
      total_cents_demo: order?.total_cents ?? null,
      sellers: Array.isArray(order?.fulfillments) ? order.fulfillments.length : null,
    });
    revalidatePath("/cart");
    revalidatePath("/checkout");
    revalidatePath("/orders");
    return { ok: true, orderId: data };
  } catch (error) {
    return { ok: false, error: parseRpcError(error instanceof Error ? error.message : null).code };
  }
}
