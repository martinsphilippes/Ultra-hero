"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Fila de credenciais do chef (P7): aprovar copia o texto do pedido para o perfil público com
// credentials_approved_at; reprovar limpa os dois. Tudo pela RPC auditada admin_set_creator_credentials.
export async function decideCreatorCredentials(input: { creatorId: string; approved: boolean }, justification: string): Promise<ActionResult> {
  const parsed = z.object({ creatorId: z.uuid(), approved: z.boolean(), justification: z.string().trim().min(5).max(500) }).safeParse({ ...input, justification });
  if (!parsed.success) return failWith("invalid_input");
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) return failWith("forbidden");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_creator_credentials", { p_creator: parsed.data.creatorId, p_approved: parsed.data.approved, p_reason: parsed.data.justification });
  if (error) return failWith(error);
  revalidatePath("/admin/creators");
  revalidatePath("/personalities");
  const t = await getTranslations("recipes.admin.credentials");
  return { ok: true, message: parsed.data.approved ? t("approvedDone") : t("rejectedDone") };
}
