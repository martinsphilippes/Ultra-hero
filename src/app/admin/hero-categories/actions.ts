"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { HERO_ALL_SLUG, HERO_CATEGORY_MAX, HERO_CATEGORY_SLUG_RE, validateCategorySelection } from "@/lib/heroes/categories";
import { createClient } from "@/lib/supabase/server";

// Categorias dos heróis (0049): escrita direta sob a RLS de admin; cada mudança é auditada pelo
// gatilho do banco (admin_audit, resource_type 'hero_category' / 'hero_category_link').

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

function revalidate(creatorId?: string) {
  revalidatePath("/admin/hero-categories");
  revalidatePath("/personalities");
  if (creatorId) revalidatePath(`/admin/creators/${creatorId}`);
}

const label = z.string().trim().max(40);

const categorySchema = z.object({
  id: uuid.nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(HERO_CATEGORY_SLUG_RE)
    .refine((s) => s !== HERO_ALL_SLUG),
  name: z.object({ "pt-BR": label.min(1), en: label, es: label }),
  is_active: z.boolean(),
});

export type HeroCategoryInput = z.input<typeof categorySchema>;

/** Cria ou atualiza a categoria (rótulos, slug e ativo). */
export async function saveHeroCategoryAction(input: HeroCategoryInput): Promise<ActionResult & { id?: string }> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const { id, slug, name, is_active } = parsed.data;
  // en/es vazios ficam de fora: o app cai no pt-BR
  const names: Record<string, string> = { "pt-BR": name["pt-BR"] };
  if (name.en) names.en = name.en;
  if (name.es) names.es = name.es;
  try {
    await requireAdmin();
    const supabase = await createClient();
    let categoryId = id;
    if (categoryId) {
      const { data, error } = await supabase.from("hero_categories").update({ slug, name: names, is_active }).eq("id", categoryId).select("id").maybeSingle();
      if (error) return fail(error);
      if (!data) return fail("not_found");
    } else {
      // nova categoria entra no fim da fila
      const { data: last } = await supabase.from("hero_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase
        .from("hero_categories")
        .insert({ slug, name: names, is_active, sort_order: (last?.sort_order ?? 0) + 10 })
        .select("id")
        .single();
      if (error || !data) return fail(error ?? "generic");
      categoryId = data.id;
    }
    revalidate();
    const t = await getTranslations("adminContent.heroCategories");
    return { ok: true, id: categoryId, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

/** Sobe ou desce uma posição e renumera a ordem (10, 20, 30…). */
export async function moveHeroCategoryAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, direction: z.enum(["up", "down"]) }).safeParse({ id, direction });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.from("hero_categories").select("id, sort_order").order("sort_order").order("slug");
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
      const { error: updateError } = await supabase.from("hero_categories").update({ sort_order }).eq("id", ordered[i].id);
      if (updateError) return fail(updateError);
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setHeroCategoryActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, active: z.boolean() }).safeParse({ id, active });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.from("hero_categories").update({ is_active: parsed.data.active }).eq("id", parsed.data.id).select("id").maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidate();
    const t = await getTranslations("adminContent.heroCategories");
    return { ok: true, message: parsed.data.active ? t("activated") : t("deactivated") };
  } catch (error) {
    return fail(error);
  }
}

/** Exclui a categoria; os vínculos com heróis saem junto (cascata, auditada). */
export async function deleteHeroCategoryAction(id: string): Promise<ActionResult> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.from("hero_categories").delete().eq("id", parsed.data).select("id").maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("not_found");
    revalidate();
    const t = await getTranslations("adminContent.heroCategories");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return fail(error);
  }
}

/** Define as categorias do herói (até 2, na ordem dada) numa transação só (RPC invoker). */
export async function setCreatorCategoriesAction(creatorId: string, categoryIds: string[]): Promise<ActionResult> {
  const parsed = z.object({ creatorId: uuid, categoryIds: z.array(uuid).max(HERO_CATEGORY_MAX + 1) }).safeParse({ creatorId, categoryIds });
  if (!parsed.success) return fail("invalid_input");
  const selection = validateCategorySelection(parsed.data.categoryIds);
  if (!selection.ok) return fail(selection.error === "too_many" ? "hero_categories_max_2" : "hero_categories_duplicate");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_creator_categories", { p_creator: parsed.data.creatorId, p_categories: selection.ids });
    if (error) return fail(error);
    revalidate(parsed.data.creatorId);
    const t = await getTranslations("adminContent.heroCategories.field");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}
