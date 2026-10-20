import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { DemoNotice, FilterBar, type FilterField } from "@/components/admin-content";
import { escapeLike, hasAnyFilter, pickEnum, pickSearch, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { Badge, Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { localizedLabel } from "@/lib/catalog/queries";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Todos os produtos (parceiros + operação própria) com nome do fornecedor e filtros.

const STATES = ["draft", "published", "archived"] as const;
const AVAIL = ["available", "unavailable"] as const;
const MOD = ["clear", "hidden", "suspended"] as const;
const LIMIT = 100;

type Row = {
  id: string;
  slug: string;
  title: string;
  price_cents_demo: number;
  status: Enums<"product_status">;
  availability: Enums<"availability">;
  moderation_status: Enums<"moderation_status">;
  version: number;
  seller: { name: string; kind: string } | null;
  category: { code: string; name: unknown } | null;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.products");
  return { title: t("title") };
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [t, tc, ts, locale] = await Promise.all([
    getTranslations("adminContent.products"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon"),
    getLocale(),
  ]);
  const supabase = await createClient();
  const q = pickSearch(params);
  const seller = pickUuid(params, "seller");
  const status = pickEnum(params, "status", STATES);
  const availability = pickEnum(params, "availability", AVAIL);
  const moderation = pickEnum(params, "moderation", MOD);
  const category = pickUuid(params, "category");

  let query = supabase
    .from("products")
    .select("id, slug, title, price_cents_demo, status, availability, moderation_status, version, seller:seller_organizations(name, kind), category:product_categories(code, name)")
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  if (seller) query = query.eq("seller_org_id", seller);
  if (status) query = query.eq("status", status);
  if (availability) query = query.eq("availability", availability);
  if (moderation) query = query.eq("moderation_status", moderation);
  if (category) query = query.eq("category_id", category);

  const [listRes, sellersRes, categoriesRes] = await Promise.all([
    query,
    supabase.from("seller_organizations").select("id, name, kind").order("name"),
    supabase.from("product_categories").select("id, code, name").order("sort_order"),
  ]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as Row[];

  const fields: FilterField[] = [
    { name: "q", label: tc("search"), type: "text", value: q, placeholder: tc("searchPlaceholder") },
    { name: "seller", label: tc("seller"), type: "select", value: seller ?? "", options: (sellersRes.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
    { name: "status", label: tc("status"), type: "select", value: status ?? "", options: STATES.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "availability", label: tc("availability"), type: "select", value: availability ?? "", options: AVAIL.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "moderation", label: tc("moderation"), type: "select", value: moderation ?? "", options: MOD.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "category", label: tc("category"), type: "select", value: category ?? "", options: (categoriesRes.data ?? []).map((c) => ({ value: c.id, label: localizedLabel(c.name, locale) })) },
  ];

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: t("table.title"),
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/admin/products/${row.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {row.title}
          </Link>
          <span className="truncate text-xs text-fg-muted">{row.category ? localizedLabel(row.category.name, locale) : ""}</span>
        </div>
      ),
    },
    {
      key: "seller",
      header: t("table.seller"),
      hideOnMobile: true,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          {row.seller?.name ?? tc("none")}
          {row.seller?.kind === "own" && (
            <Badge variant="accent" size="sm">
              own
            </Badge>
          )}
        </span>
      ),
    },
    { key: "price", header: t("table.price"), align: "right", cell: (row) => <span className="type-numeric">{formatCurrency(row.price_cents_demo / 100, locale as Locale)}</span> },
    { key: "status", header: t("table.status"), cell: (row) => <StatusBadge status={row.status} label={ts(`status.${row.status}`)} /> },
    { key: "availability", header: t("table.availability"), hideOnMobile: true, cell: (row) => <StatusBadge status={row.availability} label={ts(`status.${row.availability}`)} /> },
    { key: "moderation", header: t("table.moderation"), cell: (row) => <StatusBadge status={row.moderation_status} label={ts(`status.${row.moderation_status}`)} /> },
    { key: "version", header: t("table.version"), align: "right", hideOnMobile: true, cell: (row) => <span className="type-numeric">v{row.version}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild size="sm" leadingIcon={<Plus />}>
            <Link href="/admin/products/new">{t("new")}</Link>
          </Button>
        }
      />
      <DemoNotice />
      <FilterBar action="/admin/products" fields={fields} active={hasAnyFilter(params, ["q", "seller", "status", "availability", "moderation", "category"])} />
      <p className="type-caption text-fg-muted" aria-live="polite">
        {tc("results", { n: rows.length })}
        {rows.length >= LIMIT ? ` · ${tc("resultsCapped", { n: LIMIT })}` : ""}
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("table.caption")} emptyTitle={ts("table.noResults")} emptyDescription={ts("table.noResultsDescription")} />
    </div>
  );
}
