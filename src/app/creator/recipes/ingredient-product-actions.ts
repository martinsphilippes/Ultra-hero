"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { PickResult } from "@/components/admin-content/SearchPicker";
import { INGREDIENT_LINK_SELECT, toIngredientLinks } from "@/components/recipes/editor/load-ingredient-products";
import { escapeLike } from "@/components/admin-content/lib/search-params";
import type { IngredientLink } from "@/lib/recipes/ingredient-products";
import { rpcErrorCode } from "@/lib/supabase/helpers";
import { creatorActionContext } from "../_lib/creator-action";

// "Produto correspondente" na etapa 2 do editor (fase 5). O herói só sugere: as RPCs da 0027
// conferem o dono do ingrediente (creator_suggest_ingredient_product) e só deixam retirar a própria
// sugestão pendente; o vínculo só vale na lista de compras depois de validado pelo admin.

export type IngredientProductResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

type DbError = { code?: string | null; message?: string | null } | null | undefined;

function fail(error: DbError): { ok: false; error: string } {
  // banco sem as RPCs/tabela (PostgREST: função ou tabela ausente)
  if (error?.code === "PGRST202" || error?.code === "PGRST205" || error?.code === "42883" || error?.code === "42P01") return { ok: false, error: "unavailable" };
  const code = rpcErrorCode(error?.message);
  if (code === "forbidden" || code === "product_not_found" || code === "unauthenticated") return { ok: false, error: code };
  return { ok: false, error: "generic" };
}

/** Busca nos produtos ativos (a RLS de products já esconde rascunho, moderado e fornecedor inativo). */
export async function searchIngredientProducts(q: string): Promise<PickResult> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80) }).safeParse({ q });
  if (!parsed.success) return { ok: true, items: [] };
  const ctx = await creatorActionContext();
  const t = await getTranslations("shopping.editor");
  if (!ctx.ok) return { ok: false, error: t("errors.forbidden") };
  const { data, error } = await ctx.supabase
    .from("products")
    .select("id, title, availability, seller:seller_organizations(name)")
    .eq("status", "published")
    .eq("moderation_status", "clear")
    .ilike("title", `%${escapeLike(parsed.data.q)}%`)
    .order("title")
    .limit(12);
  if (error) return { ok: false, error: t("errors.generic") };
  const rows = (data ?? []) as unknown as { id: string; title: string; availability: string; seller: { name: string } | null }[];
  return {
    ok: true,
    items: rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.seller?.name ?? null, badge: r.availability === "available" ? null : t("status.unavailable") })),
  };
}

const suggestSchema = z.object({ ingredientId: z.uuid(), productId: z.uuid(), replaceLinkId: z.uuid().nullable().optional() });

/**
 * Sugere o produto do ingrediente. Uma sugestão pendente por ingrediente: a anterior (do mesmo
 * herói, ainda pendente) é retirada antes. O validado continua valendo até o admin decidir a nova.
 */
export async function suggestIngredientProduct(input: { ingredientId: string; productId: string; replaceLinkId?: string | null }): Promise<IngredientProductResult<{ link: IngredientLink }>> {
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return { ok: false, error: ctx.error === "unauthenticated" ? "unauthenticated" : "forbidden" };
  const { supabase } = ctx;
  if (parsed.data.replaceLinkId) {
    const withdrawn = await supabase.rpc("creator_withdraw_ingredient_product", { p_link: parsed.data.replaceLinkId });
    // já decidida pelo admin (não está mais pendente): segue e cria a nova sugestão mesmo assim
    if (withdrawn.error && rpcErrorCode(withdrawn.error.message) !== "forbidden") return fail(withdrawn.error);
  }
  const { data: linkId, error } = await supabase.rpc("creator_suggest_ingredient_product", { p_ingredient: parsed.data.ingredientId, p_product: parsed.data.productId, p_note: null as unknown as string });
  if (error || typeof linkId !== "string") return fail(error);
  const { data: row, error: readError } = await supabase.from("recipe_ingredient_products").select(INGREDIENT_LINK_SELECT).eq("id", linkId).maybeSingle();
  if (readError || !row) return fail(readError);
  const [link] = await toIngredientLinks(supabase, [row as never]);
  revalidatePath("/admin/links");
  return { ok: true, link };
}

/** Retira a própria sugestão pendente (a RPC recusa validada, recusada ou de outro herói). */
export async function withdrawIngredientProduct(input: { linkId: string }): Promise<IngredientProductResult> {
  const parsed = z.object({ linkId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await creatorActionContext();
  if (!ctx.ok) return { ok: false, error: ctx.error === "unauthenticated" ? "unauthenticated" : "forbidden" };
  const { error } = await ctx.supabase.rpc("creator_withdraw_ingredient_product", { p_link: parsed.data.linkId });
  if (error) return fail(error);
  revalidatePath("/admin/links");
  return { ok: true };
}
