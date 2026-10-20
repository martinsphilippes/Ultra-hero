"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { parseRpcError, rpcErrorToString } from "@/components/commerce/lib/errors";
import { PRODUCT_IMAGES, findForbiddenClaim } from "@/components/editors/product/schema";
import { createClient } from "@/lib/supabase/server";
import { getSellerContext } from "../_lib/context";

// Perfil da organização: só descrição e logotipo (colunas liberadas pelo guard de colunas).
export async function updateSellerProfile(input: { orgId: string; description: string; logoUrl: string | null }): Promise<ActionResult> {
  const parsed = z
    .object({ orgId: z.uuid(), description: z.string().trim().max(600), logoUrl: z.enum(PRODUCT_IMAGES).nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await getSellerContext();
  if (ctx.state !== "ok" || !ctx.orgs.some((o) => o.id === parsed.data.orgId)) return { ok: false, error: "forbidden" };
  const claim = findForbiddenClaim(parsed.data.description);
  if (claim) return { ok: false, error: `forbidden_claim:${claim}` };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seller_organizations")
    .update({ description: parsed.data.description || null, logo_url: parsed.data.logoUrl })
    .eq("id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: rpcErrorToString(parseRpcError(error.message)) };
  if (!data) return { ok: false, error: "forbidden" };
  revalidatePath("/seller", "layout");
  revalidatePath("/shop");
  return { ok: true };
}
