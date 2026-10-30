"use client";

import { ArrowUpRight, PackageSearch } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet } from "@/components/ui";
import { buyHref, formatBrandPrice, OUTBOUND_REL, type RecommendedProductView } from "@/lib/brands";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { ProductCard, ProductImage } from "./ProductCard";
import { trackBrandClick } from "./track";

type Props = {
  products: readonly RecommendedProductView[];
  /** Título visível (página do conteúdo); dentro do card do programa o título já está na tela. */
  title?: string;
  description: string;
  className?: string;
};

// "Equipamentos e produtos recomendados": cards horizontais (foto, nome, marca, preço quando há) com
// Detalhes (folha com o card do produto) e Comprar (site da marca, fora do app).
export function RecommendedProducts({ products, title, description, className }: Props) {
  const t = useTranslations("brands");
  const locale = useLocale();
  const [open, setOpen] = useState<RecommendedProductView | null>(null);
  if (products.length === 0) return null;

  return (
    <section aria-label={title ? undefined : t("recommended.title")} aria-labelledby={title ? "brand-recommended-title" : undefined} className={cn("flex flex-col gap-3", className)} data-testid="brand-recommended">
      {title ? (
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,#14b8a6_45%,transparent)] bg-surface-elevated text-[color-mix(in_oklab,#14b8a6_60%,var(--color-fg))]">
            <PackageSearch className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 id="brand-recommended-title" className="type-h3 text-fg">
              {title}
            </h2>
            <p className="type-body-sm text-fg-muted">{description}</p>
          </div>
        </div>
      ) : (
        <p className="type-body-sm text-fg-muted">{description}</p>
      )}

      <ul className="uh-brand-strip flex snap-x gap-3 overflow-x-auto pb-1">
        {products.map((product) => {
          const price = formatBrandPrice(product.price_cents, product.currency, locale);
          const href = buyHref(product, product.brand);
          return (
            <li key={product.id} className="w-[min(220px,70vw)] shrink-0 snap-start" data-testid="brand-recommended-item">
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
                <button type="button" onClick={() => setOpen(product)} className="group block text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus" aria-label={`${t("recommended.view")}: ${product.name}`}>
                  <ProductImage product={product} className="aspect-[4/3] w-full rounded-none border-0 border-b border-border" />
                </button>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="flex items-center gap-2">
                    <BrandLogo name={product.brand.name} logoUrl={product.brand.logo_url} className="h-5 max-w-[80px]" />
                    {product.brand.is_demo ? <span className="text-[10px] uppercase tracking-[0.12em] text-fg-subtle">{t("example")}</span> : null}
                  </div>
                  <h3 className="text-sm font-semibold leading-snug text-fg">{product.name}</h3>
                  {product.note ? <p className="type-caption line-clamp-2 text-fg-muted">{product.note}</p> : null}
                  {price ? <p className="text-sm font-semibold text-fg type-numeric">{price}</p> : null}
                  <div className="mt-auto flex gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setOpen(product)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border-strong px-2 text-sm font-medium text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {t("recommended.view")}
                    </button>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel={OUTBOUND_REL}
                        onClick={() => trackBrandClick({ kind: "product", id: product.id, source: "recommended" })}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        data-testid="brand-recommended-buy"
                      >
                        {t("recommended.buy")}
                        <ArrowUpRight aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">
                          {product.name} ({t("card.newTab")})
                        </span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <Sheet open={Boolean(open)} onOpenChange={(value) => (value ? null : setOpen(null))} title={open?.name ?? ""} hideTitle>
        {open ? <ProductCard product={open} source="card" className="pb-4" /> : null}
      </Sheet>
    </section>
  );
}
