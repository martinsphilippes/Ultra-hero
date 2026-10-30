"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { parseRpcError, rpcErrorToString } from "@/components/commerce/lib/errors";
import { createProductSchema } from "@/components/editors/product/schema";
import type { ProductFormValues } from "@/components/editors/types";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { productSlug } from "@/lib/seller-ops/slug";

// Produtos de uma organização operados pelo admin (o que o fornecedor fazia no portal), para QUALQUER
// organização (própria ou parceira). RLS de admin (is_admin) cobre a escrita; a 0053 audita cada
// insert/update em admin_audit. Erros no formato "codigo[:detalhe]" que o ProductForm traduz.

const uuid = z.uuid();
type SaveResult = ActionResult & { id?: string };

async function requireAdmin(): Promise<string | null> {
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) return null;
  return user.id;
}

function fail(message: string | null | undefined): { ok: false; error: string } {
  return { ok: false, error: rpcErrorToString(parseRpcError(message)) };
}

async function foodCategoryIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("product_categories").select("id").eq("is_food", true);
  return new Set((data ?? []).map((c) => c.id));
}

async function orgExists(orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("seller_organizations").select("id").eq("id", orgId).maybeSingle();
  return Boolean(data);
}

function revalidateOrg(orgId: string, productId?: string) {
  revalidatePath(`/admin/sellers/${orgId}`, "layout");
  revalidatePath("/admin/products");
  if (productId) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/shop");
}

async function parseValues(values: ProductFormValues) {
  const foodIds = await foodCategoryIds();
  return createProductSchema({ isFoodCategory: (id) => foodIds.has(id) }).safeParse(values);
}

// Cria o produto na organização da URL e abre a edição (o formulário compartilhado não conhece a rota).
export async function createOrgProductAction(orgId: string, values: ProductFormValues): Promise<SaveResult> {
  if (!uuid.safeParse(orgId).success) return { ok: false, error: "invalid_input" };
  const actor = await requireAdmin();
  if (!actor) return { ok: false, error: "forbidden" };
  const parsed = await parseValues(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  if (parsed.data.seller_org_id !== orgId || !(await orgExists(orgId))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  let createdId: string | null = null;
  // slug único: nome + sufixo curto; uma nova tentativa em caso de colisão
  for (let attempt = 0; attempt < 2 && !createdId; attempt += 1) {
    const { data, error } = await supabase
      .from("products")
      .insert({
        seller_org_id: orgId,
        category_id: parsed.data.category_id,
        slug: productSlug(parsed.data.title),
        title: parsed.data.title,
        description: parsed.data.description,
        image_url: parsed.data.image_url,
        price_cents_demo: parsed.data.price_cents_demo,
        product_type: parsed.data.product_type,
        attributes: parsed.data.attributes as never,
        food_info: (parsed.data.food_info as never) ?? null,
        status: parsed.data.status,
        availability: parsed.data.availability,
        demo_stock: parsed.data.demo_stock,
        created_by: actor,
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
  revalidateOrg(orgId, createdId);
  redirect(`/admin/sellers/${orgId}/products/${createdId}/edit?created=1`);
}

export async function updateOrgProductAction(orgId: string, values: ProductFormValues): Promise<SaveResult> {
  if (!uuid.safeParse(orgId).success || !values.id || !uuid.safeParse(values.id).success) return { ok: false, error: "invalid_input" };
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };
  const parsed = await parseValues(values);
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
      attributes: parsed.data.attributes as never,
      food_info: (parsed.data.food_info as never) ?? null,
      status: parsed.data.status,
      availability: parsed.data.availability,
      demo_stock: parsed.data.demo_stock,
    })
    .eq("id", values.id)
    .eq("seller_org_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return { ok: false, error: "not_found" };
  revalidateOrg(orgId, data.id);
  return { ok: true, id: data.id };
}

// Atalhos da listagem: disponibilidade e estoque demonstrativo.
export async function setOrgProductAvailabilityAction(input: { orgId: string; productId: string; availability: "available" | "unavailable" }): Promise<ActionResult> {
  const parsed = z.object({ orgId: uuid, productId: uuid, availability: z.enum(["available", "unavailable"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ availability: parsed.data.availability })
    .eq("id", parsed.data.productId)
    .eq("seller_org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return { ok: false, error: "not_found" };
  revalidateOrg(parsed.data.orgId, data.id);
  return { ok: true };
}

export async function setOrgProductStockAction(input: { orgId: string; productId: string; demoStock: number | null }): Promise<ActionResult> {
  const parsed = z.object({ orgId: uuid, productId: uuid, demoStock: z.number().int().min(0).max(100_000).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ demo_stock: parsed.data.demoStock })
    .eq("id", parsed.data.productId)
    .eq("seller_org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return { ok: false, error: "not_found" };
  revalidateOrg(parsed.data.orgId, data.id);
  return { ok: true };
}
