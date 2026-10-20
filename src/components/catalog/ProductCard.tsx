import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, CardImage, DemoBadge } from "@/components/ui";
import { formatCurrency } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { localizedLabel, type ProductCardData } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

type Props = { product: ProductCardData; priority?: boolean; className?: string };

// Card de produto demonstrativo: preço ilustrativo, sempre marcado como demonstração.
// Sem aria-label no link: o nome acessível é o texto visível (WCAG 2.5.3). Indisponível é sinalizado
// pelo badge, não por opacidade (que derrubava o contraste do texto abaixo de 4,5:1).
export async function ProductCard({ product, priority, className }: Props) {
  const [t, locale] = await Promise.all([getTranslations("catalog"), getLocale()]);
  const unavailable = product.availability !== "available";
  return (
    <Card interactive asChild className={cn("h-full", className)}>
      <Link href={`/shop/${product.slug}`}>
        <CardImage
          src={product.image_url}
          alt=""
          ratio="square"
          priority={priority}
          overlay={
            <div className="flex items-start justify-between gap-2">
              {product.category ? <Badge variant="neutral" size="sm" className="bg-black/40 text-white border-white/30">{localizedLabel(product.category.name, locale)}</Badge> : <span />}
              {unavailable ? <Badge variant="warning" size="sm">{t("productUnavailable")}</Badge> : <DemoBadge size="sm" />}
            </div>
          }
        />
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="type-h3 line-clamp-2 text-fg">{product.title}</h3>
          {product.seller ? <p className="text-sm text-fg-muted">{product.seller.name}</p> : null}
          <p className="mt-auto pt-2">
            <span className="type-numeric text-lg font-bold text-fg">{formatCurrency(product.price_cents_demo / 100, locale as Locale)}</span>
            <span className="ml-2 text-xs text-fg-muted">{t("priceDemo")}</span>
          </p>
        </div>
      </Link>
    </Card>
  );
}
