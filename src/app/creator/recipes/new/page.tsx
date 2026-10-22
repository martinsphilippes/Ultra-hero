import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { RecipeWizard } from "@/components/recipes/editor/RecipeWizard";
import { PageHeader } from "@/components/ui";
import { emptyDraft } from "@/lib/recipes/draft";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../../_lib/creator";
import { loadRecipeCategories, loadRecipeReviewRequired } from "../_lib/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("recipes.editor");
  return { title: t("metaNew") };
}

// Nova receita: só a etapa 1 (básicos). "Criar rascunho e continuar" cria o conteúdo (tipo
// receita, pilar gastronomia, capa placeholder) e grava pela recipe_save; as demais etapas seguem
// no editor do rascunho criado.
export default async function NewRecipePage() {
  const [t, tp, tn, locale, ctx] = await Promise.all([getTranslations("recipes.editor"), getTranslations("recipes.portal"), getTranslations("nav"), getLocale(), getMyCreator()]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("metaNew")} />;
  const supabase = await createClient();
  const [categories, reviewRequired] = await Promise.all([loadRecipeCategories(supabase, locale), loadRecipeReviewRequired(supabase)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("metaNew")} eyebrow={tn("portals.creator")} backHref="/creator/recipes" backLabel={tp("title")} />
      <RecipeWizard
        mode="new"
        contentId={null}
        creatorId={ctx.creatorId}
        initialDraft={emptyDraft()}
        updatedAt={null}
        initialStep="basicos"
        categories={categories}
        reviewRequired={reviewRequired}
        uploadsEnabled={false}
        videoConfigured={false}
        currentCoverUrl="/placeholders/cover-gastronomy-1.svg"
        nutritionValidated={false}
      />
    </div>
  );
}
