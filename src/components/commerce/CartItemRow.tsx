"use client";

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCartQuantity } from "@/app/(app)/cart/actions";
import { splitErrorString } from "@/components/commerce/lib/errors";
import { IconButton, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { QuantityStepper } from "./QuantityStepper";

type Props = {
  productId: string;
  quantity: number;
  product: { slug: string; title: string; image_url: string; price_cents_demo: number; demo_stock: number | null } | null;
  /** Título vindo do cart_validate quando o produto não é mais visível. */
  fallbackTitle?: string;
  hasIssue?: boolean;
};

// Linha do carrinho: imagem, título, preço ilustrativo, stepper e remover. Estado otimista leve.
export function CartItemRow({ productId, quantity, product, fallbackTitle, hasIssue }: Props) {
  const t = useTranslations("commerce.cart");
  const tp = useTranslations("commerce.demo");
  const te = useTranslations("commerce.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [qty, setQty] = useState(quantity);
  const [pending, startTransition] = useTransition();
  const title = product?.title ?? fallbackTitle ?? t("unknownProduct");
  const max = Math.min(20, product?.demo_stock ?? 20);

  function change(next: number) {
    const previous = qty;
    setQty(next);
    startTransition(async () => {
      const result = await setCartQuantity({ productId, quantity: next });
      if (result.ok) {
        toast({ title: next === 0 ? t("removed") : t("updated"), variant: "success", duration: 2500 });
        router.refresh();
      } else {
        setQty(previous);
        const { code } = splitErrorString(result.error);
        toast({ title: te.has(code) ? te(code) : te("generic"), variant: "error" });
      }
    });
  }

  return (
    <li className={`flex gap-3 py-4 ${hasIssue ? "opacity-80" : ""}`} aria-busy={pending || undefined}>
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-elevated">
        {product ? <Image src={product.image_url} alt="" fill sizes="80px" unoptimized={product.image_url.endsWith(".svg")} className="object-cover" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {product ? (
              <Link href={`/shop/${product.slug}`} className="line-clamp-2 font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                {title}
              </Link>
            ) : (
              <p className="line-clamp-2 font-semibold text-fg">{title}</p>
            )}
            {product ? (
              <p className="type-caption text-fg-muted">
                <span className="type-numeric">{formatCurrency(product.price_cents_demo / 100, locale)}</span> · {tp("priceDemo")}
              </p>
            ) : null}
          </div>
          <IconButton label={t("removeItem", { title })} icon={<Trash2 />} size="sm" variant="ghost" onClick={() => change(0)} disabled={pending} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <QuantityStepper value={qty} onChange={change} min={1} max={Math.max(1, max)} label={t("qtyLabel", { title })} size="sm" disabled={pending || !product} />
          {product ? <p className="type-numeric font-semibold text-fg">{formatCurrency((product.price_cents_demo * qty) / 100, locale)}</p> : null}
        </div>
      </div>
    </li>
  );
}
