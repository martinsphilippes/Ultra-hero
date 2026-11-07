"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyFail } from "@/lib/agency/errors";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** A Groscove aprova ou recusa uma marca nova (0126). */
export async function decideBrandApprovalAction(input: { brandId: string; approve: boolean; note?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser("/agencia/marcas");
  const parsed = z.object({ brandId: z.uuid(), approve: z.boolean(), note: z.string().trim().max(300).optional() }).safeParse(input);
  if (!parsed.success) return agencyFail("invalid_input");
  const supabase = await createClient();
  const { error } = await supabase.rpc("brand_approval_decide", { p_brand: parsed.data.brandId, p_approve: parsed.data.approve, p_note: parsed.data.note || null });
  if (error) return agencyFail(error);
  revalidatePath("/agencia", "layout");
  return { ok: true };
}
