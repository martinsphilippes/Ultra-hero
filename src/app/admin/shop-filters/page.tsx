import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel } from "@/components/admin-content";
import { ShopFiltersEditor, type ShopFilterNames, type ShopFilterRow } from "@/components/admin-content/ShopFiltersEditor";
import { PageHeader } from "@/components/ui";
import { localizedLabel } from "@/lib/catalog/queries";
import { productsForFilter } from "@/lib/shop/filters";
import { fetchShopIndex } from "@/lib/shop/queries";
import { createClient } from "@/lib/supabase/server";

// Filtros da aba Comprar (0047): o admin cria, renomeia (pt-BR/en/es), ordena, ativa/desativa,
// exclui e define os produtos de cada filtro (categorias e/ou escolha manual).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.shopFilters");
  return { title: t("title") };
}

type FilterRow = {
  id: string;
  slug: string;
  name: unknown;
  is_active: boolean;
  categories: { category_id: string; category: { code: string } | null }[] | null;
  products: { product: { id: string; title: string; seller: { name: string } | null } | null }[] | null;
};

function names(value: unknown): ShopFilterNames {
  const map = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const read = (key: string) => (typeof map[key] === "string" ? (map[key] as string) : "");
  return { "pt-BR": read("pt-BR"), en: read("en"), es: read("es") };
}

export default async function AdminShopFiltersPage() {
  const supabase = await createClient();
  const [t, locale, filtersRes, categoriesRes, index] = await Promise.all([
    getTranslations("adminContent.shopFilters"),
    getLocale(),
    supabase
      .from("shop_filters")
      .select(
        "id, slug, name, is_active, categories:shop_filter_categories(category_id, category:product_categories(code)), " +
          "products:shop_filter_products(product:products(id, title, seller:seller_organizations(name)))",
      )
      .order("sort_order")
      .order("slug"),
    supabase.from("product_categories").select("id, code, name").order("sort_order"),
    fetchShopIndex(supabase),
  ]);
  if (categoriesRes.error) throw new Error(categoriesRes.error.message);

  // Sem a 0047 no banco a tabela não existe: avisa em vez de quebrar a tela.
  if (filtersRes.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("description")} />
        <p role="status" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
          {t("unavailable")}
        </p>
      </div>
    );
  }

  const categories = (categoriesRes.data ?? []).map((c) => ({ id: c.id, label: localizedLabel(c.name, locale), code: c.code }));
  const rows: ShopFilterRow[] = ((filtersRes.data ?? []) as unknown as FilterRow[]).map((row) => {
    const categoryCodes = (row.categories ?? []).map((c) => c.category?.code).filter((code): code is string => Boolean(code));
    const products = (row.products ?? []).map((p) => p.product).filter((p): p is NonNullable<typeof p> => Boolean(p));
    return {
      id: row.id,
      slug: row.slug,
      name: names(row.name),
      is_active: row.is_active,
      categoryIds: (row.categories ?? []).map((c) => c.category_id),
      products: products.map((p) => ({ id: p.id, title: p.title, subtitle: p.seller?.name ?? null })).sort((a, b) => a.title.localeCompare(b.title)),
      visibleCount: productsForFilter(index, { categoryCodes, productIds: products.map((p) => p.id) }).length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Panel title={t("listTitle")} description={t("listDescription")}>
        <ShopFiltersEditor filters={rows} categories={categories.map(({ id, label }) => ({ id, label }))} />
      </Panel>
    </div>
  );
}
