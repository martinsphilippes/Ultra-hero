"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRpcError, rpcErrorToString } from "@/components/commerce/lib/errors";
import { readExpectedPrices, writeExpectedPrices } from "@/components/commerce/server/cookies";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Ações da loja de demonstração: adicionar ao carrinho de teste e eventos de analytics.
// Regras (produto comprável, estoque demo, limite 20) vivem na função SQL cart_set_item.

export type CommerceResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const uuid = z.uuid();

export async function addToCart(input: { productId: string; quantity: number; priceCents: number }): Promise<CommerceResult<{ quantity: number }>> {
  const parsed = z.object({ productId: uuid, quantity: z.number().int().min(1).max(20), priceCents: z.number().int().min(0) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    // soma à quantidade já existente (limite 20, imposto também pelo banco)
    const { data: existing } = await supabase.from("cart_items").select("quantity").eq("product_id", parsed.data.productId).maybeSingle();
    const quantity = Math.min(20, (existing?.quantity ?? 0) + parsed.data.quantity);
    const { error } = await supabase.rpc("cart_set_item", { p_product: parsed.data.productId, p_quantity: quantity });
    if (error) return { ok: false, error: rpcErrorToString(parseRpcError(error.message)) };

    // preço visto pelo usuário: usado pelo cart_validate para apontar price_changed
    const expected = await readExpectedPrices();
    expected[parsed.data.productId] = parsed.data.priceCents;
    await writeExpectedPrices(expected);

    // interesse comercial (métrica distinta de pedido de teste) + eventos
    await supabase.from("product_interest").insert({ user_id: user.id, product_id: parsed.data.productId, source: "catalog" });
    await trackEvent("product.interest", { product_id: parsed.data.productId, source: "catalog" });
    await trackEvent("cart.add", { product_id: parsed.data.productId, quantity: parsed.data.quantity });

    revalidatePath("/cart");
    revalidatePath("/checkout");
    return { ok: true, quantity };
  } catch (error) {
    return { ok: false, error: rpcErrorToString(parseRpcError(error instanceof Error ? error.message : null)) };
  }
}

// Eventos de visualização/início de checkout disparados por componentes cliente (sem PII).
export async function trackCommerceEvent(input: { event: "product.view" | "checkout.start"; properties?: Record<string, string | number | boolean | null> }): Promise<void> {
  const parsed = z
    .object({
      event: z.enum(["product.view", "checkout.start"]),
      properties: z.record(z.string().regex(/^[a-z_]{1,32}$/), z.union([z.string().max(80), z.number(), z.boolean(), z.null()])).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return;
  await trackEvent(parsed.data.event, parsed.data.properties ?? {});
}
