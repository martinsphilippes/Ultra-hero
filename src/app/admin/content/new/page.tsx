import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminContentEditor } from "@/components/admin-content/AdminContentEditor";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Criação de conteúdo pelo admin escolhendo a personalidade fictícia responsável.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content.form");
  return { title: t("createTitle") };
}

export default async function AdminContentNewPage() {
  const supabase = await createClient();
  const [t, tc, modulesRes, creatorsRes] = await Promise.all([
    getTranslations("adminContent.content.form"),
    getTranslations("adminContent.common"),
    supabase.from("plan_modules").select("id, name, code").order("sort_order"),
    supabase.from("creator_profiles").select("id, name, is_fictional").eq("status", "active").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} description={t("createDescription")} backHref="/admin/content" backLabel={tc("backToList")} />
      <AdminContentEditor mode="create" modules={modulesRes.data ?? []} creators={creatorsRes.data ?? []} initialCreatorId={null} />
    </div>
  );
}
