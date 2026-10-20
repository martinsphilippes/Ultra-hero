"use client";

import { LogIn, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCart } from "@/app/(app)/shop/actions";
import { splitErrorString } from "@/components/commerce/lib/errors";
import { Button, useToast } from "@/components/ui";
import { QuantityStepper } from "./QuantityStepper";

type Props = {
  productId: string;
  priceCents: number;
  /** Máximo permitido agora (20 ou o estoque demo, o que for menor). */
  maxQuantity: number;
  purchasable: boolean;
  isLoggedIn: boolean;
  /** Quantidade já no carrinho (0 se nenhuma). */
  inCart: number;
  nextPath: string;
};

// Seletor de quantidade + "Adicionar ao carrinho de teste". Visitante vê CTA de login.
export function AddToCartForm({ productId, priceCents, maxQuantity, purchasable, isLoggedIn, inCart, nextPath }: Props) {
  const t = useTranslations("commerce.product");
  const te = useTranslations("commerce.errors");
  const { toast } = useToast();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [current, setCurrent] = useState(inCart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
        <div>
          <p className="font-semibold text-fg">{t("loginTitle")}</p>
          <p className="type-body-sm text-fg-muted">{t("loginDescription")}</p>
        </div>
        <Button asChild leadingIcon={<LogIn />} size="lg">
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>{t("loginCta")}</Link>
        </Button>
      </div>
    );
  }

  if (!purchasable || maxQuantity < 1) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-4" role="status">
        <p className="font-semibold text-fg">{t("unavailableTitle")}</p>
        <p className="type-body-sm text-fg-muted">{t("unavailableDescription")}</p>
      </div>
    );
  }

  const max = Math.min(20, maxQuantity);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addToCart({ productId, quantity, priceCents });
      if (result.ok) {
        setCurrent(result.quantity);
        toast({
          title: t("added"),
          description: (
            <span className="flex flex-col gap-1">
              <span>{t("addedDescription", { n: result.quantity })}</span>
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={max} label={t("qtyLabel")} disabled={pending} />
        <Button type="button" size="lg" leadingIcon={<ShoppingBag />} onClick={submit} loading={pending} className="flex-1 sm:flex-none">
          {t("addToCart")}
        </Button>
      </div>
      <div aria-live="polite" className="flex flex-col gap-1">
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
