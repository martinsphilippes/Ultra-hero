"use client";

import { ArrowLeft, ArrowUpRight, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui";
import { buyHref, displayHost, formatBrandPrice, OUTBOUND_REL, type BrandProductView, type ClickSource } from "@/lib/brands";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { trackBrandClick } from "./track";

type Props = {
  product: BrandProductView;
  /** De onde veio o clique (contador agregado). */
  source: ClickSource;
  /** Versão compacta (popover sobre a foto no computador). */
  compact?: boolean;
  className?: string;
};

/** Foto do produto (ou o logo da marca num fundo neutro quando não há foto). */
export function ProductImage({ product, className }: { product: BrandProductView; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-elevated", className)}>
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image_url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <BrandLogo name={product.brand.name} logoUrl={product.brand.logo_url} className="h-8" />
      )}
    </div>
  );
}

// Card do produto marcado: foto (opcional), nome, marca, descrição curta, preço (só se o admin
// informou, com a nota de que o site da marca manda) e os dois botões: VER PRODUTO (detalhes aqui
// mesmo) e COMPRAR NO SITE DA MARCA (link externo do produto; sem ele, o site da marca).
export function ProductCard({ product, source, compact = false, className }: Props) {
  const t = useTranslations("brands");
  const locale = useLocale();
  const [details, setDetails] = useState(false);
  const price = formatBrandPrice(product.price_cents, product.currency, locale);
  const href = buyHref(product, product.brand);
  const host = displayHost(href);

  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="brand-product-card" data-product={product.id}>
      <div className={cn("flex gap-3", details ? "flex-col" : "items-start")}>
        <ProductImage product={product} className={details ? "aspect-square w-full" : compact ? "size-16 shrink-0" : "size-20 shrink-0"} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrandLogo name={product.brand.name} logoUrl={product.brand.logo_url} className="h-5 max-w-[84px]" />
            {product.brand.is_demo ? <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-subtle">{t("example")}</span> : null}
          </div>
          <p className="text-base font-semibold leading-snug text-fg">{product.name}</p>
          <p className="sr-only">{t("card.by", { brand: product.brand.name })}</p>
          {price ? <p className="text-sm font-semibold text-fg type-numeric">{price}</p> : null}
        </div>
      </div>

      {product.description ? <p className={cn("type-body-sm text-fg-muted", !details && "line-clamp-2")}>{product.description}</p> : null}

      <p className="flex items-start gap-1.5 type-caption text-fg-subtle">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{price ? t("card.priceNote") : t("card.noPrice")}</span>
      </p>

      {details ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated p-3">
          {host ? <p className="type-caption text-fg-muted">{t("card.leaving", { host })}</p> : null}
          <a
            href={product.brand.site_url}
            target="_blank"
            rel={OUTBOUND_REL}
            onClick={() => trackBrandClick({ kind: "brand", id: product.brand.id, source: "card" })}
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {t("card.brandSite")} · {product.brand.name}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
            <span className="sr-only">({t("card.newTab")})</span>
          </a>
        </div>
      ) : null}

      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        <Button
          type="button"
          variant="secondary"
          size={compact ? "sm" : "md"}
          leadingIcon={details ? <ArrowLeft /> : undefined}
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
          data-testid="brand-product-view"
        >
          {details ? t("card.back") : t("card.viewProduct")}
        </Button>
        {href ? (
          <Button asChild variant="primary" size={compact ? "sm" : "md"} trailingIcon={<ArrowUpRight />}>
            <a href={href} target="_blank" rel={OUTBOUND_REL} onClick={() => trackBrandClick({ kind: "product", id: product.id, source })} data-testid="brand-product-buy">
              {t("card.buy")}
              <span className="sr-only">({t("card.newTab")})</span>
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
