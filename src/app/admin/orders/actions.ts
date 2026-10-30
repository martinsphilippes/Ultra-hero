"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Pedidos de teste: transições administrativas de remessa (máquina de estados no banco) e cancelamento.

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

const TRANSITIONS = ["preparing", "ready_for_dispatch", "in_transit", "delivered", "failed", "cancelled"] as const;

export async function transitionFulfillmentAction(orderId: string, fulfillmentId: string, to: (typeof TRANSITIONS)[number], note: string): Promise<ActionResult> {
  const parsed = z.object({ orderId: uuid, fulfillmentId: uuid, to: z.enum(TRANSITIONS), note: z.string().trim().max(500) }).safeParse({ orderId, fulfillmentId, to, note });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("fulfillment_transition", { p_fulfillment: parsed.data.fulfillmentId, p_to: parsed.data.to, p_note: parsed.data.note || undefined });
    if (error) return fail(error);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    // a mesma ação serve à tela de Remessas e às abas da organização (0053)
    revalidatePath("/admin/shipments");
    revalidatePath("/admin/sellers", "layout");
    const t = await getTranslations("adminContent.orders.actions");
    return { ok: true, message: t("done") };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelOrderAction(orderId: string, justification: string): Promise<ActionResult> {
  const parsed = z.object({ orderId: uuid, justification: z.string().trim().min(5).max(500) }).safeParse({ orderId, justification });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_test_order", { p_order: parsed.data.orderId });
    if (error) return fail(error);
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    const t = await getTranslations("adminContent.orders.actions");
    return { ok: true, message: t("cancelled") };
  } catch (error) {
    return fail(error);
  }
}
