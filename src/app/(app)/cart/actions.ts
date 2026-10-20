"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRpcError, rpcErrorToString, type CartIssue } from "@/components/commerce/lib/errors";
import { readExpectedPrices, writeDestinationCookie, writeExpectedPrices } from "@/components/commerce/server/cookies";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Ações do carrinho de teste: quantidade, remoção, destino fictício e saneamento de problemas.

export type CartActionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

const uuid = z.uuid();

function revalidateCart() {
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: rpcErrorToString(parseRpcError(error instanceof Error ? error.message : typeof error === "string" ? error : null)) };
}

// quantity 0 remove o item (regra da função SQL).
export async function setCartQuantity(input: { productId: string; quantity: number }): Promise<CartActionResult<{ quantity: number }>> {
  const parsed = z.object({ productId: uuid, quantity: z.number().int().min(0).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("cart_set_item", { p_product: parsed.data.productId, p_quantity: parsed.data.quantity });
    if (error) return fail(error.message);
    if (parsed.data.quantity === 0) {
      const expected = await readExpectedPrices();
      delete expected[parsed.data.productId];
      await writeExpectedPrices(expected);
      await trackEvent("cart.remove", { product_id: parsed.data.productId });
    }
    revalidateCart();
    return { ok: true, quantity: parsed.data.quantity };
  } catch (error) {
    return fail(error);
  }
}

export async function setDestination(input: { destinationId: string | null }): Promise<CartActionResult> {
  const parsed = z.object({ destinationId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    if (parsed.data.destinationId) {
      const supabase = await createClient();
      const { data } = await supabase.from("demo_destinations").select("id").eq("id", parsed.data.destinationId).eq("is_active", true).maybeSingle();
      if (!data) return { ok: false, error: "invalid_destination" };
    }
    await writeDestinationCookie(parsed.data.destinationId);
    revalidateCart();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// Remove do carrinho os itens indisponíveis/suspensos/sem estoque (preço alterado fica).
export async function removeProblematicItems(input: { productIds: string[] }): Promise<CartActionResult<{ removed: number }>> {
  const parsed = z.object({ productIds: z.array(uuid).min(1).max(40) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const expected = await readExpectedPrices();
    let removed = 0;
    for (const productId of parsed.data.productIds) {
      const { error } = await supabase.rpc("cart_set_item", { p_product: productId, p_quantity: 0 });
      if (!error) {
        removed += 1;
        delete expected[productId];
        await trackEvent("cart.remove", { product_id: productId, reason: "issue" });
      }
    }
    await writeExpectedPrices(expected);
    revalidateCart();
    return { ok: true, removed };
  } catch (error) {
    return fail(error);
  }
}

// Aceita os novos preços ilustrativos (atualiza o "preço visto" guardado no cookie).
export async function acceptNewPrices(input: { issues: Pick<CartIssue, "product_id" | "new_price">[] }): Promise<CartActionResult> {
  const parsed = z.object({ issues: z.array(z.object({ product_id: uuid, new_price: z.number().int().min(0).optional() })).max(40) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  try {
    const expected = await readExpectedPrices();
    for (const issue of parsed.data.issues) {
      if (typeof issue.new_price === "number") expected[issue.product_id] = issue.new_price;
      else delete expected[issue.product_id];
    }
    await writeExpectedPrices(expected);
    revalidateCart();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
