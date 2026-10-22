import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContentTypeSettingsForm } from "@/components/admin-content/ContentTypeSettingsForm";
import { ReviewRequiredSettings } from "@/components/admin-content/ReviewRequiredSettings";
import { PageHeader, Section } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Padrões de conclusão por tipo de conteúdo (content_type_settings) e a regra de revisão por tipo.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.content.typeSettings");
  return { title: t("title") };
}

type ContentTypeValue = "video" | "recipe" | "workout" | "guide" | "article";

export default async function ContentTypeSettingsPage() {
  const supabase = await createClient();
  const [t, tc, tr, res, review] = await Promise.all([
    getTranslations("adminContent.content.typeSettings"),
    getTranslations("adminContent.common"),
    getTranslations("recipes.admin"),
    supabase.from("content_type_settings").select("type, default_completion_mode, auto_threshold_pct").order("type"),
    // consulta separada: banco sem a 0027 não tem a coluna e a página segue com os padrões
    supabase.from("content_type_settings").select("type, review_required").order("type"),
  ]);
  if (res.error) throw new Error(res.error.message);
  const reviewRows = review.error ? null : ((review.data ?? []) as { type: ContentTypeValue; review_required: boolean }[]).map((r) => ({ type: r.type, on: r.review_required }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} backHref="/admin/content" backLabel={tc("backToList")} />
      <ContentTypeSettingsForm rows={res.data ?? []} />
      <Section id="review-required" title={tr("reviewTitle")} description={tr("reviewDescription")}>
        {reviewRows ? <ReviewRequiredSettings rows={reviewRows} /> : <p className="type-body-sm text-fg-muted">{tr("unavailable")}</p>}
      </Section>
    </div>
  );
}
