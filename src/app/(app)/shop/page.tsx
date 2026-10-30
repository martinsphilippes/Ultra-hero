import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { PackageSearch, ReceiptText, ShoppingBag } from "lucide-react";
import { ShopSegment } from "@/components/collectibles/ShopSegment";
import { ShopGrid } from "@/components/commerce/shop/ShopGrid";
import { ShopTile } from "@/components/commerce/shop/ShopTile";
import { ChipLink } from "@/components/discover/ChipLink";
import { Button, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import { getUser } from "@/lib/auth/session";
import { localizedLabel } from "@/lib/catalog/queries";
import { SHOP_FILTER_PARAM, shopHref } from "@/lib/shop/filters";
import { loadShopView } from "@/lib/shop/queries";
import { createClient } from "@/lib/supabase/server";

// Aba Comprar (estilo vitrine de marketplace): chips de filtro no topo ("Tudo" + os do admin, 0047)
// e grade de produtos, 3 por linha no celular, com rolagem infinita. O filtro vive na URL
// (?filtro=slug), com navegação de documento (o roteador do Next abortava a troca só de query na
// mesma rota). Sem a 0047 no banco, só "Tudo" aparece. Compras continuam simuladas.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commerce.shop");
  return { title: t("title"), description: t("description") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [t, tc, locale, user, supabase] = await Promise.all([getTranslations("commerce.shop"), getTranslations("collectibles.segment"), getLocale(), getUser(), createClient()]);
  const view = await loadShopView(supabase, params[SHOP_FILTER_PARAM], 0);
  const selectedSlug = view.selected?.slug ?? null;
  const selectedName = view.selected ? localizedLabel(view.selected.name, locale) : t("all");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={<DemoBadge />}
        actions={
          user ? (
            <>
              {/* Minhas compras (pedidos + lances e arremates, 0057) */}
              <Button asChild variant="secondary" size="sm" leadingIcon={<ReceiptText />} data-testid="my-purchases-link">
                <Link href="/shop/compras">{tc("purchases")}</Link>
              </Button>
              <Button asChild variant="secondary" size="sm" leadingIcon={<ShoppingBag />}>
                <Link href="/cart">{t("cartLink")}</Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Loja | Colecionáveis (some sem a 0057) */}
      <ShopSegment current="shop" />

      {/* Cabeçalho de filtros fixo sob a barra superior; rola na horizontal no celular */}
      <div
        role="group"
        aria-label={t("filtersLabel")}
        data-testid="shop-filters"
        className="sticky top-[calc(var(--spacing-topbar)+env(safe-area-inset-top))] z-30 -mx-gutter border-b border-border bg-bg/95 backdrop-blur-md"
      >
        <div className="flex gap-2 overflow-x-auto px-gutter py-2 scrollbar-none">
          <ChipLink href={shopHref(null)} selected={!selectedSlug} document>
            {t("all")}
          </ChipLink>
          {view.filters.map((filter) => (
            <ChipLink key={filter.id} href={shopHref(filter.slug)} selected={filter.slug === selectedSlug} document>
              {localizedLabel(filter.name, locale)}
            </ChipLink>
          ))}
        </div>
      </div>

      {view.tiles.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<PackageSearch />}
            title={t("empty")}
            description={selectedSlug ? t("emptyFilterDescription") : t("emptyDescription")}
            action={
              selectedSlug ? (
                <Button asChild variant="secondary">
                  <Link href="/shop">{t("clearFilters")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ShopGrid
          key={selectedSlug ?? ""}
          filtro={selectedSlug}
          label={`${t("productsLabel")} · ${selectedName}`}
          nextOffset={view.nextOffset}
          hasMore={view.hasMore}
          initialCount={view.tiles.length}
        >
          {view.tiles.map((product, index) => (
            <ShopTile key={product.id} product={product} priority={index < 3} />
          ))}
        </ShopGrid>
      )}
    </div>
  );
}
