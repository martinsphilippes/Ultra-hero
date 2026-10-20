"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Vínculos conteúdo–produto: só o admin valida/suspende/rejeita (RPC auditada) e pode criar manualmente.

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
  return user.id;
}

export async function setLinkStatusAction(linkId: string, status: "validated" | "suspended" | "rejected", note: string): Promise<ActionResult> {
  const parsed = z.object({ linkId: uuid, status: z.enum(["validated", "suspended", "rejected"]), note: z.string().trim().max(500) }).safeParse({ linkId, status, note });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_link_status", { p_link: parsed.data.linkId, p_status: parsed.data.status, p_note: parsed.data.note || undefined });
    if (error) return fail(error);
    revalidatePath("/admin/links");
    const t = await getTranslations("adminContent.links.actions");
    return { ok: true, message: t("done") };
  } catch (error) {
    return fail(error);
  }
}

// Cria o vínculo (sugerido pelo admin) e valida em seguida pela RPC (registra a versão do produto).
export async function createLinkAction(contentId: string, productId: string, note: string): Promise<ActionResult> {
  const parsed = z.object({ contentId: uuid, productId: uuid, note: z.string().trim().max(500) }).safeParse({ contentId, productId, note });
  if (!parsed.success) return fail("invalid_input");
  try {
    const userId = await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("content_product_links")
      .upsert({ content_id: parsed.data.contentId, product_id: parsed.data.productId, status: "suggested", suggested_by: userId, note: parsed.data.note || null }, { onConflict: "content_id,product_id" })
      .select("id")
      .single();
    if (error || !data) return fail(error ?? "generic");
    const { error: rpcError } = await supabase.rpc("admin_set_link_status", { p_link: data.id, p_status: "validated", p_note: parsed.data.note || undefined });
    if (rpcError) return fail(rpcError);
    revalidatePath("/admin/links");
    const t = await getTranslations("adminContent.links.create");
    return { ok: true, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}
