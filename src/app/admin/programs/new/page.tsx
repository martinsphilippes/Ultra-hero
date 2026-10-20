import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProgramCreateForm } from "@/components/admin-content/ProgramForms";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.programs.create");
  return { title: t("title") };
}

// Novo programa (rascunho) + primeira versão.
export default async function AdminProgramNewPage() {
  const supabase = await createClient();
  const [t, tc, creatorsRes] = await Promise.all([
    getTranslations("adminContent.programs.create"),
    getTranslations("adminContent.common"),
    supabase.from("creator_profiles").select("id, name").eq("status", "active").order("name"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} backHref="/admin/programs" backLabel={tc("backToList")} />
      <ProgramCreateForm creators={creatorsRes.data ?? []} />
    </div>
  );
}
