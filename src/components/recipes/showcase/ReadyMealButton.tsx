"use client";

import { LogIn, ShoppingBag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCart } from "@/app/(app)/shop/actions";
import { splitErrorString } from "@/components/commerce/lib/errors";
import { Button, VisuallyHidden, buttonBase, buttonSizes, buttonVariants, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { RecipeActionTrack } from "@/lib/recipes/showcase";
import { cn } from "@/lib/utils";
import { fireRecipeAction } from "./track-action";

/** Botão compacto do card (alvo de toque de 44 px). */
export const CARD_ACTION = "h-11 min-h-11 w-full gap-1.5 px-2 text-xs rounded-(--uh-btn-radius-sm)";

export type ReadyMealProduct = { id: string; slug: string; title: string; price_cents_demo: number; maxQuantity: number };

type Props = {
  product: ReadyMealProduct;
  isLoggedIn: boolean;
  /** Quantidade já no carrinho de teste. */
  inCart: number;
  /** Para onde voltar depois do login. */
  nextPath: string;
  track: RecipeActionTrack | null;
  /** "card": botão compacto do card da vitrine; "page": botão com produto e preço (página da receita). */
  variant: "card" | "page";
};

// "Comprar pronto" (0051): 1 unidade do produto ligado à receita (ex.: marmita) no carrinho de TESTE,
// pelas mesmas regras da loja (addToCart: logado, comprável, limite min(20, estoque demo), kill switch).
// Visitante vê "Entrar para comprar". O toque conta no indicador da vitrine (sem dados da pessoa).
export function ReadyMealButton({ product, isLoggedIn, inCart, nextPath, track, variant }: Props) {
  const t = useTranslations("recipes.showcase.ready");
  const tq = useTranslations("commerce.quickAdd");
  const te = useTranslations("commerce.errors");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const router = useRouter();
  const [current, setCurrent] = useState(inCart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const price = formatCurrency(product.price_cents_demo / 100, locale);
  const card = variant === "card";
  const limitReached = current >= Math.min(20, product.maxQuantity);

  if (!isLoggedIn) {
    return (
      <div className={cn("flex flex-col gap-1", card && "w-full")}>
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          onClick={() => fireRecipeAction(track, "comprar_pronto")}
          className={cn(buttonBase, buttonVariants.secondary, card ? CARD_ACTION : buttonSizes.md)}
          data-testid="recipe-ready-login"
        >
          <LogIn className="size-4" aria-hidden="true" />
          {t("login")}
          <VisuallyHidden> ({product.title})</VisuallyHidden>
        </Link>
        {card ? null : <p className="type-caption text-fg-muted">{t("detail", { product: product.title, price })}</p>}
      </div>
    );
  }

  function submit() {
    fireRecipeAction(track, "comprar_pronto");
    setError(null);
    startTransition(async () => {
      const result = await addToCart({ productId: product.id, quantity: 1, priceCents: product.price_cents_demo, source: "content_link" });
      if (result.ok) {
        setCurrent(result.quantity);
        toast({
          title: tq("added"),
          description: (
            <span className="flex flex-col gap-1">
              <span>{tq("addedDescription", { title: product.title, n: result.quantity })}</span>
              <Link href="/cart" className="font-semibold text-accent-text underline-offset-4 hover:underline">
                {tq("viewCart")}
              </Link>
            </span>
          ),
          variant: "success",
        });
        router.refresh();
      } else {
        const { code } = splitErrorString(result.error);
        setError(te.has(code) ? te(code) : te("generic"));
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", card && "w-full")}>
      <Button
        type="button"
        variant={card ? "secondary" : "primary"}
        size={card ? "sm" : "md"}
        leadingIcon={<ShoppingBag />}
        onClick={submit}
        loading={pending}
        disabled={limitReached}
        className={card ? CARD_ACTION : undefined}
        data-testid="recipe-ready-buy"
      >
        {t("button")}
        <VisuallyHidden> ({product.title})</VisuallyHidden>
      </Button>
      <div aria-live="polite" className="flex flex-col gap-0.5">
        {card ? null : <p className="type-caption text-fg-muted" data-testid="recipe-ready-detail">{t("detail", { product: product.title, price })}</p>}
        {limitReached ? <p className="type-caption text-fg-muted">{tq("limitReached")}</p> : null}
        {current > 0 && !card ? (
          <p className="type-caption text-fg-muted">
            {tq("inCart", { n: current })} ·{" "}
            <Link href="/cart" className="font-semibold text-accent-text underline-offset-4 hover:underline">
              {tq("viewCart")}
            </Link>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="type-caption font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
