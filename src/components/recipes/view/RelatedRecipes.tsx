import { getTranslations } from "next-intl/server";
import { RecipeCard } from "@/components/recipes/catalog/RecipeCard";
import { Section } from "@/components/ui";
import type { RecipeCardData } from "@/lib/recipes/card";
import { loadRecipeCards } from "@/lib/recipes/catalog";
import { createClient } from "@/lib/supabase/server";

type Props = {
  contentId: string;
  chef: { id: string; slug: string; name: string } | null;
  categories: string[];
};

const PER_SECTION = 4;

// Relacionadas da página da receita: "Mais de {chef}" (as mais recentes do mesmo chef) e "Parecidas"
// (mesmas categorias, por recipe_catalog), sem repetir a receita aberta nem as do primeiro bloco.
// Só cards públicos; erro aqui some em silêncio (não derruba a página).
export async function RelatedRecipes({ contentId, chef, categories }: Props) {
  const [t, tc] = await Promise.all([getTranslations("recipes.page.related"), getTranslations("common")]);
  const supabase = await createClient();
  const [byChef, similar] = await Promise.all([
    chef ? supabase.rpc("recipe_catalog", { p_creator: chef.id, p_sort: "recent", p_limit: PER_SECTION + 1 }) : null,
    categories.length > 0 ? supabase.rpc("recipe_catalog", { p_categories: categories, p_sort: "relevance", p_limit: PER_SECTION * 2 + 2 }) : null,
  ]);
  const chefIds = (byChef?.data ?? []).map((r) => r.content_id).filter((id) => id !== contentId).slice(0, PER_SECTION);
  const taken = new Set([contentId, ...chefIds]);
  const similarIds = (similar?.data ?? []).map((r) => r.content_id).filter((id) => !taken.has(id)).slice(0, PER_SECTION);

  let cards: RecipeCardData[] = [];
  try {
    cards = await loadRecipeCards(supabase, [...chefIds, ...similarIds]);
  } catch {
    return null;
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fromChef = chefIds.map((id) => byId.get(id)).filter((c): c is RecipeCardData => Boolean(c));
  const alike = similarIds.map((id) => byId.get(id)).filter((c): c is RecipeCardData => Boolean(c));
  if (fromChef.length === 0 && alike.length === 0) return null;

  return (
    <div className="flex flex-col gap-8 print:hidden" data-testid="related-recipes">
      {chef && fromChef.length > 0 ? (
        <Section id="more-from-chef" title={t("moreFrom", { chef: chef.name })} href={`/personalities/${chef.slug}/receitas`} seeAllLabel={tc("actions.seeAll")}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {fromChef.map((recipe) => (
              <li key={recipe.id}>
                <RecipeCard recipe={recipe} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {alike.length > 0 ? (
        <Section id="similar-recipes" title={t("similar")} href="/explore?tab=receitas" seeAllLabel={tc("actions.seeAll")}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {alike.map((recipe) => (
              <li key={recipe.id}>
                <RecipeCard recipe={recipe} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
