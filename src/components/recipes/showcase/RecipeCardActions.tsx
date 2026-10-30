"use client";

import { CookingPot, ListPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { buttonBase, buttonVariants } from "@/components/ui";
import { cookModeHref } from "@/lib/recipes/cook-mode";
import { showcaseRecipeHref, type RecipeActionTrack } from "@/lib/recipes/showcase";
import { cn } from "@/lib/utils";
import { CARD_ACTION, ReadyMealButton, type ReadyMealProduct } from "./ReadyMealButton";
import { fireRecipeAction } from "./track-action";

type Props = {
  slug: string;
  title: string;
  heroSlug: string;
  track: RecipeActionTrack;
  ready: { product: ReadyMealProduct; isLoggedIn: boolean; inCart: number; nextPath: string } | null;
};

// Ações do card na Alimentação do herói (0051): Fazer (Modo Cozinha), Lista de compras (abre a
// receita no botão da lista) e, com produto ligado, Comprar pronto. A cozinha e a receita pedem a
// etapa demonstrativa sozinhas. Cada toque conta no indicador da vitrine (sem dados da pessoa).
export function RecipeCardActions({ slug, title, heroSlug, track, ready }: Props) {
  const t = useTranslations("recipes.showcase.actions");
  return (
    <div className="flex flex-col gap-1.5 pt-1" data-testid="recipe-card-actions">
      <div className="grid grid-cols-2 gap-1.5">
        <Link
          href={cookModeHref(slug, null)}
          prefetch={false}
          onClick={() => fireRecipeAction(track, "fazer")}
          className={cn(buttonBase, buttonVariants.primary, CARD_ACTION)}
          aria-label={t("makeLabel", { title })}
          data-testid="recipe-card-make"
        >
          <CookingPot className="size-4" aria-hidden="true" />
          {t("make")}
        </Link>
        <Link
          href={showcaseRecipeHref(slug, heroSlug, "lista-de-compras")}
          onClick={() => fireRecipeAction(track, "lista_compras")}
          className={cn(buttonBase, buttonVariants.secondary, CARD_ACTION)}
          aria-label={t("listLabel", { title })}
          data-testid="recipe-card-list"
        >
          <ListPlus className="size-4" aria-hidden="true" />
          {t("list")}
        </Link>
      </div>
      {ready ? <ReadyMealButton product={ready.product} isLoggedIn={ready.isLoggedIn} inCart={ready.inCart} nextPath={ready.nextPath} track={track} variant="card" /> : null}
    </div>
  );
}
