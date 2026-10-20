"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { parseRpcError } from "@/components/commerce/lib/errors";
import { trackEvent } from "@/lib/analytics/track";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Cancelamento de pedido de teste pelo consumidor (só enquanto nada foi expedido na simulação).
export async function cancelOrder(input: { orderId: string }): Promise<ActionResult> {
  const parsed = z.object({ orderId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_test_order", { p_order: parsed.data.orderId });
    if (error) return { ok: false, error: parseRpcError(error.message).code };
    await trackEvent("order.cancelled", { order_id: parsed.data.orderId });
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: parseRpcError(error instanceof Error ? error.message : null).code };
  }
}
