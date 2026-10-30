import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { DemoNotice, FilterBar, type FilterField } from "@/components/admin-content";
import { hasAnyFilter, pickEnum, pickUuid, type SearchParams } from "@/components/admin-content/lib/search-params";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { sellerHubHref } from "@/lib/seller-ops/portal";
import { countByStatus, FULFILLMENT_STATUSES, OPEN_FULFILLMENT_STATUSES, shortShipmentId, type FulfillmentStatus } from "@/lib/seller-ops/shipments";
import { createClient } from "@/lib/supabase/server";

// Remessas de todos os fornecedores (o que cada fornecedor via no portal), com filtros por status e
// organização. Cada remessa abre na aba Remessas da organização, onde o admin faz as transições.

const LIMIT = 200;

type Row = {
  id: string;
  order_id: string;
  seller_org_id: string;
  seller_name_snapshot: string;
  status: FulfillmentStatus;
  destination_zone: string;
  created_at: string;
  items: { count: number }[];
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.shipments");
  return { title: t("title") };
}

export default async function AdminShipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [t, tf, tc, ts, tz, locale] = await Promise.all([
    getTranslations("adminOps.shipments"),
    getTranslations("seller.fulfillments"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon.status"),
    getTranslations("commerce.cart.destination"),
    getLocale(),
  ]);
  const uiLocale = locale as Locale;
  const status = pickEnum(params, "status", FULFILLMENT_STATUSES);
  const seller = pickUuid(params, "seller");
  await advanceTransportSimulation();

  const supabase = await createClient();
  let query = supabase
    .from("test_fulfillments")
    .select("id, order_id, seller_org_id, seller_name_snapshot, status, destination_zone, created_at, items:test_order_items(count)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (status) query = query.eq("status", status);
  if (seller) query = query.eq("seller_org_id", seller);
  // contagem das abertas (respeita o filtro de organização, ignora o de status)
  let openQuery = supabase.from("test_fulfillments").select("status").in("status", [...OPEN_FULFILLMENT_STATUSES]);
  if (seller) openQuery = openQuery.eq("seller_org_id", seller);

  const [listRes, openRes, sellersRes] = await Promise.all([query, openQuery, supabase.from("seller_organizations").select("id, name").order("name")]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as Row[];
  const open = countByStatus(openRes.data, OPEN_FULFILLMENT_STATUSES);
  const openLabel = { awaiting: t("open.awaiting"), preparing: t("open.preparing"), ready_for_dispatch: t("open.readyForDispatch") } as const;
  const zoneLabel = (zone: string) => (zone === "local" || zone === "regional" || zone === "national" ? tz(`zone.${zone}`) : zone);
  const detailHref = (row: Row) => `${sellerHubHref(row.seller_org_id, "shipments")}/${row.id}`;
  const filterHref = (s: string) => `/admin/shipments?status=${s}${seller ? `&seller=${seller}` : ""}`;

  const fields: FilterField[] = [
    { name: "status", label: tc("status"), type: "select", value: status ?? "", options: FULFILLMENT_STATUSES.map((s) => ({ value: s, label: ts(s) })) },
    { name: "seller", label: tc("seller"), type: "select", value: seller ?? "", options: (sellersRes.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
  ];

  const columns: Column<Row>[] = [
    {
      key: "id",
      header: tf("columns.id"),
      cell: (row) => (
        <Link
          href={detailHref(row)}
          className="type-numeric font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-label={tf("openLabel", { id: shortShipmentId(row.id).slice(1) })}
        >
          {shortShipmentId(row.id)}
        </Link>
      ),
    },
    {
      key: "seller",
      header: tc("seller"),
      cell: (row) => (
        <Link href={sellerHubHref(row.seller_org_id, "overview")} className="text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {row.seller_name_snapshot}
        </Link>
      ),
    },
    { key: "status", header: tf("columns.status"), cell: (row) => <StatusBadge status={row.status} label={ts(row.status)} /> },
    { key: "zone", header: tf("columns.zone"), hideOnMobile: true, cell: (row) => zoneLabel(row.destination_zone) },
    { key: "items", header: tf("columns.items"), hideOnMobile: true, cell: (row) => tf("itemsCount", { n: row.items?.[0]?.count ?? 0 }) },
    { key: "created", header: tf("columns.created"), hideOnMobile: true, cell: (row) => <span className="type-numeric">{formatDateTime(row.created_at, uiLocale)}</span> },
    {
      key: "actions",
      header: tf("columns.actions"),
      align: "right",
      cell: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={detailHref(row)}>{tf("open")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <DemoNotice text={t("banner")} />
      <section aria-labelledby="shipments-open" className="flex flex-col gap-3">
        <h2 id="shipments-open" className="type-h3 text-fg">
          {t("open.title")}
        </h2>
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {OPEN_FULFILLMENT_STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={filterHref(s)}
                aria-current={status === s ? "true" : undefined}
                className="flex min-h-11 flex-col gap-1 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[current=true]:border-accent"
                data-testid={`shipments-open-${s}`}
              >
                <span className="type-caption text-fg-muted">{openLabel[s]}</span>
                <span className="type-numeric text-2xl font-bold text-fg">{open[s]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <FilterBar action="/admin/shipments" fields={fields} active={hasAnyFilter(params, ["status", "seller"])} />
      <p className="type-caption text-fg-muted" aria-live="polite">
        {rows.length >= LIMIT ? tc("resultsCapped", { n: LIMIT }) : tc("results", { n: rows.length })}
      </p>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t("tableCaption")} emptyTitle={tf("empty")} emptyDescription={t("emptyDescription")} />
    </div>
  );
}
