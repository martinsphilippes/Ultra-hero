"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { getUser } from "@/lib/auth/session";
import { getNativeApp } from "@/lib/native-app/server";
import { createClient } from "@/lib/supabase/server";

// Contratar = serviço no carrinho (pagamento simulado, como os produtos). As regras (serviço no ar,
// profissional aprovado, não é o próprio, limite de 10, kill switch) ficam em service_cart_set (0058).

export type HireResult = { ok: true; count: number } | { ok: false; error: string };

const KNOWN = ["commerce_disabled", "service_unavailable", "own_service", "too_many_services", "unauthenticated"] as const;

function code(message: string | null | undefined): string {
  const m = message ?? "";
  return KNOWN.find((k) => m.includes(k)) ?? "generic";
}

function revalidateCart() {
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function hireService(input: { serviceId: string }): Promise<HireResult> {
  const parsed = z.object({ serviceId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  // app das lojas: contratação oculta (comércio simulado); a ação também recusa
  if (await getNativeApp()) return { ok: false, error: "commerce_disabled" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const settings = await supabase.rpc("public_settings");
    if (settings.error || !isCommerceEnabled(settings.data)) return { ok: false, error: "commerce_disabled" };
    const { data, error } = await supabase.rpc("service_cart_set", { p_service: parsed.data.serviceId, p_add: true });
    if (error) return { ok: false, error: code(error.message) };
    revalidateCart();
    return { ok: true, count: typeof data === "number" ? data : 1 };
  } catch (error) {
    return { ok: false, error: code(error instanceof Error ? error.message : null) };
  }
}

export async function removeServiceFromCart(input: { serviceId: string }): Promise<HireResult> {
  const parsed = z.object({ serviceId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("service_cart_set", { p_service: parsed.data.serviceId, p_add: false });
    if (error) return { ok: false, error: code(error.message) };
    revalidateCart();
    return { ok: true, count: typeof data === "number" ? data : 0 };
  } catch (error) {
    return { ok: false, error: code(error instanceof Error ? error.message : null) };
  }
}

/** Cliente cancela um pedido que o profissional ainda não respondeu. */
export async function cancelServiceOrder(input: { orderId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ orderId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("service_order_update", { p_order: parsed.data.orderId, p_to: "cancelled" });
    if (error) return { ok: false, error: error.message.includes("invalid_transition") ? "invalid_transition" : "generic" };
    revalidatePath("/shop/compras");
    return { ok: true };
  } catch {
    return { ok: false, error: "generic" };
  }
}
