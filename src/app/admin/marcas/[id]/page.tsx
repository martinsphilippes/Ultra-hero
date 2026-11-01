import type { Metadata } from "next";
import { ExternalLink, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Panel } from "@/components/admin-content";
import { BrandForm, ProductForm } from "@/components/admin-brands/BrandForms";
import { ProductImage } from "@/components/brands/ProductCard";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { getAdminBrand } from "@/lib/brands/admin-queries";
import { formatBrandPrice, OUTBOUND_REL } from "@/lib/brands";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const data = await getAdminBrand(id);
  return { title: data.available && data.brand ? data.brand.name : "" };
}

// Uma marca: dados (logo, site, relação padrão, situação, demonstração) e os produtos dela, cada um
// com link de compra no site da marca, foto e preço opcionais.
export default async function AdminBrandPage({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, data] = await Promise.all([getTranslations("adminOps.brands"), getAdminBrand(id)]);
  if (!data.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState icon={<Store />} title={t("unavailable")} />
      </div>
    );
  }
  const { brand, products } = data;
  if (!brand) notFound();

  return (
    <div className="flex flex-col gap-5" data-testid="admin-brand-page">
      <PageHeader title={brand.name} description={brand.site_url} backHref="/admin/marcas" backLabel={t("back")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={brand.status === "active" ? "success" : "neutral"} size="sm">
            {t(`status.${brand.status}`)}
          </Badge>
          <span className="type-caption text-fg-muted">{t(`relationship.${brand.default_relationship}`)}</span>
        </div>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title={t("form.edit")}>
          <BrandForm key={JSON.stringify(brand)} brand={brand} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("product.title")}>
            {products.length === 0 ? <p className="type-body-sm text-fg-muted">{t("product.empty")}</p> : null}
            <ul className="flex flex-col gap-2" data-testid="admin-brand-products">
              {products.map((product) => {
                const price = formatBrandPrice(product.price_cents, product.currency, "pt-BR");
                return (
                  <li key={product.id} className="rounded-xl border border-border bg-bg">
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                        <ProductImage
                          product={{ ...product, brand: { id: brand.id, slug: brand.slug, name: brand.name, logo_url: brand.logo_url, site_url: brand.site_url, is_demo: brand.is_demo } }}
                          className="size-12 shrink-0"
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                            {product.name}
                            {product.status === "inactive" ? (
                              <Badge variant="neutral" size="sm">
                                {t("productStatus.inactive")}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="truncate type-caption text-fg-muted">{[price, product.external_url].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="type-caption font-medium text-accent-text group-open:hidden">{t("product.edit")}</span>
                      </summary>
                      <div className="flex flex-col gap-3 border-t border-border p-3">
                        <a
                          href={product.external_url}
                          target="_blank"
                          rel={OUTBOUND_REL}
                          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                          {t("product.openLink")}
                        </a>
                        <ProductForm key={JSON.stringify(product)} brandId={brand.id} product={product} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title={t("product.new")}>
            <ProductForm brandId={brand.id} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
