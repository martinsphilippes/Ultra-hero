import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContentTypeSettingsForm } from "@/components/admin-content/ContentTypeSettingsForm";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Padrões de conclusão por tipo de conteúdo (content_type_settings).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content.typeSettings");
  return { title: t("title") };
}

export default async function ContentTypeSettingsPage() {
  const supabase = await createClient();
  const [t, tc, res] = await Promise.all([
    getTranslations("adminContent.content.typeSettings"),
    getTranslations("adminContent.common"),
    supabase.from("content_type_settings").select("type, default_completion_mode, auto_threshold_pct").order("type"),
  ]);
  if (res.error) throw new Error(res.error.message);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} backHref="/admin/content" backLabel={tc("backToList")} />
      <ContentTypeSettingsForm rows={res.data ?? []} />
    </div>
  );
}
