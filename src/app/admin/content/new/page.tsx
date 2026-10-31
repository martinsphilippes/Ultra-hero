import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminContentEditor } from "@/components/admin-content/AdminContentEditor";
import { pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { ActingHeroForCreator } from "@/components/admin-ops/ActingHeroForCreator";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Criação de conteúdo pelo admin escolhendo o herói responsável.
// Vindo do atalho "Novo conteúdo" de Publicar como hero (?creator=<id>), o herói já vem selecionado.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content.form");
  return { title: t("createTitle") };
}

export default async function AdminContentNewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const preselected = pickUuid(await searchParams, "creator");
  const supabase = await createClient();
  const [t, tc, creatorsRes] = await Promise.all([
    getTranslations("adminContent.content.form"),
    getTranslations("adminContent.common"),
    supabase.from("creator_profiles").select("id, name, is_fictional").eq("status", "active").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ActingHeroForCreator creatorId={preselected} />
      <PageHeader title={t("createTitle")} description={t("createDescription")} backHref="/admin/content" backLabel={tc("backToList")} />
      <AdminContentEditor mode="create" creators={creatorsRes.data ?? []} initialCreatorId={preselected && (creatorsRes.data ?? []).some((c) => c.id === preselected) ? preselected : null} />
    </div>
  );
}
