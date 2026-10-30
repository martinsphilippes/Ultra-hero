import { BadgeCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ContentTileData } from "@/components/discover/explore/tiles";
import { hubHref } from "@/lib/catalog/creator-hub";
import type { RecipeCardData } from "@/lib/recipes/card";
import { loadRecipeCards } from "@/lib/recipes/catalog";
import { EMPTY_RECIPE_PARAMS, hasRecipeCriteria, recipeCatalogHref, type RecipeCatalogParams } from "@/lib/recipes/catalog-params";
import { createClient } from "@/lib/supabase/server";
import { HireNutritionist } from "@/components/professionals/HireNutritionist";
import { loadShowcaseCardContext, ShowcaseRecipeCard, type ShowcaseHeroRef } from "../showcase/showcase-cards";
import { RecipeCatalog } from "./RecipeCatalog";
import { RECIPE_GRID } from "./grid";

type Props = {
  /** Receitas da biblioteca (próprias e indicadas, já filtradas pelo que está no ar). */
  recipes: ContentTileData[];
  hero: ShowcaseHeroRef;
  params: RecipeCatalogParams;
};

// Biblioteca "Receitas" do herói (perfil público do chef): primeiro as receitas que ele assina, com
// busca e filtros (recipe_catalog com p_creator, carregamento progressivo); depois as que ele
// indica, assinadas por outros chefs. Busca e filtros só aparecem quando há receitas próprias e
// valem para elas; com busca ou filtro ativo, as indicadas saem e um aviso explica.
// Alimentação completa (0051): cada card traz a assinatura da vitrine (chef escolhido pelo admin ·
// indicada por este herói) e as ações Fazer, Lista de compras e, com produto ligado, Comprar pronto.
export async function ChefRecipes({ recipes, hero, params }: Props) {
  const [t, tl] = await Promise.all([getTranslations("recipes.chefProfile"), getTranslations("recipes.library")]);
  const base = hubHref(hero.slug, "alimentacao");
  const own = recipes.filter((r) => r.creator?.slug === hero.slug);
  const endorsedIds = recipes.filter((r) => r.creator?.slug !== hero.slug).map((r) => r.id);
  const criteria = own.length > 0 && hasRecipeCriteria(params);

  let endorsed: RecipeCardData[] = [];
  if (endorsedIds.length > 0 && !criteria) {
    try {
      endorsed = await loadRecipeCards(await createClient(), endorsedIds);
    } catch {
      endorsed = [];
    }
  }
  const ctx = endorsed.length > 0 ? await loadShowcaseCardContext(endorsed.map((r) => r.id)) : null;

  return (
    <div className="flex flex-col gap-8">
      {own.length > 0 ? (
        <div className="flex flex-col gap-2">
          <RecipeCatalog
            params={params}
            base={base}
            fixed={[]}
            creator={{ id: hero.id, name: hero.name }}
            showSearch
            showcase={hero}
            track="chef"
            idPrefix="chef-recipes"
            heading={endorsedIds.length > 0 ? t("own", { hero: hero.name }) : undefined}
          />
          <p className="type-caption text-fg-subtle">{t("filtersScope", { hero: hero.name })}</p>
        </div>
      ) : null}

      {criteria && endorsedIds.length > 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 type-body-sm text-fg-muted" data-testid="chef-endorsed-hidden">
          {t("endorsedHidden", { count: endorsedIds.length })}{" "}
          <a href={recipeCatalogHref(base, EMPTY_RECIPE_PARAMS)} className="font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("showAll")}
          </a>
        </p>
      ) : null}

      {endorsed.length > 0 && ctx ? (
        <section aria-labelledby="chef-endorsed-title" className="flex flex-col gap-3" data-testid="chef-endorsed">
          <h2 id="chef-endorsed-title" className="type-h3 text-fg">
            {t("endorsed", { hero: hero.name })}
          </h2>
          <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 type-body-sm text-fg-muted" data-testid="recipe-endorsement-note">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            {tl("endorsementNote", { hero: hero.name })}
          </p>
          <ul className={RECIPE_GRID}>
            {endorsed.map((recipe, index) => (
              <li key={recipe.id}>
                <ShowcaseRecipeCard recipe={recipe} hero={hero} ctx={ctx} priority={own.length === 0 && index < 4} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Contratar nutricionista (Etapa 3, 0058): sugeridos deste herói; sem a 0058, a linha "em breve" */}
      <HireNutritionist contentId={null} creatorId={hero.id} source="alimentacao" nextPath={base} />
    </div>
  );
}
