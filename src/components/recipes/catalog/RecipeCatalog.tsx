import { SearchX } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button, EmptyState } from "@/components/ui";
import { fetchRecipeCatalog, loadRecipeCategories, type RecipeCatalogPage, type RecipeCategoryOption } from "@/lib/recipes/catalog";
import { EMPTY_RECIPE_PARAMS, hasRecipeCriteria, recipeCatalogHref, type RecipeCatalogParams } from "@/lib/recipes/catalog-params";
import { createClient } from "@/lib/supabase/server";
import { loadShowcaseCardContext, ShowcaseRecipeCard, type ShowcaseHeroRef } from "../showcase/showcase-cards";
import { RecipeCard } from "./RecipeCard";
import { RecipeCatalogGrid } from "./RecipeCatalogGrid";
import { RecipeCatalogRetry } from "./RecipeCatalogRetry";
import { RecipeFilters, RecipeSearchForm } from "./RecipeFilters";

type Props = {
  params: RecipeCatalogParams;
  base: string;
  fixed: [string, string][];
  /** Catálogo dentro de um chef (biblioteca do herói): só as receitas que ele assina. */
  creator?: { id: string; name: string } | null;
  /** O Explorar põe a busca no cabeçalho; a biblioteca do chef, aqui. */
  showSearch?: boolean;
  track: "explore" | "chef";
  idPrefix: string;
  /** Título visível da seção (na biblioteca do chef, que também lista as indicadas). */
  heading?: string;
  /** Alimentação do herói (0051): cards com assinatura da vitrine e as ações. */
  showcase?: ShowcaseHeroRef | null;
};

/** Categorias com rótulo no idioma da tela (compartilhado com a página da receita). */
export async function recipeCategoryOptions(): Promise<RecipeCategoryOption[]> {
  const [supabase, locale, ts] = await Promise.all([createClient(), getLocale(), getTranslations("recipes.structured.categories")]);
  return loadRecipeCategories(supabase, locale, (code) => (ts.has(code) ? ts(code) : code));
}

// Catálogo de receitas (aba Receitas do Explorar e biblioteca do chef): busca, filtros, cards e
// carregamento progressivo, com os estados de vazio e erro. A primeira página sai do servidor.
export async function RecipeCatalog({ params, base, fixed, creator = null, showSearch = false, track, idPrefix, heading, showcase = null }: Props) {
  const t = await getTranslations("recipes.catalog.results");
  const supabase = await createClient();
  const categories = await recipeCategoryOptions();
  const criteria = hasRecipeCriteria(params);

  let page: RecipeCatalogPage | null = null;
  try {
    page = await fetchRecipeCatalog(supabase, params, { creator: creator?.id ?? null });
  } catch {
    page = null;
  }
  const showcaseCtx = showcase && page && page.items.length > 0 ? await loadShowcaseCardContext(page.items.map((item) => item.id)) : null;

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="flex flex-col gap-4" data-testid="recipe-catalog">
      {showSearch ? <RecipeSearchForm params={params} base={base} fixed={fixed} idPrefix={idPrefix} /> : null}
      <RecipeFilters params={params} base={base} fixed={fixed} idPrefix={idPrefix} categories={categories} />

      <h2 id={`${idPrefix}-title`} className={params.q || heading ? "type-h3 text-fg" : "sr-only"}>
        {params.q ? t("resultsFor", { q: params.q }) : (heading ?? (creator ? t("headingChef", { name: creator.name }) : t("heading")))}
      </h2>

      {page === null ? (
        <div className="rounded-2xl border border-border bg-surface">
          <RecipeCatalogRetry />
        </div>
      ) : page.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="recipe-catalog-empty">
          <EmptyState
            icon={<SearchX />}
            title={criteria ? t("emptyTitle") : t("emptyNoneTitle")}
            description={criteria ? t("emptyDescription") : t("emptyNoneDescription")}
            action={
              criteria ? (
                <Button asChild variant="secondary">
                  <a href={recipeCatalogHref(base, EMPTY_RECIPE_PARAMS, fixed)}>{t("clearFilters")}</a>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <RecipeCatalogGrid
          key={JSON.stringify(params)}
          params={params}
          creator={creator?.id ?? null}
          nextCursor={page.nextCursor}
          initialCount={page.items.length}
          track={criteria || params.ordem !== "relevance" ? track : null}
          showcase={Boolean(showcase)}
        >
          {page.items.map((item, index) => (
            <li key={item.id}>
              {showcase && showcaseCtx ? <ShowcaseRecipeCard recipe={item} hero={showcase} ctx={showcaseCtx} priority={index < 4} /> : <RecipeCard recipe={item} priority={index < 4} />}
            </li>
          ))}
        </RecipeCatalogGrid>
      )}
    </section>
  );
}
