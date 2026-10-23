"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { isMissingFunction } from "@/lib/catalog/localized-body";
import { CREDENTIALS_MAX_LENGTH } from "@/lib/recipes/credentials";
import { createClient } from "@/lib/supabase/server";

// Fila de credenciais do chef (P7): aprovar copia o texto do pedido para o perfil público com
// credentials_approved_at; reprovar limpa os dois. Tudo pela RPC auditada admin_set_creator_credentials.
// A decisão vale só para o texto que o admin viu na fila (expectedText): se o herói editou depois,
// a RPC (0032) recusa com request_changed e o admin recarrega a fila.
export async function decideCreatorCredentials(input: { creatorId: string; approved: boolean; expectedText: string }, justification: string): Promise<ActionResult> {
  const parsed = z
    .object({ creatorId: z.uuid(), approved: z.boolean(), expectedText: z.string().trim().min(1).max(CREDENTIALS_MAX_LENGTH), justification: z.string().trim().min(5).max(500) })
    .safeParse({ ...input, justification });
  if (!parsed.success) return failWith("invalid_input");
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) return failWith("forbidden");
  const supabase = await createClient();
  const { creatorId, approved, expectedText } = parsed.data;
  const base = { p_creator: creatorId, p_approved: approved, p_reason: parsed.data.justification };
  let { error } = await supabase.rpc("admin_set_creator_credentials", { ...base, p_expected_text: expectedText });
  if (error && isMissingFunction(error)) {
    // remoto sem a 0032 (RPC de 3 argumentos): confere o texto antes; estreita a corrida, a 0032 fecha no banco
    const { data, error: readError } = await supabase.from("creator_credentials_requests").select("text").eq("creator_id", creatorId).maybeSingle();
    if (readError) return failWith(readError);
    const current = (data as { text: string } | null)?.text.trim() ?? null;
    if (current !== expectedText) return failWith("request_changed");
    ({ error } = await supabase.rpc("admin_set_creator_credentials", base));
  }
  if (error) return failWith(error);
  revalidatePath("/admin/creators");
  revalidatePath("/profile");
  revalidatePath("/personalities");
  const t = await getTranslations("recipes.admin.credentials");
  return { ok: true, message: approved ? t("approvedDone") : t("rejectedDone") };
}
