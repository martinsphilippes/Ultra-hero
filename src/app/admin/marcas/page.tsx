import type { Metadata } from "next";
import { ChevronRight, MousePointerClick, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Panel } from "@/components/admin-content";
import { BrandForm } from "@/components/admin-brands/BrandForms";
import { BrandLogo } from "@/components/brands/BrandLogo";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { brandClicks, listAdminBrands } from "@/lib/brands/admin-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.brands");
  return { title: t("title") };
}

// Marcas e produtos (0062): marcas externas com produtos de link de compra no site da marca. Lista em
// cards no celular, nova marca no topo e os cliques para fora dos últimos 30 dias (só contagens).
export default async function AdminBrandsPage() {
  const [t, list, clicks] = await Promise.all([getTranslations("adminOps.brands"), listAdminBrands(), brandClicks(30)]);
  const clicksByBrand = new Map((clicks?.brands ?? []).map((b) => [b.id, b.clicks]));

  return (
    <div className="flex flex-col gap-5" data-testid="admin-brands-page">
      <PageHeader title={t("title")} description={t("description")} />
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="admin-brands-unavailable">
          <EmptyState icon={<Store />} title={t("unavailable")} />
        </div>
      ) : (
        <>
          <p role="note" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 px-4 py-3 text-sm text-fg">
            {t("demoNotice")}
          </p>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              {list.brands.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface">
                  <EmptyState icon={<Store />} title={t("empty")} />
                </div>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="admin-brand-list">
                  {list.brands.map((brand) => (
                    <li key={brand.id}>
                      <Link
                        href={`/admin/marcas/${brand.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <BrandLogo name={brand.name} logoUrl={brand.logo_url} className="h-8 max-w-[110px] shrink-0" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-fg">{brand.name}</span>
                            <Badge variant={brand.status === "active" ? "success" : "neutral"} size="sm">
                              {t(`status.${brand.status}`)}
                            </Badge>
                            {brand.is_demo ? (
                              <Badge variant="demo" size="sm">
                                {t("demo")}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="type-caption text-fg-muted">
                            {t(`relationship.${brand.default_relationship}`)} · {t("productsCount", { count: brand.products })}
                            {clicks ? ` · ${t("clicks", { count: clicksByBrand.get(brand.id) ?? 0 })}` : ""}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title={t("new")}>
                <BrandForm />
              </Panel>
              {clicks ? (
                <Panel title={t("clicksTitle")} description={t("clicksNote")}>
                  {clicks.products.length === 0 && clicks.brands.length === 0 ? (
                    <p className="type-body-sm text-fg-muted">{t("clicksEmpty")}</p>
                  ) : (
                    <ol className="flex flex-col gap-1.5" data-testid="admin-brand-clicks">
                      {clicks.products.slice(0, 8).map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2 text-fg">
                            <MousePointerClick aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" />
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className="type-numeric font-semibold text-fg">{p.clicks}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
