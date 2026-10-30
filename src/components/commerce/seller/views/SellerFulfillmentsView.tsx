import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { Button, Select } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { FULFILLMENT_STATUSES, isFulfillmentStatus, shortShipmentId, type FulfillmentStatus } from "@/lib/seller-ops/shipments";
import { createClient } from "@/lib/supabase/server";

type Row = { id: string; status: FulfillmentStatus; destination_zone: string; eta_days: number | null; created_at: string; items: { count: number }[] };
type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Remessas de uma organização com filtro de status (RLS garante o recorte; o filtro por org é explícito).
// Usada no portal do fornecedor e na aba Remessas da organização no admin.
export async function SellerFulfillmentsView({ orgId, base, params }: { orgId: string; base: string; params: Params }) {
  const [t, tc, ts, locale] = await Promise.all([getTranslations("seller.fulfillments"), getTranslations("commerce.cart.destination"), getTranslations("adminCommon.status"), getLocale()]);
  const raw = first(params.status);
  const status = isFulfillmentStatus(raw) ? raw : "";
  const supabase = await createClient();
  let query = supabase
    .from("test_fulfillments")
    .select("id, status, destination_zone, eta_days, created_at, items:test_order_items(count)")
    .eq("seller_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  const uiLocale = locale as Locale;
  const zoneLabel = (zone: string) => (zone === "local" || zone === "regional" || zone === "national" ? tc(`zone.${zone}`) : zone);
  const fid = `fulfillments-${orgId.slice(0, 8)}`;

  const columns: Column<Row>[] = [
    {
      key: "id",
      header: t("columns.id"),
      cell: (row) => (
        <Link
          href={`${base}/${row.id}`}
          className="type-numeric font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-label={t("openLabel", { id: shortShipmentId(row.id).slice(1) })}
        >
          {shortShipmentId(row.id)}
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
          <Link href={`${base}/${row.id}`}>{t("open")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fid}-status`} className="text-sm font-semibold text-fg">
            {t("filterStatus")}
          </label>
          <Select id={`${fid}-status`} name="status" defaultValue={status} selectSize="sm">
            <option value="">{t("all")}</option>
            {FULFILLMENT_STATUSES.map((s) => (
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
