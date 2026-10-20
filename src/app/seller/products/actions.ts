"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { parseRpcError, rpcErrorToString } from "@/components/commerce/lib/errors";
import { createProductSchema } from "@/components/editors/product/schema";
import type { ProductFormValues } from "@/components/editors/types";
import { createClient } from "@/lib/supabase/server";
import { getSellerContext } from "../_lib/context";

// Ações de produto do fornecedor. Tudo sob RLS: a organização precisa ser do usuário; colunas de
// moderação são protegidas por trigger (protected_column:*). Revalidação do portal e da loja.

const uuid = z.uuid();

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

async function loadFoodCategoryIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("product_categories").select("id, is_food").eq("is_food", true);
  return new Set((data ?? []).map((c) => c.id));
}

function revalidateProduct(productId?: string) {
  revalidatePath("/seller", "layout");
  revalidatePath("/shop");
  if (productId) revalidatePath(`/seller/products/${productId}/edit`);
}

function fail(message: string | null | undefined): { ok: false; error: string } {
  return { ok: false, error: rpcErrorToString(parseRpcError(message)) };
}

type SaveResult = ActionResult & { id?: string };

// Cria o produto e redireciona para a edição (o formulário compartilhado não conhece a rota).
export async function createSellerProduct(values: ProductFormValues): Promise<SaveResult> {
  const ctx = await getSellerContext();
  if (ctx.state !== "ok" || !ctx.org) return { ok: false, error: "forbidden" };
  const foodIds = await loadFoodCategoryIds();
  const parsed = createProductSchema({ isFoodCategory: (id) => foodIds.has(id) }).safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  if (!ctx.orgs.some((o) => o.id === parsed.data.seller_org_id)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  let createdId: string | null = null;
  // slug único: nome + sufixo curto; uma nova tentativa em caso de colisão
  for (let attempt = 0; attempt < 2 && !createdId; attempt += 1) {
    const { data, error } = await supabase
      .from("products")
      .insert({
        seller_org_id: parsed.data.seller_org_id,
        category_id: parsed.data.category_id,
        slug: `${slugify(parsed.data.title) || "produto"}-${suffix()}`,
        title: parsed.data.title,
        description: parsed.data.description,
        image_url: parsed.data.image_url,
        price_cents_demo: parsed.data.price_cents_demo,
        product_type: parsed.data.product_type,
        attributes: parsed.data.attributes,
        food_info: parsed.data.food_info,
        status: parsed.data.status,
        availability: parsed.data.availability,
        demo_stock: parsed.data.demo_stock,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (data) createdId = data.id;
    else if (error) {
      const code = parseRpcError(error.message).code;
      if (code !== "slug_conflict" || attempt === 1) return fail(error.message);
    }
  }
  if (!createdId) return { ok: false, error: "generic" };
  revalidateProduct(createdId);
  redirect(`/seller/products/${createdId}/edit?created=1`);
}

export async function updateSellerProduct(values: ProductFormValues): Promise<SaveResult> {
  const ctx = await getSellerContext();
  if (ctx.state !== "ok" || !ctx.org) return { ok: false, error: "forbidden" };
  if (!values.id || !uuid.safeParse(values.id).success) return { ok: false, error: "invalid_input" };
  const foodIds = await loadFoodCategoryIds();
  const parsed = createProductSchema({ isFoodCategory: (id) => foodIds.has(id) }).safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      category_id: parsed.data.category_id,
      title: parsed.data.title,
      description: parsed.data.description,
      image_url: parsed.data.image_url,
      price_cents_demo: parsed.data.price_cents_demo,
      product_type: parsed.data.product_type,
      attributes: parsed.data.attributes,
      food_info: parsed.data.food_info,
      status: parsed.data.status,
      availability: parsed.data.availability,
      demo_stock: parsed.data.demo_stock,
    })
    .eq("id", values.id)
    .eq("seller_org_id", ctx.org.id)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return { ok: false, error: "not_found" };
  revalidateProduct(data.id);
  return { ok: true, id: data.id };
}

// Atalhos da listagem: disponibilidade e estoque demonstrativo.
export async function toggleProductAvailability(input: { productId: string; availability: "available" | "unavailable" }): Promise<ActionResult> {
  const parsed = z.object({ productId: uuid, availability: z.enum(["available", "unavailable"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await getSellerContext();
  if (ctx.state !== "ok" || !ctx.org) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ availability: parsed.data.availability }).eq("id", parsed.data.productId).eq("seller_org_id", ctx.org.id).select("id").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return { ok: false, error: "not_found" };
  revalidateProduct(data.id);
  return { ok: true };
}

export async function setProductDemoStock(input: { productId: string; demoStock: number | null }): Promise<ActionResult> {
  const parsed = z.object({ productId: uuid, demoStock: z.number().int().min(0).max(100_000).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const ctx = await getSellerContext();
  if (ctx.state !== "ok" || !ctx.org) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ demo_stock: parsed.data.demoStock }).eq("id", parsed.data.productId).eq("seller_org_id", ctx.org.id).select("id").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return { ok: false, error: "not_found" };
  revalidateProduct(data.id);
  return { ok: true };
}
