import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { DemoNotice, FilterBar, type FilterField } from "@/components/admin-content";
import { hasAnyFilter, pickDate, pickEnum, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDate, formatDateTime } from "@/i18n/format";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Pedidos de teste globais com filtros (status, data, fornecedor via remessas) e totais em moeda demo.

const STATES = ["confirmed", "in_progress", "completed", "partially_completed", "cancelled", "failed"] as const;
const LIMIT = 100;

type Row = {
  id: string;
  status: Enums<"order_status">;
  total_cents: number;
  confirmed_at: string;
  retention_expires_at: string;
  anonymized_at: string | null;
  user_id: string | null;
  test_fulfillments: { seller_org_id: string; seller_name_snapshot: string; status: Enums<"fulfillment_status"> }[];
  test_order_items: { count: number }[];
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.orders");
  return { title: t("title") };
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [t, tc, ts, locale] = await Promise.all([
    getTranslations("adminContent.orders"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon"),
    getLocale(),
  ]);
  const uiLocale = locale as Locale;
  const supabase = await createClient();
  const status = pickEnum(params, "status", STATES);
  const from = pickDate(params, "from");
  const to = pickDate(params, "to");
  const seller = pickUuid(params, "seller");

  // Com filtro de fornecedor o embed vira !inner para filtrar pelo fornecedor da remessa.
  const fulfillmentsEmbed = seller ? "test_fulfillments!inner(seller_org_id, seller_name_snapshot, status)" : "test_fulfillments(seller_org_id, seller_name_snapshot, status)";
  let query = supabase
    .from("test_orders")
    .select(`id, status, total_cents, confirmed_at, retention_expires_at, anonymized_at, user_id, ${fulfillmentsEmbed}, test_order_items(count)`)
    .order("confirmed_at", { ascending: false })
    .limit(LIMIT);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("confirmed_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("confirmed_at", `${to}T23:59:59Z`);
  if (seller) query = query.eq("test_fulfillments.seller_org_id", seller);

  const [listRes, sellersRes] = await Promise.all([query, supabase.from("seller_organizations").select("id, name").order("name")]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as Row[];
  const sum = rows.reduce((acc, r) => acc + r.total_cents, 0);

  const fields: FilterField[] = [
    { name: "status", label: tc("status"), type: "select", value: status ?? "", options: STATES.map((s) => ({ value: s, label: ts(`status.${s}`) })) },
    { name: "from", label: tc("dateFrom"), type: "date", value: from ?? "" },
    { name: "to", label: tc("dateTo"), type: "date", value: to ?? "" },
    { name: "seller", label: t("filters.seller"), type: "select", value: seller ?? "", options: (sellersRes.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
  ];

  const columns: Column<Row>[] = [
    {
      key: "order",
      header: t("table.order"),
      cell: (row) => (
        <Link href={`/admin/orders/${row.id}`} className="font-mono text-xs font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {row.id.slice(0, 8)}
        </Link>
      ),
    },
    { key: "date", header: t("table.date"), cell: (row) => <span className="type-numeric">{formatDateTime(row.confirmed_at, uiLocale)}</span> },
    { key: "status", header: t("table.status"), cell: (row) => <StatusBadge status={row.status} label={ts(`status.${row.status}`)} /> },
    {
      key: "sellers",
      header: t("table.sellers"),
      hideOnMobile: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.test_fulfillments.map((f) => (
            <Badge key={f.seller_org_id} size="sm" title={ts(`status.${f.status}`)}>
              {f.seller_name_snapshot}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: "items", header: t("table.items"), align: "right", hideOnMobile: true, cell: (row) => <span className="type-numeric">{row.test_order_items?.[0]?.count ?? 0}</span> },
    { key: "total", header: t("table.total"), align: "right", cell: (row) => <span className="type-numeric font-medium">{formatCurrency(row.total_cents / 100, uiLocale)}</span> },
    {
      key: "retention",
      header: t("table.retention"),
      hideOnMobile: true,
      cell: (row) => (
        <div className="flex flex-col gap-0.5 text-xs text-fg-muted">
          <span className="type-numeric">{formatDate(row.retention_expires_at, uiLocale)}</span>
          {row.anonymized_at && (
            <Badge size="sm" variant="neutral">
              {t("table.anonymized")}
            </Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <DemoNotice text={t("banner")} />
      <FilterBar action="/admin/orders" fields={fields} active={hasAnyFilter(params, ["status", "from", "to", "seller"])} />
      <section aria-labelledby="orders-totals" className="grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3">
        <h2 id="orders-totals" className="text-sm font-semibold text-fg sm:col-span-3">
          {t("totals.title")}
        </h2>
        <p className="type-numeric text-fg">{t("totals.count", { n: rows.length })}</p>
        <p className="type-numeric text-fg">{t("totals.sum", { amount: formatCurrency(sum / 100, uiLocale) })}</p>
        <p className="type-numeric text-fg-muted">{t("totals.realRevenue", { amount: formatCurrency(0, uiLocale) })}</p>
      </section>
      <p className="type-caption text-fg-muted" aria-live="polite">
        {rows.length >= LIMIT ? tc("resultsCapped", { n: LIMIT }) : tc("results", { n: rows.length })}
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("table.caption")} emptyTitle={ts("table.noResults")} emptyDescription={ts("table.noResultsDescription")} />
    </div>
  );
}
