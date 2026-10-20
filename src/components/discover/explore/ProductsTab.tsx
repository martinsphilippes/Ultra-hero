import { ArrowRight, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ProductCard } from "@/components/catalog";
import { Button, DemoBadge, EmptyState } from "@/components/ui";
import { PRODUCT_CARD_SELECT, type ProductCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { CARD_GRID_4 } from "../grid";
import { InlineError } from "../InlineError";

// Vitrine de até 8 produtos compráveis (demonstração): publicados, sem moderação e disponíveis.
export async function ProductsTab() {
  const [supabase, t, td] = await Promise.all([createClient(), getTranslations("discover.explore.products"), getTranslations("common.demo")]);
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("status", "published")
    .eq("moderation_status", "clear")
    .eq("availability", "available")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(8);
  const products = (data ?? []) as unknown as ProductCardData[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="type-h3 text-fg">{t("title")}</h2>
          <DemoBadge />
        </div>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>

      {error ? (
        <InlineError />
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<ShoppingBag />} title={t("emptyTitle")} description={t("emptyDescription")} />
        </div>
      ) : (
        <div className={CARD_GRID_4}>
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index === 0} />
          ))}
        </div>
      )}

      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="type-body-sm text-fg">{td("banner")}</p>
        <Button asChild variant="secondary" trailingIcon={<ArrowRight />}>
          <Link href="/shop">{t("goToShop")}</Link>
        </Button>
      </div>
    </div>
  );
}
