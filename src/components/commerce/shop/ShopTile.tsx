import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ShopTileData } from "@/lib/shop/queries";

type Props = {
  product: ShopTileData;
  priority?: boolean;
  /** Lote da rolagem infinita (foco no primeiro quadro novo). */
  batch?: number;
};

// Quadro da aba Comprar (3 por linha no celular): foto quadrada, nome em até 2 linhas e preço.
// O nome acessível do link é o texto visível (WCAG 2.5.3); indisponível ganha um selo sobre a foto.
export async function ShopTile({ product, priority, batch }: Props) {
  const [t, locale] = await Promise.all([getTranslations("catalog"), getLocale()]);
  const unavailable = product.availability !== "available" || (product.demo_stock !== null && product.demo_stock <= 0);
  return (
    <li data-batch={batch} data-testid="shop-tile" className="min-w-0">
      <Link href={`/shop/${product.slug}`} className="group flex h-full flex-col gap-1 focus-visible:outline-none">
        <span className="relative block aspect-square overflow-hidden bg-surface-elevated">
          <Image
            src={product.image_url}
            alt=""
            fill
            priority={priority}
            unoptimized={product.image_url.endsWith(".svg")}
            sizes="(min-width: 768px) 12rem, 33vw"
            className="object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.04] motion-reduce:transition-none"
          />
          {unavailable ? (
            <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[0.625rem] font-semibold leading-tight text-white">
              {t("productUnavailable")}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            data-focus-ring=""
            className="pointer-events-none absolute inset-0 opacity-0 ring-[3px] ring-inset ring-focus group-focus-visible:opacity-100"
          />
        </span>
        <span className="flex flex-col gap-0.5 px-1.5 pb-1 md:px-0">
          <span className="line-clamp-2 text-xs leading-snug text-fg group-hover:underline">{product.title}</span>
          <span className="type-numeric text-sm font-bold text-fg">{formatCurrency(product.price_cents_demo / 100, locale as Locale)}</span>
        </span>
      </Link>
    </li>
  );
}
