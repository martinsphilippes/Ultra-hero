import "server-only";
import { getUser } from "@/lib/auth/session";
import { hubHref } from "@/lib/catalog/creator-hub";
import type { RecipeCardData } from "@/lib/recipes/card";
import { cardActionVisibility, type ShowcasePerson } from "@/lib/recipes/showcase";
import { fetchReadyProducts, fetchShowcaseCommerce, type ReadyProduct, type ShowcaseCommerce } from "@/lib/recipes/showcase-queries";
import { createClient } from "@/lib/supabase/server";
import { RecipeCard } from "../catalog/RecipeCard";
import { RecipeCardActions } from "./RecipeCardActions";

// Cards da Alimentação do herói (0051): assinatura com o herói da vitrine e as ações (Fazer, Lista de
// compras, Comprar pronto). Usado na primeira página (servidor) e no "carregar mais" (action).

export type ShowcaseHeroRef = ShowcasePerson & { id: string };

export type ShowcaseCardContext = { ready: Map<string, ReadyProduct>; commerce: ShowcaseCommerce };

/** Produtos prontos das receitas e o estado do carrinho de teste, numa leitura só por página. */
export async function loadShowcaseCardContext(ids: readonly string[]): Promise<ShowcaseCardContext> {
  const [supabase, user] = await Promise.all([createClient(), getUser()]);
  const ready = await fetchReadyProducts(supabase, ids);
  const commerce = await fetchShowcaseCommerce(supabase, user?.id ?? null, [...ready.values()].map((p) => p.id));
  return { ready, commerce };
}

export function ShowcaseRecipeCard({ recipe, hero, ctx, priority }: { recipe: RecipeCardData; hero: ShowcaseHeroRef; ctx: ShowcaseCardContext; priority?: boolean }) {
  const product = ctx.ready.get(recipe.id) ?? null;
  const visible = cardActionVisibility({ readyProduct: product, commerceEnabled: ctx.commerce.commerceEnabled });
  return (
    <RecipeCard
      recipe={recipe}
      showcaseHero={hero}
      priority={priority}
      actions={
        <RecipeCardActions
          slug={recipe.slug}
          title={recipe.title}
          heroSlug={hero.slug}
          track={{ creatorId: hero.id, contentId: recipe.id, source: "alimentacao" }}
          ready={
            visible.comprarPronto && product
              ? {
                  product: { id: product.id, slug: product.slug, title: product.title, price_cents_demo: product.price_cents_demo, maxQuantity: product.maxQuantity },
                  isLoggedIn: ctx.commerce.isLoggedIn,
                  inCart: ctx.commerce.inCart.get(product.id) ?? 0,
                  nextPath: hubHref(hero.slug, "alimentacao"),
                }
              : null
          }
        />
      }
    />
  );
}

/** "Carregar mais" da Alimentação: cards já com as ações. */
export async function renderShowcaseRecipeCards(items: RecipeCardData[], hero: ShowcaseHeroRef) {
  const ctx = await loadShowcaseCardContext(items.map((item) => item.id));
  return (
    <>
      {items.map((item) => (
        <li key={item.id}>
          <ShowcaseRecipeCard recipe={item} hero={hero} ctx={ctx} />
        </li>
      ))}
    </>
  );
}
