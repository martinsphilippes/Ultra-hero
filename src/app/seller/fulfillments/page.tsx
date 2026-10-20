import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { Button, PageHeader, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { getSellerContext } from "../_lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.fulfillments");
  return { title: t("title") };
}

const STATUSES = ["awaiting", "preparing", "ready_for_dispatch", "in_transit", "delivered", "cancelled", "failed"] as const;

type Row = { id: string; status: (typeof STATUSES)[number]; destination_zone: string; eta_days: number | null; created_at: string; items: { count: number }[] };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Remessas da organização ativa (RLS garante o recorte; a UI filtra por org por clareza).
export default async function SellerFulfillmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const [ctx, params, t, tc, ts, tn, locale] = await Promise.all([
    getSellerContext(),
    searchParams,
    getTranslations("seller.fulfillments"),
    getTranslations("commerce.cart.destination"),
    getTranslations("adminCommon.status"),
    getTranslations("nav.seller"),
    getLocale(),
  ]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;
  await advanceTransportSimulation();

  const status = first(params.status);
  const supabase = await createClient();
  let query = supabase
    .from("test_fulfillments")
    .select("id, status, destination_zone, eta_days, created_at, items:test_order_items(count)")
    .eq("seller_org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if ((STATUSES as readonly string[]).includes(status)) query = query.eq("status", status as Row["status"]);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const uiLocale = locale as Locale;
  const zoneLabel = (zone: string) => (zone === "local" || zone === "regional" || zone === "national" ? tc(`zone.${zone}`) : zone);

  const columns: Column<Row>[] = [
    {
      key: "id",
      header: t("columns.id"),
      cell: (row) => (
        <Link href={`/seller/fulfillments/${row.id}`} className="type-numeric font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" aria-label={t("openLabel", { id: row.id.slice(0, 8).toUpperCase() })}>
          #{row.id.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (row) => <StatusBadge status={row.status} label={ts(row.status)} /> },
    { key: "zone", header: t("columns.zone"), cell: (row) => zoneLabel(row.destination_zone) },
    { key: "eta", header: t("columns.eta"), cell: (row) => (row.eta_days !== null ? t("etaDays", { n: row.eta_days }) : "—"), hideOnMobile: true },
    { key: "items", header: t("columns.items"), cell: (row) => t("itemsCount", { n: row.items?.[0]?.count ?? 0 }), hideOnMobile: true },
    { key: "created", header: t("columns.created"), cell: (row) => formatDateTime(row.created_at, uiLocale), hideOnMobile: true },
    {
      key: "actions",
      header: t("columns.actions"),
      align: "right",
      cell: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/seller/fulfillments/${row.id}`}>{t("open")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description", { name: ctx.org.name })} backHref="/seller" backLabel={tn("dashboard")} />
      <SellerHeader ctx={ctx} />
      <DemoNotice>{t("detail.systemNote")}</DemoNotice>

      <form method="get" action="/seller/fulfillments" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seller-fulfillments-status" className="text-sm font-semibold text-fg">
            {t("filterStatus")}
          </label>
          <Select id="seller-fulfillments-status" name="status" defaultValue={status} selectSize="sm">
            <option value="">{t("all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" size="sm">
          {t("filterStatus")}
        </Button>
      </form>

      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("tableCaption")} emptyTitle={t("empty")} emptyDescription={t("emptyDescription")} />
    </div>
  );
}
