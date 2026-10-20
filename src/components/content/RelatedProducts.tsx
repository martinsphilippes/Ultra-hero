import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/catalog";
import { DemoBadge, Section } from "@/components/ui";
import { PRODUCT_CARD_SELECT, type ProductCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { ProductInterestTracker } from "./ProductInterestTracker";

// Produtos vinculados ao conteúdo (vínculo validado + produto comprável segundo product_is_purchasable).
export async function RelatedProducts({ contentId }: { contentId: string }) {
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

  // Mesma regra do checkout: só mostra o que poderia ser "comprado" na demonstração.
  const purchasable = await Promise.all(
    candidates.map(async (p) => {
      const { data } = await supabase.rpc("product_is_purchasable", { p_product: p.id });
      return data ? p : null;
    }),
  );
  const products = purchasable.filter((p): p is ProductCardData => Boolean(p));
  if (products.length === 0) return null;

  const t = await getTranslations("consume.content");
  return (
    <Section id="related-products" title={t("relatedProducts")} description={t("relatedProductsNote")} action={<DemoBadge />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductInterestTracker key={product.id} productId={product.id} contentId={contentId}>
            <ProductCard product={product} />
          </ProductInterestTracker>
        ))}
      </div>
    </Section>
  );
}
