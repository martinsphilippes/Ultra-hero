import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DemoNotice, Panel } from "@/components/admin-content";
import { BundlesEditor, DependenciesEditor, ModulesEditor, type BundleRow, type DependencyRow, type ModuleRow, type PlanRow } from "@/components/admin-content/PlansEditors";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Planos simulados: módulos, dependências e pacotes. Nenhuma cobrança real.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.plans");
  return { title: t("title") };
}

export default async function AdminPlansPage() {
  const supabase = await createClient();
  const [t, modulesRes, depsRes, plansRes, bundlesRes] = await Promise.all([
    getTranslations("adminContent.plans"),
    supabase.from("plan_modules").select("id, code, name, description, price_cents_demo, is_active, sort_order").order("sort_order").order("code"),
    supabase.from("module_dependencies").select("module_id, requires_module_id"),
    supabase.from("plans").select("id, code, name, description, is_free, is_active, sort_order").order("sort_order").order("code"),
    supabase.from("plan_bundle_modules").select("plan_id, module_id"),
  ]);
  for (const res of [modulesRes, depsRes, plansRes, bundlesRes]) if (res.error) throw new Error(res.error.message);
  const modules = (modulesRes.data ?? []) as ModuleRow[];
  const dependencies = (depsRes.data ?? []) as DependencyRow[];
  const plans = (plansRes.data ?? []) as PlanRow[];
  const bundles = (bundlesRes.data ?? []) as BundleRow[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <DemoNotice />
      <Panel title={t("modules.title")}>
        <ModulesEditor modules={modules} />
      </Panel>
      <Panel title={t("dependencies.title")} description={t("dependencies.description")}>
        <DependenciesEditor modules={modules} dependencies={dependencies} />
      </Panel>
      <Panel title={t("bundles.title")}>
        <BundlesEditor plans={plans} modules={modules} bundles={bundles} />
      </Panel>
    </div>
  );
}
