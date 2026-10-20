"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { getSellerContext, SELLER_ORG_COOKIE } from "./_lib/context";

// Troca a organização ativa do portal (só entre as organizações do próprio usuário).
export async function selectSellerOrg(input: { orgId: string }): Promise<ActionResult> {
  const parsed = z.object({ orgId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await getSellerContext();
  if (!ctx.orgs.some((o) => o.id === parsed.data.orgId)) return { ok: false, error: "forbidden" };
  (await cookies()).set(SELLER_ORG_COOKIE, parsed.data.orgId, { path: "/seller", maxAge: 60 * 60 * 24 * 90, sameSite: "lax", httpOnly: true });
  revalidatePath("/seller", "layout");
  return { ok: true };
}
