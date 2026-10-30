import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/catalog";
import { DemoBadge, Section } from "@/components/ui";
import { PRODUCT_CARD_SELECT, type ProductCardData } from "@/lib/catalog/queries";
import { relatedProductsToShow } from "@/lib/catalog/related-products";
import { createClient } from "@/lib/supabase/server";
import { ProductInterestTracker } from "./ProductInterestTracker";

// Produtos vinculados ao conteúdo (vínculo validado). Por padrão só o comprável segundo
// product_is_purchasable; nas receitas (showUnavailable) o indisponível aparece marcado em vez de sumir.
export async function RelatedProducts({ contentId, showUnavailable = false }: { contentId: string; showUnavailable?: boolean }) {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("content_product_links")
    .select(`id, product:products(${PRODUCT_CARD_SELECT})`)
    .eq("content_id", contentId)
    .eq("status", "validated")
    .limit(6);
  const candidates = (links ?? [])
    .map((l) => (Array.isArray(l.product) ? l.product[0] : l.product) as unknown as ProductCardData | null)
    .filter((p): p is ProductCardData => Boolean(p));
  if (candidates.length === 0) return null;

  // Mesma regra do checkout para o que pode ir ao carrinho na demonstração.
  const purchasable = await Promise.all(candidates.map(async (p) => Boolean((await supabase.rpc("product_is_purchasable", { p_product: p.id })).data)));
  const products = relatedProductsToShow(candidates, purchasable, showUnavailable);
  if (products.length === 0) return null;

  const t = await getTranslations("consume.content");
  return (
    <Section className="native:hidden" id="related-products" title={t("relatedProducts")} description={t("relatedProductsNote")} action={<DemoBadge />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="related-products">
        {products.map(({ product, unavailable }) => (
          <ProductInterestTracker key={product.id} productId={product.id} contentId={contentId}>
            <ProductCard product={product} unavailable={unavailable} />
          </ProductInterestTracker>
        ))}
      </div>
    </Section>
  );
}
