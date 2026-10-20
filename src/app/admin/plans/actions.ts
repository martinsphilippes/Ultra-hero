"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionResult } from "@/components/admin";
import { failWith } from "@/components/admin-content/lib/translate-error";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Planos simulados: módulos (unidade de direito), dependências configuráveis e pacotes.
// Escrita direta sob RLS de admin (tabelas de catálogo, sem RPC própria). Preços são demonstrativos.

const fail = failWith;
const uuid = z.uuid();

async function requireAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("unauthenticated");
  if (!(await hasRole("admin"))) throw new Error("forbidden");
}

function revalidate() {
  revalidatePath("/admin/plans");
  revalidatePath("/profile/plans");
}

// ---------------------------------------------------------------- módulos ----
const moduleSchema = z.object({
  id: uuid.nullable().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400),
  price_cents_demo: z.number().int().min(0).max(1_000_000),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
});

export type ModuleInput = z.infer<typeof moduleSchema>;

export async function saveModuleAction(input: ModuleInput): Promise<ActionResult> {
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const t = await getTranslations("adminContent.plans.modules");
    const v = parsed.data;
    if (v.id) {
      // código é imutável após a criação
      const { error } = await supabase
        .from("plan_modules")
        .update({ name: v.name, description: v.description || null, price_cents_demo: v.price_cents_demo, is_active: v.is_active, sort_order: v.sort_order })
        .eq("id", v.id);
      if (error) return fail(error);
      revalidate();
      return { ok: true, message: t("updated") };
    }
    const { error } = await supabase
      .from("plan_modules")
      .insert({ code: v.code, name: v.name, description: v.description || null, price_cents_demo: v.price_cents_demo, is_active: v.is_active, sort_order: v.sort_order });
    if (error) return fail(error);
    revalidate();
    return { ok: true, message: t("created") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- dependências
export async function saveDependenciesAction(moduleId: string, requiresIds: string[]): Promise<ActionResult> {
  const parsed = z.object({ moduleId: uuid, requiresIds: z.array(uuid).max(50) }).safeParse({ moduleId, requiresIds });
  if (!parsed.success) return fail("invalid_input");
  if (parsed.data.requiresIds.includes(parsed.data.moduleId)) return fail("self_dependency");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error: delError } = await supabase.from("module_dependencies").delete().eq("module_id", parsed.data.moduleId);
    if (delError) return fail(delError);
    if (parsed.data.requiresIds.length > 0) {
      const { error } = await supabase.from("module_dependencies").insert(parsed.data.requiresIds.map((requires_module_id) => ({ module_id: parsed.data.moduleId, requires_module_id })));
      if (error) return fail(error);
    }
    revalidate();
    const t = await getTranslations("adminContent.plans.dependencies");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------- planos (pacotes)
const planSchema = z.object({
  id: uuid.nullable().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400),
  is_free: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
  module_ids: z.array(uuid).max(50),
});

export type PlanInput = z.infer<typeof planSchema>;

export async function savePlanAction(input: PlanInput): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  try {
    await requireAdmin();
    const supabase = await createClient();
    const t = await getTranslations("adminContent.plans.bundles");
    const v = parsed.data;
    const moduleIds = v.is_free ? [] : Array.from(new Set(v.module_ids));
    let planId = v.id ?? null;
    if (planId) {
      const { error } = await supabase
        .from("plans")
        .update({ name: v.name, description: v.description || null, is_free: v.is_free, is_active: v.is_active, sort_order: v.sort_order })
        .eq("id", planId);
      if (error) return fail(error);
    } else {
      const { data, error } = await supabase
        .from("plans")
        .insert({ code: v.code, name: v.name, description: v.description || null, is_free: v.is_free, is_active: v.is_active, sort_order: v.sort_order })
        .select("id")
        .single();
      if (error || !data) return fail(error ?? "generic");
      planId = data.id;
    }
    const { error: delError } = await supabase.from("plan_bundle_modules").delete().eq("plan_id", planId);
    if (delError) return fail(delError);
    if (moduleIds.length > 0) {
      const { error } = await supabase.from("plan_bundle_modules").insert(moduleIds.map((module_id) => ({ plan_id: planId!, module_id })));
      if (error) return fail(error);
    }
    revalidate();
    return { ok: true, message: v.id ? t("updated") : t("created") };
  } catch (error) {
    return fail(error);
  }
}
