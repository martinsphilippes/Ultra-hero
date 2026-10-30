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
// Com serviços no carrinho (0058), tudo vai junto e atômico em checkout_with_services (produtos pelo
// mesmo checkout_cart + um pedido por serviço); sem serviços, o caminho de sempre.

export type CheckoutResult =
  | { ok: true; orderId: string | null; serviceOrders: number }
  | { ok: false; error: "cart_changed"; issues: CartIssue[] }
  | { ok: false; error: string };

const uuid = z.uuid();

export async function confirmCheckout(input: {
  destinationId: string | null;
  expected: { product_id: string; price_cents: number }[];
  acceptChanges: boolean;
  services?: { service_id: string; price_cents: number }[];
}): Promise<CheckoutResult> {
  const parsed = z
    .object({
      destinationId: uuid.nullable(),
      expected: z.array(z.object({ product_id: uuid, price_cents: z.number().int().min(0) })).max(40),
      acceptChanges: z.boolean(),
      services: z.array(z.object({ service_id: uuid, price_cents: z.number().int().min(0) })).max(10).default([]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (parsed.data.services.length > 0) return confirmWithServices(parsed.data);
  if (!parsed.data.destinationId) return { ok: false, error: "invalid_destination" };

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
    return { ok: true, orderId: data, serviceOrders: 0 };
  } catch (error) {
    return { ok: false, error: parseRpcError(error instanceof Error ? error.message : null).code };
  }
}

// Produtos (se houver) + serviços, numa transação só (checkout_with_services, 0058).
async function confirmWithServices(input: {
  destinationId: string | null;
  expected: { product_id: string; price_cents: number }[];
  acceptChanges: boolean;
  services: { service_id: string; price_cents: number }[];
}): Promise<CheckoutResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("checkout_with_services", {
      p_destination: input.destinationId ?? undefined,
      p_expected: input.expected,
      p_accept_changes: input.acceptChanges,
      p_services: input.services,
    });
    if (error) {
      const parsedError = parseRpcError(error.message);
      if (parsedError.code === "cart_changed") {
        revalidatePath("/cart");
        return { ok: false, error: "cart_changed", issues: parseCartIssues(parsedError.detail) };
      }
      const known = ["service_unavailable", "service_price_changed"].find((c) => error.message.includes(c));
      if (known) revalidatePath("/cart");
      return { ok: false, error: known ?? parsedError.code };
    }
    const result = (data ?? {}) as { order_id?: string | null; service_order_ids?: string[] };
    const orderId = typeof result.order_id === "string" ? result.order_id : null;
    const serviceOrders = Array.isArray(result.service_order_ids) ? result.service_order_ids.length : 0;
    if (orderId) {
      await writeExpectedPrices({});
      await trackEvent("order.test_confirmed", { order_id: orderId, total_cents_demo: null, sellers: null });
    }
    revalidatePath("/cart");
    revalidatePath("/checkout");
    revalidatePath("/orders");
    revalidatePath("/shop/compras");
    return { ok: true, orderId, serviceOrders };
  } catch (error) {
    return { ok: false, error: parseRpcError(error instanceof Error ? error.message : null).code };
  }
}
