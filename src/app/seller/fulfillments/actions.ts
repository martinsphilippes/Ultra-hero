"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { parseRpcError } from "@/components/commerce/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getSellerContext } from "../_lib/context";

// Transições do fornecedor (awaiting→preparing, preparing→ready_for_dispatch, →cancelled).
// A máquina de estados vive em fulfillment_transition; transporte/entrega são do sistema.
export async function transitionFulfillment(input: { fulfillmentId: string; to: "preparing" | "ready_for_dispatch" | "cancelled"; note?: string }): Promise<ActionResult> {
  const parsed = z
    .object({ fulfillmentId: z.uuid(), to: z.enum(["preparing", "ready_for_dispatch", "cancelled"]), note: z.string().trim().max(300).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await getSellerContext();
  if (ctx.state !== "ok" || !ctx.org) return { ok: false, error: "forbidden" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fulfillment_transition", {
      p_fulfillment: parsed.data.fulfillmentId,
      p_to: parsed.data.to,
      p_note: parsed.data.note || undefined,
    });
    if (error) return { ok: false, error: parseRpcError(error.message).code };
    revalidatePath("/seller", "layout");
    revalidatePath("/orders");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: parseRpcError(error instanceof Error ? error.message : null).code };
  }
}
