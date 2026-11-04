import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { CampaignBanner } from "@/components/hero-work/CampaignBanner";
import { RecipeWizard } from "@/components/recipes/editor/RecipeWizard";
import { PageHeader } from "@/components/ui";
import { loadHeroCampaign } from "@/lib/hero-work/campaign-server";
import { emptyDraft } from "@/lib/recipes/draft";
import { getContentWorkspace } from "../../_lib/creator";
import { loadRecipeCategories, loadRecipeReviewRequired } from "../_lib/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("recipes.editor");
  return { title: t("metaNew") };
}

// Nova receita: só a etapa 1 (básicos). "Criar rascunho e continuar" cria o conteúdo (tipo
// receita, pilar gastronomia, capa placeholder) e grava pela recipe_save; as demais etapas seguem
// no editor do rascunho criado.
// ?campanha= (pedido do responsável, 04/11): a faixa da campanha com as marcas obrigatórias (copiar) e o lembrete de
// enviar o link da receita publicada como entrega na campanha. O assistente da receita não muda (decisão: o editor em
// etapas grava rascunhos em várias telas; levar o contexto por todas elas fica para depois).
type Props = { searchParams: Promise<{ campanha?: string }> };

export default async function NewRecipePage({ searchParams }: Props) {
  const sp = await searchParams;
  const [t, tp, tn, locale, ctx, campaign] = await Promise.all([getTranslations("recipes.editor"), getTranslations("recipes.portal"), getTranslations("nav"), getLocale(), getContentWorkspace("recipes", { followChoice: false }), loadHeroCampaign(sp.campanha)]);
  if (!ctx.creatorId) return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} name={ctx.profile?.name} title={t("metaNew")} />;
  const supabase = ctx.supabase;
  const [categories, reviewRequired] = await Promise.all([loadRecipeCategories(supabase, locale), loadRecipeReviewRequired(supabase)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("metaNew")} eyebrow={tn("portals.creator")} backHref="/heroi/receitas" backLabel={tp("title")} />
      {campaign ? <CampaignBanner campaign={campaign} note={t("campaignNote")} /> : null}
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
