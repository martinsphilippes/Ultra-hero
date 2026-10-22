import type { Metadata } from "next";
import { ArrowLeft, Eye } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { RecipeView } from "@/components/recipes/view/RecipeView";
import { loadRecipeView } from "@/components/recipes/view/load-recipe-view";
import { Button } from "@/components/ui";
import { isLive } from "@/lib/recipes/media";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../../../_lib/creator";
import { loadOwnRecipeContent, loadRecipeCategories } from "../../_lib/load";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("recipes.preview");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

// Pré-visualização do chef: o mesmo RecipeView da página pública, lido com o acesso de dono
// (a RLS libera rascunho, agendada e foto de etapa ao herói), com a faixa "Pré-visualização".
export default async function RecipePreviewPage({ params }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, locale, ctx] = await Promise.all([getTranslations("recipes.preview"), getLocale(), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("metaTitle")} />;
  const supabase = await createClient();
  const content = await loadOwnRecipeContent(supabase, id, ctx.creatorId);
  if (!content) notFound();

  const [{ model, video }, categories, { data: creator }] = await Promise.all([
    loadRecipeView(supabase, { contentId: id, title: content.title, premium: false, userId: ctx.userId ?? undefined, locale, poster: content.cover_url }),
    loadRecipeCategories(supabase, locale),
    supabase.from("creator_profiles").select("slug, name, avatar_url, is_fictional").eq("id", ctx.creatorId).maybeSingle(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/40 bg-info-soft px-4 py-3" data-testid="recipe-preview-banner">
        <p className="flex items-center gap-2 type-body-sm font-medium text-fg">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          {t("banner")}
        </p>
        <Button asChild variant="secondary" leadingIcon={<ArrowLeft />}>
          <Link href={`/creator/recipes/${id}/edit?step=revisao`}>{t("backToEditor")}</Link>
        </Button>
      </div>
      <RecipeView
        model={model}
        video={video}
        unoptimizedImages={!isLive(content.status, content.publish_at)}
        categoryLabels={Object.fromEntries(categories.map((c) => [c.code, c.label]))}
        header={{ title: content.title, summary: content.summary, difficulty: content.difficulty, creator: creator ?? null }}
      />
    </div>
  );
}
