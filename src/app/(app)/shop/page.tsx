import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { PackageSearch, ReceiptText, ShoppingBag } from "lucide-react";
import { ProductCard } from "@/components/catalog";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SHOP_SORTS, ShopFilters, type ShopSort } from "@/components/commerce/ShopFilters";
import { Button, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import { getUser } from "@/lib/auth/session";
import { localizedLabel, type ProductCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

// Loja de demonstração: grade de produtos compráveis (publicados, moderação regular, fornecedor
// ativo). Indisponíveis aparecem esmaecidos. Filtros vivem na URL (Server Component).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("commerce.shop");
  return { title: t("title"), description: t("description") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SHOP_SELECT =
  "id, slug, title, image_url, price_cents_demo, availability, demo_stock, published_at, " +
  "category:product_categories!inner(code, name), seller:seller_organizations!inner(slug, name, status)";

type ShopProduct = ProductCardData & { demo_stock: number | null; published_at: string | null };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 80);
  const category = first(params.category).slice(0, 40) || null;
  const seller = first(params.seller).slice(0, 80) || null;
  const sortRaw = first(params.sort);
  const sort: ShopSort = (SHOP_SORTS as string[]).includes(sortRaw) ? (sortRaw as ShopSort) : "newest";

  const [t, locale, user, supabase] = await Promise.all([getTranslations("commerce.shop"), getLocale(), getUser(), createClient()]);

  let query = supabase.from("products").select(SHOP_SELECT).eq("status", "published").eq("moderation_status", "clear").eq("seller.status", "active");
  if (category) query = query.eq("category.code", category);
  if (seller) query = query.eq("seller.slug", seller);
  if (q) {
    // sanitiza para a sintaxe .or() do PostgREST (vírgula/parênteses separam filtros)
    const safe = q.replace(/[,()%]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  switch (sort) {
    case "priceAsc":
      query = query.order("price_cents_demo", { ascending: true });
      break;
    case "priceDesc":
      query = query.order("price_cents_demo", { ascending: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    default:
      query = query.order("published_at", { ascending: false, nullsFirst: false });
  }

  const [{ data: productsRaw, error }, { data: categoriesRaw }, { data: sellersRaw }] = await Promise.all([
    query.limit(60),
    supabase.from("product_categories").select("code, name, sort_order").order("sort_order"),
    supabase.from("seller_organizations").select("slug, name").eq("status", "active").order("name"),
  ]);
  if (error) throw new Error(error.message);

  const products = (productsRaw ?? []) as unknown as ShopProduct[];
  const categories = (categoriesRaw ?? []).map((c) => ({ code: c.code, label: localizedLabel(c.name, locale) }));
  const sellers = (sellersRaw ?? []).map((s) => ({ slug: s.slug, name: s.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={<DemoBadge />}
        actions={
          user ? (
            <>
              <Button asChild variant="ghost" size="sm" leadingIcon={<ReceiptText />} className="hidden sm:inline-flex">
                <Link href="/orders">{t("ordersLink")}</Link>
              </Button>
              <Button asChild variant="secondary" size="sm" leadingIcon={<ShoppingBag />}>
                <Link href="/cart">{t("cartLink")}</Link>
              </Button>
            </>
          ) : undefined
        }
      />
      <DemoNotice>{t("unavailableHint")}</DemoNotice>

      {/* useSearchParams no cliente exige Suspense para o prerender */}
      <Suspense fallback={null}>
        <ShopFilters categories={categories} sellers={sellers} current={{ q, category, seller, sort }} resultCount={products.length} />
      </Suspense>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<PackageSearch />}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <Button asChild variant="secondary">
                <Link href="/shop">{t("clearFilters")}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("title")}>
          {products.map((product, index) => {
            const outOfStock = product.demo_stock !== null && product.demo_stock <= 0;
            const card: ProductCardData = outOfStock ? { ...product, availability: "unavailable" } : product;
            return (
              <li key={product.id}>
                <ProductCard product={card} priority={index < 3} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
