"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { slugWithSuffix } from "@/components/admin-content/lib/slug";
import { failWith } from "@/components/admin-content/lib/translate-error";
import type { ProductFormValues } from "@/components/editors/types";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Produtos (demonstração): moderação de qualquer produto via RPC e CRUD só da operação própria
// (seller_organizations.kind = 'own'). Produtos de parceiros são editados pelo fornecedor.

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
  return user.id;
}

function revalidateProduct(id?: string) {
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/links");
  // abas Produtos/Visão geral da organização (0053)
  revalidatePath("/admin/sellers", "layout");
}

// ---------------------------------------------------------------- moderação ---
export async function moderateProductAction(productId: string, action: "hide" | "suspend" | "clear", reason: string): Promise<ActionResult> {
  const parsed = z.object({ productId: uuid, action: z.enum(["hide", "suspend", "clear"]), reason: z.string().trim().max(500) }).safeParse({ productId, action, reason });
  if (!parsed.success) return fail("invalid_input");
  if (parsed.data.action !== "clear" && parsed.data.reason.length < 5) return fail("reason_required");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_moderate_product", {
      p_product: parsed.data.productId,
      p_action: parsed.data.action,
      p_reason: parsed.data.reason || undefined,
    });
    if (error) return fail(error);
    revalidateProduct(parsed.data.productId);
    const t = await getTranslations("adminContent.products.moderation");
    return { ok: true, message: t("done") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- operação própria (ProductForm)
const foodInfo = z
  .object({
    ingredients: z.array(z.string().trim().min(1).max(80)).max(60),
    allergens: z.array(z.string().trim().min(1).max(80)).max(40),
    storage: z.string().trim().max(300),
  })
  .nullable();

const productValues = z.object({
  id: uuid.optional(),
  seller_org_id: uuid,
  category_id: uuid,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  image_url: z.string().trim().min(1).max(500),
  price_cents_demo: z.number().int().min(0).max(10_000_000),
  product_type: z.enum(["physical", "kit", "digital"]),
  attributes: z.record(z.string(), z.unknown()),
  food_info: foodInfo,
  status: z.enum(["draft", "published", "archived"]),
  availability: z.enum(["available", "unavailable"]),
  demo_stock: z.number().int().min(0).max(100_000).nullable(),
});

export async function saveOwnProductAction(productId: string | null, values: ProductFormValues): Promise<ActionResult & { id?: string }> {
  const id = uuid.nullable().safeParse(productId);
  const parsed = productValues.safeParse(values);
  if (!id.success || !parsed.success) return fail("invalid_input");
  const v = parsed.data;
  try {
    const userId = await requireAdmin();
    const supabase = await createClient();
    // Só a operação própria é editável pelo admin; parceiros editam no próprio portal.
    const { data: org } = await supabase.from("seller_organizations").select("id, kind").eq("id", v.seller_org_id).maybeSingle();
    if (!org || org.kind !== "own") return fail("seller_not_own");
    const t = await getTranslations("adminContent.products.form");
    const fields = {
      seller_org_id: v.seller_org_id,
      category_id: v.category_id,
      title: v.title,
      description: v.description,
      image_url: v.image_url,
      price_cents_demo: v.price_cents_demo,
      product_type: v.product_type,
      attributes: v.attributes as never,
      food_info: (v.food_info as never) ?? null,
      status: v.status,
      availability: v.availability,
      demo_stock: v.demo_stock,
    };
    if (id.data) {
      // Garante que o produto editado também pertence à operação própria.
      const { data: current } = await supabase.from("products").select("seller_org_id, seller:seller_organizations(kind)").eq("id", id.data).maybeSingle();
      const kind = (current as unknown as { seller: { kind: string } | null } | null)?.seller?.kind;
      if (!current || kind !== "own") return fail("seller_not_own");
      const { error } = await supabase.from("products").update(fields).eq("id", id.data);
      if (error) return fail(error);
      revalidateProduct(id.data);
      return { ok: true, id: id.data, message: t("updated") };
    }
    let inserted: string | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...fields, slug: slugWithSuffix(v.title), created_by: userId })
        .select("id")
        .single();
      if (!error && data) inserted = data.id;
      else {
        lastError = error;
        if (error?.code !== "23505") break;
      }
    }
    if (!inserted) return fail(lastError ?? "generic");
    revalidateProduct(inserted);
    return { ok: true, id: inserted, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}
