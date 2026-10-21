import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { OfficialStoreLink } from "@/components/commerce/OfficialStoreLink";
import { QuickAddToCart } from "@/components/commerce/QuickAddToCart";
import { ProductInterestTracker } from "@/components/content/ProductInterestTracker";
import { Badge, Card, CardImage, DemoBadge } from "@/components/ui";
import { formatCurrency } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { CreatorProductContent } from "@/lib/catalog/creator-products";
import { localizedLabel, type ProductCardData } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

type Props = {
  product: ProductCardData;
  /** Conteúdos em que o produto é usado (já ordenados). */
  usedIn: CreatorProductContent[];
  purchasable: boolean;
  /** Máximo permitido agora (20 ou o estoque demo, o que for menor). */
  maxQuantity: number;
  isLoggedIn: boolean;
  /** Quantidade já no carrinho de teste. */
  inCart: number;
  /** Para onde voltar depois do login. */
  nextPath: string;
  /** Conteúdo de origem: ao abrir o produto registra interesse (product_interest, content_link). */
  interestContentId?: string;
  priority?: boolean;
  className?: string;
};

const USED_IN_VISIBLE = 2;

// Card de produto com ação: o link para /shop/<slug> envolve só imagem, título, fornecedor e preço;
// "Usado em" e "Adicionar ao carrinho de teste" são controles irmãos (nada interativo aninhado).
// O registro de interesse envolve só o link do produto: adicionar ao carrinho já registra o seu
// (addToCart) e os links de conteúdo/carrinho não são interesse no produto.
export async function ProductActionCard({ product, usedIn, purchasable, maxQuantity, isLoggedIn, inCart, nextPath, interestContentId, priority, className }: Props) {
  const [t, tq, locale] = await Promise.all([getTranslations("catalog"), getTranslations("commerce.quickAdd"), getLocale()]);
  const unavailable = !purchasable || product.availability !== "available";
  const visible = usedIn.slice(0, USED_IN_VISIBLE);
  const hidden = usedIn.length - visible.length;

  const link = (
    <Link
      href={`/shop/${product.slug}`}
      className="group/link flex flex-col rounded-t-xl focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
    >
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
      <div className="flex flex-col gap-1 p-4 pb-2">
        <h3 className="type-h3 line-clamp-2 text-fg group-hover/link:underline group-hover/link:underline-offset-4">{product.title}</h3>
        {product.seller ? <p className="text-sm text-fg-muted">{product.seller.name}</p> : null}
        <p className="pt-1">
          <span className="type-numeric text-lg font-bold text-fg">{formatCurrency(product.price_cents_demo / 100, locale as Locale)}</span>
          <span className="ml-2 text-xs text-fg-muted">{t("priceDemo")}</span>
        </p>
      </div>
    </Link>
  );

  return (
    <Card data-testid="product-action-card" className={cn("h-full", className)}>
      {interestContentId ? (
        <ProductInterestTracker productId={product.id} contentId={interestContentId}>
          {link}
        </ProductInterestTracker>
      ) : (
        link
      )}

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        {visible.length > 0 ? (
          <p className="type-caption text-fg-muted">
            <span className="font-semibold text-fg">{tq("usedIn")}</span>{" "}
            {visible.map((content, index) => (
              <span key={content.id}>
                {index > 0 ? ", " : null}
                <Link
                  href={`/content/${content.slug}`}
                  className="inline-flex min-h-6 items-center font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {content.title}
                </Link>
              </span>
            ))}
            {hidden > 0 ? <span> {tq("moreContents", { count: hidden })}</span> : null}
          </p>
        ) : null}
        {/* Loja oficial (quando a marca tem uma): controle irmão, fora do link do produto. */}
        <OfficialStoreLink attributes={product.attributes} className="-my-2 w-fit" />
        <div className="mt-auto">
          <QuickAddToCart
            productId={product.id}
            productTitle={product.title}
            priceCents={product.price_cents_demo}
            maxQuantity={maxQuantity}
            purchasable={purchasable}
            isLoggedIn={isLoggedIn}
            inCart={inCart}
            nextPath={nextPath}
          />
        </div>
      </div>
    </Card>
  );
}
