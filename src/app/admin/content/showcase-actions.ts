"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { parseSignerChoice } from "@/lib/recipes/showcase";
import { createClient } from "@/lib/supabase/server";

// Alimentação na vitrine (0051), pelo admin, na tela da receita (/admin/content/[id]): heróis da
// vitrine (creator_recipe_links, RPC auditada da 0024), quem assina (recipe_signers) e o produto
// "Comprar pronto" (recipe_ready_products). RLS: só o admin escreve; a auditoria é do banco.

const uuid = z.uuid();

async function requireAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

// sem a 0051 no banco as tabelas não existem: mensagem própria em vez do erro genérico
function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /recipe_(signers|ready_products)/.test(error.message ?? "")));
}

async function done(contentId: string, key: "heroAdded" | "heroRemoved" | "signerSaved" | "readySaved" | "readyRemoved"): Promise<ActionResult> {
  revalidatePath(`/admin/content/${contentId}`);
  const t = await getTranslations("adminContent.content.showcase.messages");
  return { ok: true, message: t(key) };
}

/** Põe (validado) ou tira (suspenso) a receita da vitrine de um herói. A vitrine do autor é fixa. */
export async function setRecipeShowcaseHeroAction(contentId: string, creatorId: string, on: boolean): Promise<ActionResult> {
  const parsed = z.object({ contentId: uuid, creatorId: uuid, on: z.boolean() }).safeParse({ contentId, creatorId, on });
  if (!parsed.success) return failWith("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_creator_recipe", {
      p_creator: parsed.data.creatorId,
      p_content: parsed.data.contentId,
      p_status: parsed.data.on ? "validated" : "suspended",
    });
    if (error) return failWith(error);
    return done(parsed.data.contentId, parsed.data.on ? "heroAdded" : "heroRemoved");
  } catch (error) {
    return failWith(error);
  }
}

/** Quem assina: "author" (apaga a linha), "none" (sem chef) ou o id de um herói chef. */
export async function setRecipeSignerAction(contentId: string, choice: string): Promise<ActionResult> {
  const id = uuid.safeParse(contentId);
  const signer = parseSignerChoice(choice);
  if (!id.success || !signer) return failWith("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } =
      signer.mode === "author"
        ? await supabase.from("recipe_signers").delete().eq("content_id", id.data)
        : await supabase.from("recipe_signers").upsert({ content_id: id.data, chef_id: signer.mode === "hero" ? signer.chefId : null }, { onConflict: "content_id" });
    if (missingTable(error)) return failWith("showcase_unavailable");
    if (error) return failWith(error);
    return done(id.data, "signerSaved");
  } catch (error) {
    return failWith(error);
  }
}

/** Liga (ou troca) o produto "Comprar pronto"; null remove. Um produto por receita (chave primária). */
export async function setRecipeReadyProductAction(contentId: string, productId: string | null): Promise<ActionResult> {
  const parsed = z.object({ contentId: uuid, productId: uuid.nullable() }).safeParse({ contentId, productId });
  if (!parsed.success) return failWith("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = parsed.data.productId
      ? await supabase.from("recipe_ready_products").upsert({ content_id: parsed.data.contentId, product_id: parsed.data.productId }, { onConflict: "content_id" })
      : await supabase.from("recipe_ready_products").delete().eq("content_id", parsed.data.contentId);
    if (missingTable(error)) return failWith("showcase_unavailable");
    if (error) return failWith(error);
    return done(parsed.data.contentId, parsed.data.productId ? "readySaved" : "readyRemoved");
  } catch (error) {
    return failWith(error);
  }
}
