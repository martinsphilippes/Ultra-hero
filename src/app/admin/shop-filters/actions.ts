"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { SHOP_ALL_SLUG, SHOP_SLUG_RE } from "@/lib/shop/filters";
import { createClient } from "@/lib/supabase/server";

// Filtros da aba Comprar (0047): escrita direta sob a RLS de admin; cada mudança é auditada pelo
// gatilho do banco (admin_audit, resource_type 'shop_filter').

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

function revalidate() {
  revalidatePath("/admin/shop-filters");
  revalidatePath("/shop");
}

const label = z.string().trim().max(40);

const filterSchema = z.object({
  id: uuid.nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(SHOP_SLUG_RE)
    .refine((s) => s !== SHOP_ALL_SLUG),
  name: z.object({ "pt-BR": label.min(1), en: label, es: label }),
  is_active: z.boolean(),
  categoryIds: z.array(uuid).max(50),
  productIds: z.array(uuid).max(500),
});

export type ShopFilterInput = z.input<typeof filterSchema>;

/** Cria ou atualiza o filtro e substitui as categorias e os produtos ligados. */
export async function saveShopFilterAction(input: ShopFilterInput): Promise<ActionResult & { id?: string }> {
  const parsed = filterSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const { id, slug, name, is_active } = parsed.data;
  const categoryIds = [...new Set(parsed.data.categoryIds)];
  const productIds = [...new Set(parsed.data.productIds)];
  // en/es vazios ficam de fora: o app cai no pt-BR
  const names: Record<string, string> = { "pt-BR": name["pt-BR"] };
  if (name.en) names.en = name.en;
  if (name.es) names.es = name.es;
  try {
    await requireAdmin();
    const supabase = await createClient();
    let filterId = id;
    if (filterId) {
      const { data, error } = await supabase.from("shop_filters").update({ slug, name: names, is_active }).eq("id", filterId).select("id").maybeSingle();
      if (error) return fail(error);
      if (!data) return fail("not_found");
    } else {
      // novo filtro entra no fim da fila
      const { data: last } = await supabase.from("shop_filters").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase
        .from("shop_filters")
        .insert({ slug, name: names, is_active, sort_order: (last?.sort_order ?? 0) + 10 })
        .select("id")
        .single();
      if (error || !data) return fail(error ?? "generic");
      filterId = data.id;
    }

    // vínculos: apaga o que saiu e insere o que entrou (cada linha auditada)
    const [cats, prods] = await Promise.all([
      supabase.from("shop_filter_categories").select("category_id").eq("filter_id", filterId),
      supabase.from("shop_filter_products").select("product_id").eq("filter_id", filterId),
    ]);
    if (cats.error) return fail(cats.error);
    if (prods.error) return fail(prods.error);
    const currentCats = new Set((cats.data ?? []).map((r) => r.category_id));
    const currentProds = new Set((prods.data ?? []).map((r) => r.product_id));

    const removeCats = [...currentCats].filter((c) => !categoryIds.includes(c));
    const addCats = categoryIds.filter((c) => !currentCats.has(c));
    const removeProds = [...currentProds].filter((p) => !productIds.includes(p));
    const addProds = productIds.filter((p) => !currentProds.has(p));

    if (removeCats.length) {
      const { error } = await supabase.from("shop_filter_categories").delete().eq("filter_id", filterId).in("category_id", removeCats);
      if (error) return fail(error);
    }
    if (addCats.length) {
      const { error } = await supabase.from("shop_filter_categories").insert(addCats.map((category_id) => ({ filter_id: filterId!, category_id })));
      if (error) return fail(error);
    }
    if (removeProds.length) {
      const { error } = await supabase.from("shop_filter_products").delete().eq("filter_id", filterId).in("product_id", removeProds);
      if (error) return fail(error);
    }
    if (addProds.length) {
      const { error } = await supabase.from("shop_filter_products").insert(addProds.map((product_id) => ({ filter_id: filterId!, product_id })));
      if (error) return fail(error);
    }

    revalidate();
    const t = await getTranslations("adminContent.shopFilters");
    return { ok: true, id: filterId, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

/** Sobe ou desce uma posição e renumera a ordem (10, 20, 30…). */
export async function moveShopFilterAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, direction: z.enum(["up", "down"]) }).safeParse({ id, direction });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.from("shop_filters").select("id, sort_order").order("sort_order").order("slug");
    if (error) return fail(error);
    const rows = data ?? [];
    const index = rows.findIndex((r) => r.id === parsed.data.id);
    if (index === -1) return fail("not_found");
    const target = parsed.data.direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return { ok: true };
    const ordered = [...rows];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    for (let i = 0; i < ordered.length; i++) {
      const sort_order = (i + 1) * 10;
      if (ordered[i].sort_order === sort_order) continue;
      const { error: updateError } = await supabase.from("shop_filters").update({ sort_order }).eq("id", ordered[i].id);
      if (updateError) return fail(updateError);
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setShopFilterActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, active: z.boolean() }).safeParse({ id, active });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.from("shop_filters").update({ is_active: parsed.data.active }).eq("id", parsed.data.id).select("id").maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidate();
    const t = await getTranslations("adminContent.shopFilters");
    return { ok: true, message: parsed.data.active ? t("activated") : t("deactivated") };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteShopFilterAction(id: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.from("shop_filters").delete().eq("id", parsed.data).select("id").maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidate();
    const t = await getTranslations("adminContent.shopFilters");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(error);
  }
}
