import type { Metadata } from "next";
import { ExternalLink, Eye, History, Info } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/admin";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { RecipeWizard } from "@/components/recipes/editor/RecipeWizard";
import { RecipeRowActions } from "@/components/recipes/portal/RecipeRowActions";
import { Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { draftFromRows } from "@/lib/recipes/draft";
import { parseEditorStep } from "@/lib/recipes/editor-steps";
import { myRecipeStatus, recipeActions } from "@/lib/recipes/portal";
import { loadRecipeRows } from "@/lib/recipes/rows";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../../../_lib/creator";
import { readVideoUploadConfigured } from "../../../_lib/video-post";
import { loadLatestFeedback, loadOwnRecipeContent, loadRecipeCategories, loadRecipeReviewRequired, loadUploadsEnabled } from "../../_lib/load";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("recipes.editor");
  if (!z.uuid().safeParse(id).success) return { title: t("metaEdit") };
  const supabase = await createClient();
  const { data } = await supabase.from("content").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `${t("metaEdit")} · ${data.title}` : t("metaEdit") };
}

// Editor de uma receita própria. Rascunho fora de revisão abre o assistente de 6 etapas; nas demais
// situações (em revisão, no ar, agendada, arquivada) mostra o estado e as ações possíveis.
export default async function EditRecipePage({ params, searchParams }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const [t, tp, tn, locale, ctx] = await Promise.all([getTranslations("recipes.editor"), getTranslations("recipes.portal"), getTranslations("nav"), getLocale(), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("metaEdit")} />;

  const supabase = await createClient();
  const content = await loadOwnRecipeContent(supabase, id, ctx.creatorId);
  if (!content) notFound();
  const situation = myRecipeStatus(content);
  const editable = content.status === "draft" && content.review_status !== "in_review";

  const header = (
    <PageHeader title={content.title} eyebrow={tn("portals.creator")} backHref="/creator/recipes" backLabel={tp("title")}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={situation} label={tp(`statuses.${situation}`)} size="md" />
        <Button asChild variant="ghost" leadingIcon={<Eye />}>
          <Link href={`/creator/recipes/${id}/preview`}>{t("preview")}</Link>
        </Button>
        {situation === "published" && (
          <Button asChild variant="ghost" trailingIcon={<ExternalLink />}>
            <Link href={`/content/${content.slug}`}>{tp("actions.viewPublic")}</Link>
          </Button>
        )}
      </div>
    </PageHeader>
  );

  const feedback = situation === "returned" ? await loadLatestFeedback(supabase, id) : null;

  if (!editable) {
    const panelKey = situation === "archived" && content.archived_by !== "creator" ? "archivedByAdmin" : situation;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div role="status" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-fg" data-testid="recipe-status-panel">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{t(`panel.${panelKey}`, { date: content.publish_at ? formatDateTime(content.publish_at, locale as Locale) : "" })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" leadingIcon={<History />}>
            <Link href={`/creator/recipes/${id}/versions`}>{t("versions")}</Link>
          </Button>
          <RecipeRowActions id={id} title={content.title} slug={content.slug} situation={situation} allowed={recipeActions(situation, content)} />
        </div>
      </div>
    );
  }

  const [rows, categories, reviewRequired, uploadsEnabled, videoConfigured] = await Promise.all([
    loadRecipeRows(supabase, id, { withVideo: true }),
    loadRecipeCategories(supabase, locale),
    loadRecipeReviewRequired(supabase),
    loadUploadsEnabled(supabase),
    readVideoUploadConfigured(supabase),
  ]);
  const draft = draftFromRows(content, rows);

  return (
    <div className="flex flex-col gap-6">
      {header}
      {feedback && (
        <blockquote className="rounded-xl border-l-4 border-warning/60 bg-warning-soft px-4 py-3 text-sm text-fg">
          <span className="font-semibold">{t("panel.feedback")}: </span>
          {feedback}
        </blockquote>
      )}
      <RecipeWizard
        mode="edit"
        contentId={id}
        creatorId={ctx.creatorId}
        initialDraft={draft}
        updatedAt={content.updated_at}
        initialStep={parseEditorStep(sp.step)}
        categories={categories}
        reviewRequired={reviewRequired}
        uploadsEnabled={uploadsEnabled}
        videoConfigured={videoConfigured}
        currentCoverUrl={content.cover_url}
        nutritionValidated={Boolean(rows.nutrition?.validated)}
      />
    </div>
  );
}
