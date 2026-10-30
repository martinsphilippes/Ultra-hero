"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { LIBRARY_KEYS } from "@/lib/catalog/creator-libraries";
import { HERO_ALL_SLUG, HERO_CATEGORY_MAX, HERO_CATEGORY_SLUG_RE, validateCategorySelection } from "@/lib/heroes/categories";
import { toCategoryTabRow } from "@/lib/heroes/library-tab-queries";
import { DEFAULT_LIBRARY_ICON, LIBRARY_ICON_KEYS, LIBRARY_LABEL_MAX, overrideDiff, primaryCategoryId, resolveLibraryConfig, type LibraryLabel } from "@/lib/heroes/library-tabs";
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

// ---------------------------------------------------------------- atalhos da página do herói (0050)
// As fontes são fixas (LIBRARY_KEYS); o admin muda rótulo, ícone, ordem e visibilidade. Trocas
// atômicas por RPC security invoker (a RLS de admin decide); auditoria pelo gatilho do banco.

const tabLabel = z.string().trim().max(LIBRARY_LABEL_MAX);
const tabRowSchema = z.object({
  key: z.enum(LIBRARY_KEYS),
  label: z.object({ "pt-BR": tabLabel, en: tabLabel, es: tabLabel }),
  icon: z.enum(LIBRARY_ICON_KEYS),
  isVisible: z.boolean(),
});
const tabRowsSchema = z
  .array(tabRowSchema)
  .length(LIBRARY_KEYS.length)
  .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length);

export type LibraryTabInput = z.input<typeof tabRowSchema>;

/** Rótulo digitado → jsonb (pt-BR obrigatório se houver tradução); tudo vazio = null (padrão/herda). */
function labelFromInput(label: LibraryTabInput["label"]): { ok: true; value: LibraryLabel | null } | { ok: false } {
  const pt = label["pt-BR"].trim();
  const en = label.en.trim();
  const es = label.es.trim();
  if (!pt) return en || es ? { ok: false } : { ok: true, value: null };
  const value: LibraryLabel = { "pt-BR": pt };
  if (en) value.en = en;
  if (es) value.es = es;
  return { ok: true, value };
}

function revalidateTabs(creatorId?: string) {
  revalidatePath("/admin/hero-categories");
  // páginas dos heróis (hub e bibliotecas)
  revalidatePath("/personalities/[slug]", "page");
  revalidatePath("/personalities/[slug]/[library]", "page");
  if (creatorId) revalidatePath(`/admin/creators/${creatorId}`);
}

/** Salva os 7 atalhos da categoria de uma vez, na ordem recebida (10, 20, 30…). */
export async function saveCategoryLibraryTabsAction(categoryId: string, rows: LibraryTabInput[]): Promise<ActionResult> {
  const parsed = z.object({ categoryId: uuid, rows: tabRowsSchema }).safeParse({ categoryId, rows });
  if (!parsed.success) return fail("invalid_input");
  const payload = [];
  for (const [index, row] of parsed.data.rows.entries()) {
    const label = labelFromInput(row.label);
    if (!label.ok) return fail("library_tab_label_pt_required");
    payload.push({
      source_key: row.key,
      label: label.value,
      // ícone igual ao padrão fica null: segue o padrão do código
      icon: row.icon === DEFAULT_LIBRARY_ICON[row.key] ? null : row.icon,
      sort_order: (index + 1) * 10,
      is_visible: row.isVisible,
    });
  }
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_set_category_library_tabs", { p_category: parsed.data.categoryId, p_rows: payload });
    if (error) return fail(error);
    revalidateTabs();
    const t = await getTranslations("adminContent.heroCategories.tabs");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

/** Configuração herdada pelo herói (categoria principal ativa, sem a exceção dele). */
async function inheritedTabs(supabase: Awaited<ReturnType<typeof createClient>>, creatorId: string) {
  const { data: links, error } = await supabase
    .from("creator_category_links")
    .select("category_id, position, category:hero_categories(is_active)")
    .eq("creator_id", creatorId)
    .order("position");
  if (error) throw error;
  const active = ((links ?? []) as unknown as { category_id: string; position: number; category: { is_active: boolean } | null }[]).filter((l) => l.category?.is_active);
  const categoryId = primaryCategoryId(active.map((l) => ({ categoryId: l.category_id, position: l.position })));
  if (!categoryId) return resolveLibraryConfig({ categoryId: null });
  const { data: tabs, error: tabsError } = await supabase.from("hero_library_tabs").select("source_key, label, icon, sort_order, is_visible").eq("category_id", categoryId);
  if (tabsError) throw tabsError;
  return resolveLibraryConfig({ categoryId, categoryRows: (tabs ?? []).map((row) => toCategoryTabRow(categoryId, row)) });
}

/**
 * Exceção do herói: recebe os 7 atalhos como o admin quer vê-los (rótulo vazio = herda) e grava só
 * o que difere do herdado da categoria. Sem diferença: sem exceção.
 */
export async function saveCreatorLibraryOverridesAction(creatorId: string, rows: LibraryTabInput[]): Promise<ActionResult> {
  const parsed = z.object({ creatorId: uuid, rows: tabRowsSchema }).safeParse({ creatorId, rows });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const inherited = await inheritedTabs(supabase, parsed.data.creatorId);
    const byKey = new Map(inherited.map((tab) => [tab.key, tab]));
    const wanted = [];
    for (const [index, row] of parsed.data.rows.entries()) {
      const label = labelFromInput(row.label);
      if (!label.ok) return fail("library_tab_label_pt_required");
      wanted.push({ key: row.key, label: label.value ?? byKey.get(row.key)!.label, icon: row.icon, sortOrder: (index + 1) * 10, isVisible: row.isVisible });
    }
    // mesma sequência da herdada: mantém os valores herdados de ordem (nada a gravar)
    const sameOrder = wanted.every((row, index) => inherited[index]?.key === row.key);
    const normalized = sameOrder ? wanted.map((row) => ({ ...row, sortOrder: byKey.get(row.key)!.sortOrder })) : wanted;
    const { error } = await supabase.rpc("admin_set_creator_library_overrides", { p_creator: parsed.data.creatorId, p_rows: overrideDiff(inherited, normalized) });
    if (error) return fail(error);
    revalidateTabs(parsed.data.creatorId);
    const t = await getTranslations("adminContent.heroCategories.tabs");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

/** "Voltar ao padrão da categoria": apaga a exceção de um atalho (ou de todos, sem key). */
export async function resetCreatorLibraryOverrideAction(creatorId: string, key: string | null): Promise<ActionResult> {
  const parsed = z.object({ creatorId: uuid, key: z.enum(LIBRARY_KEYS).nullable() }).safeParse({ creatorId, key });
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    let query = supabase.from("creator_library_overrides").delete().eq("creator_id", parsed.data.creatorId);
    if (parsed.data.key) query = query.eq("source_key", parsed.data.key);
    const { error } = await query;
    if (error) return fail(error);
    revalidateTabs(parsed.data.creatorId);
    const t = await getTranslations("adminContent.heroCategories.tabs");
    return { ok: true, message: t("resetDone") };
  } catch (error) {
    return fail(error);
  }
}
