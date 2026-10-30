import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { DemoNotice, JsonView, KeyValue, Panel } from "@/components/admin-content";
import { ProductModerationActions } from "@/components/admin-content/ProductAdminActions";
import { Badge, Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { localizedLabel } from "@/lib/catalog/queries";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Detalhe do produto: campos, ficha alimentar, versões (antes/depois), moderação e ações.

type Product = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string;
  price_cents_demo: number;
  product_type: "physical" | "kit" | "digital";
  attributes: unknown;
  food_info: { ingredients?: string[]; allergens?: string[]; storage?: string } | null;
  status: Enums<"product_status">;
  availability: Enums<"availability">;
  moderation_status: Enums<"moderation_status">;
  moderation_reason: string | null;
  demo_stock: number | null;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  seller: { id: string; name: string; kind: string } | null;
  category: { code: string; name: unknown; is_food: boolean } | null;
};

type VersionRow = { id: string; version: number; changed_fields: string[]; significant: boolean; created_at: string; snapshot: unknown };
type ModerationRow = { id: string; action: string; reason: string | null; created_at: string };

type Params = { params: Promise<{ id: string }> };

const PRODUCT_SELECT =
  "id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, moderation_status, moderation_reason, demo_stock, version, published_at, created_at, updated_at, " +
  "seller:seller_organizations(id, name, kind), category:product_categories(code, name, is_food)";

async function loadProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as Product | null) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);
  return { title: product?.title ?? "" };
}

export default async function AdminProductDetailPage({ params }: Params) {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) notFound();
  const supabase = await createClient();
  const [t, tc, ts, locale, versionsRes, moderationRes] = await Promise.all([
    getTranslations("adminContent.products"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon.status"),
    getLocale(),
    supabase.from("product_versions").select("id, version, changed_fields, significant, created_at, snapshot").eq("product_id", id).order("version", { ascending: false }),
    supabase.from("product_moderation").select("id, action, reason, created_at").eq("product_id", id).order("created_at", { ascending: false }),
  ]);
  const uiLocale = locale as Locale;
  const versions = (versionsRes.data ?? []) as VersionRow[];
  const moderation = (moderationRes.data ?? []) as ModerationRow[];
  const isOwn = product.seller?.kind === "own";

  const versionColumns: Column<VersionRow>[] = [
    { key: "version", header: t("table.version"), cell: (v) => <span className="type-numeric">v{v.version}</span> },
    { key: "fields", header: t("detail.changedFields"), cell: (v) => <span className="font-mono text-xs">{v.changed_fields.join(", ")}</span> },
    {
      key: "significant",
      header: t("detail.significant"),
      cell: (v) => (
        <Badge size="sm" variant={v.significant ? "warning" : "neutral"}>
          {v.significant ? tc("yes") : tc("no")}
        </Badge>
      ),
    },
    { key: "date", header: tc("labels.created"), hideOnMobile: true, cell: (v) => <span className="type-numeric text-fg-muted">{formatDateTime(v.created_at, uiLocale)}</span> },
    { key: "snapshot", header: tc("view"), hideOnMobile: true, cell: (v) => <JsonView value={v.snapshot} summary={`v${v.version}`} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("detail.eyebrow")}
        title={product.title}
        description={product.seller?.name ?? undefined}
        backHref="/admin/products"
        backLabel={tc("backToList")}
        actions={
          <>
            {product.status === "published" && product.moderation_status === "clear" && (
              <Button asChild variant="ghost" size="sm" leadingIcon={<ExternalLink />}>
                <Link href={`/shop/${product.slug}`}>{t("detail.openPublic")}</Link>
              </Button>
            )}
            {(isOwn || product.seller) && (
              <Button asChild size="sm" variant="secondary" leadingIcon={<Pencil />}>
                {/* parceiro: edita pela aba Produtos da organização (portal do fornecedor desligado, 0053) */}
                <Link href={isOwn || !product.seller ? `/admin/products/${product.id}/edit` : `/admin/sellers/${product.seller.id}/products/${product.id}/edit`}>{tc("edit")}</Link>
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} label={ts(product.status)} />
          <StatusBadge status={product.availability} label={ts(product.availability)} />
          <StatusBadge status={product.moderation_status} label={ts(product.moderation_status)} />
          <Badge size="sm">v{product.version}</Badge>
          {isOwn && (
            <Badge variant="accent" size="sm">
              own
            </Badge>
          )}
        </div>
      </PageHeader>

      <DemoNotice />
      <p role="note" className="rounded-lg border border-info/40 bg-info-soft/50 px-3 py-2 text-sm text-fg">
        {isOwn ? t("detail.ownEditable") : t("detail.partnerReadOnly")}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("detail.fields")}>
            <KeyValue
              items={[
                { label: tc("seller"), value: product.seller?.name ?? tc("none") },
                { label: tc("category"), value: product.category ? localizedLabel(product.category.name, locale) : tc("none") },
                { label: tc("price"), value: formatCurrency(product.price_cents_demo / 100, uiLocale) },
                { label: t("detail.type"), value: t(`detail.productType.${product.product_type}`) },
                { label: t("detail.stock"), value: product.demo_stock ?? tc("none") },
                { label: tc("slug"), value: <code className="font-mono text-xs">{product.slug}</code> },
                { label: tc("description"), value: product.description, wide: true },
                { label: tc("labels.created"), value: formatDateTime(product.created_at, uiLocale) },
                { label: tc("labels.updated"), value: formatDateTime(product.updated_at, uiLocale) },
                { label: tc("labels.published"), value: product.published_at ? formatDateTime(product.published_at, uiLocale) : tc("none") },
              ]}
            />
            <JsonView value={product.attributes} summary={t("detail.attributes")} />
          </Panel>

          <Panel title={t("detail.foodInfo")}>
            {product.food_info ? (
              <KeyValue
                items={[
                  { label: t("detail.ingredients"), value: (product.food_info.ingredients ?? []).join(", ") || tc("none"), wide: true },
                  { label: t("detail.allergens"), value: (product.food_info.allergens ?? []).join(", ") || tc("none"), wide: true },
                  { label: t("detail.storage"), value: product.food_info.storage ?? tc("none"), wide: true },
                ]}
              />
            ) : (
              <p className="text-sm text-fg-muted">{t("detail.noFoodInfo")}</p>
            )}
          </Panel>

          <Panel title={t("detail.versions")} description={t("detail.significantHint")}>
            <DataTable columns={versionColumns} rows={versions} rowKey={(v) => v.id} caption={t("detail.versionsCaption")} emptyTitle={t("detail.versionsEmpty")} />
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title={t("moderation.title")} description={t("moderation.description")}>
            {product.moderation_reason && <p className="text-sm text-fg-muted">{t("moderation.currentReason", { reason: product.moderation_reason })}</p>}
            <ProductModerationActions productId={product.id} moderation={product.moderation_status} />
          </Panel>
          <Panel title={t("detail.moderationHistory")}>
            {moderation.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("detail.moderationEmpty")}</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {moderation.map((m) => (
                  <li key={m.id} className="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <Badge size="sm" variant={m.action === "clear" ? "success" : m.action === "hide" ? "warning" : "danger"}>
                        {t(`moderation.${m.action}` as never)}
                      </Badge>
                      <span className="type-caption text-fg-muted">{formatDateTime(m.created_at, uiLocale)}</span>
                    </div>
                    {m.reason && <p className="text-fg-muted">{m.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
