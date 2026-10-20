"use client";

import { LogIn, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addToCart } from "@/app/(app)/shop/actions";
import { splitErrorString } from "@/components/commerce/lib/errors";
import { Button, VisuallyHidden, useToast } from "@/components/ui";

type Props = {
  productId: string;
  /** Nome do produto: compõe o nome acessível do botão (vários cards na mesma página). */
  productTitle: string;
  priceCents: number;
  /** Máximo permitido agora (20 ou o estoque demo, o que for menor). */
  maxQuantity: number;
  purchasable: boolean;
  isLoggedIn: boolean;
  /** Quantidade já no carrinho (0 se nenhuma). */
  inCart: number;
  /** Para onde voltar depois do login (aba de produtos da personalidade). */
  nextPath: string;
};

// Botão único "Adicionar ao carrinho de teste" (1 unidade por clique) para cards fora da loja.
// Mesmas regras do AddToCartForm: só logado, só comprável, limite min(20, estoque demo).
export function QuickAddToCart({ productId, productTitle, priceCents, maxQuantity, purchasable, isLoggedIn, inCart, nextPath }: Props) {
  const t = useTranslations("commerce.quickAdd");
  const te = useTranslations("commerce.errors");
  const { toast } = useToast();
  const router = useRouter();
  const statusId = useId();
  const [current, setCurrent] = useState(inCart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button asChild variant="secondary" leadingIcon={<LogIn />} block>
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
            {t("loginCta")}
            <VisuallyHidden> ({productTitle})</VisuallyHidden>
          </Link>
        </Button>
        <p className="type-caption text-fg-muted">{t("loginHint")}</p>
      </div>
    );
  }

  const max = Math.min(20, maxQuantity);
  const blocked = !purchasable || max < 1;
  const limitReached = !blocked && current >= max;
  const reason = blocked ? t("unavailable") : limitReached ? t("limitReached") : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addToCart({ productId, quantity: 1, priceCents });
      if (result.ok) {
        setCurrent(result.quantity);
        toast({
          title: t("added"),
          description: (
            <span className="flex flex-col gap-1">
              <span>{t("addedDescription", { title: productTitle, n: result.quantity })}</span>
              <Link href="/cart" className="font-semibold text-accent-text underline-offset-4 hover:underline">
                {t("viewCart")}
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
    <div className="flex flex-col gap-1.5">
      <Button type="button" leadingIcon={<ShoppingBag />} onClick={submit} loading={pending} disabled={blocked || limitReached} aria-describedby={reason ? statusId : undefined} block>
        {t("addToCart")}
        <VisuallyHidden> ({productTitle})</VisuallyHidden>
      </Button>
      <div aria-live="polite" className="flex flex-col gap-0.5">
        {reason ? (
          <p id={statusId} className="type-caption text-fg-muted">
            {reason}
          </p>
        ) : null}
        {current > 0 ? (
          <p className="type-caption text-fg-muted">
            {t("inCart", { n: current })} ·{" "}
            <Link href="/cart" className="font-semibold text-accent-text underline-offset-4 hover:underline">
              {t("viewCart")}
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
