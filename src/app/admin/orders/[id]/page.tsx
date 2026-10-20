import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin";
import { DemoNotice, KeyValue, Panel } from "@/components/admin-content";
import { CancelOrderButton, FulfillmentActions } from "@/components/admin-content/OrderAdminActions";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDate, formatDateTime } from "@/i18n/format";
import { localizedLabel } from "@/lib/catalog/queries";
import type { Enums } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Detalhe do pedido de teste: destino fictício, itens (snapshot), remessas + linha do tempo, ações admin.

type Order = {
  id: string;
  user_id: string | null;
  destination_snapshot: { code?: string; name?: unknown; zone?: string; fictional?: boolean } | null;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  status: Enums<"order_status">;
  confirmed_at: string;
  completed_at: string | null;
  retention_expires_at: string;
  anonymized_at: string | null;
};
type Item = { id: string; fulfillment_id: string; title_snapshot: string; image_snapshot: string | null; price_cents_snapshot: number; quantity: number; product_version_snapshot: number | null; product_id: string | null };
type Fulfillment = {
  id: string;
  seller_name_snapshot: string;
  status: Enums<"fulfillment_status">;
  shipping_cents_snapshot: number;
  destination_zone: string;
  eta_days: number | null;
  events: { id: number; from_status: Enums<"fulfillment_status"> | null; to_status: Enums<"fulfillment_status">; actor_type: Enums<"actor_type">; note: string | null; created_at: string }[];
};

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("adminContent.orders.detail");
  return { title: `${t("eyebrow")} ${id.slice(0, 8)}` };
}

export default async function AdminOrderDetailPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tc, ts, locale, orderRes, itemsRes, fulfillmentsRes] = await Promise.all([
    getTranslations("adminContent.orders"),
    getTranslations("adminContent.common"),
    getTranslations("adminCommon.status"),
    getLocale(),
    supabase
      .from("test_orders")
      .select("id, user_id, destination_snapshot, subtotal_cents, shipping_cents, total_cents, status, confirmed_at, completed_at, retention_expires_at, anonymized_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("test_order_items").select("id, fulfillment_id, title_snapshot, image_snapshot, price_cents_snapshot, quantity, product_version_snapshot, product_id").eq("order_id", id),
    supabase
      .from("test_fulfillments")
      .select("id, seller_name_snapshot, status, shipping_cents_snapshot, destination_zone, eta_days, events:fulfillment_events(id, from_status, to_status, actor_type, note, created_at)")
      .eq("order_id", id)
      .order("created_at"),
  ]);
  const order = (orderRes.data as unknown as Order | null) ?? null;
  if (!order) notFound();
  const uiLocale = locale as Locale;
  const items = (itemsRes.data ?? []) as Item[];
  const fulfillments = ((fulfillmentsRes.data ?? []) as unknown as Fulfillment[]).map((f) => ({
    ...f,
    events: [...(f.events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
  const dispatched = fulfillments.some((f) => ["ready_for_dispatch", "in_transit", "delivered"].includes(f.status));
  const cancellable = !dispatched && fulfillments.some((f) => ["awaiting", "preparing"].includes(f.status));
  const dest = order.destination_snapshot;
  const destName = dest?.name ? localizedLabel(dest.name, locale) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("detail.eyebrow")}
        title={<span className="font-mono">{order.id.slice(0, 8)}</span>}
        description={t("detail.confirmedAt", { date: formatDateTime(order.confirmed_at, uiLocale) })}
        backHref="/admin/orders"
        backLabel={tc("backToList")}
        actions={<CancelOrderButton orderId={order.id} disabled={!cancellable} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} label={ts(order.status)} size="md" />
          {order.completed_at && <span className="type-caption text-fg-muted">{t("detail.completedAt", { date: formatDateTime(order.completed_at, uiLocale) })}</span>}
        </div>
      </PageHeader>

      <DemoNotice text={t("banner")} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("detail.items")}>
            <ul className="flex flex-col divide-y divide-border" aria-label={t("detail.itemsCaption")}>
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated">
                    {item.image_snapshot && <Image src={item.image_snapshot} alt="" fill unoptimized={item.image_snapshot.endsWith(".svg")} sizes="56px" className="object-cover" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{item.title_snapshot}</span>
                    <span className="type-caption text-fg-muted">
                      {t("detail.qty")} {item.quantity} × {formatCurrency(item.price_cents_snapshot / 100, uiLocale)}
                      {item.product_version_snapshot ? ` · ${t("detail.productVersion", { n: item.product_version_snapshot })}` : ""}
                    </span>
                  </div>
                  <span className="type-numeric shrink-0 text-sm font-semibold text-fg">{formatCurrency((item.price_cents_snapshot * item.quantity) / 100, uiLocale)}</span>
                </li>
              ))}
            </ul>
            <KeyValue
              className="border-t border-border pt-3"
              items={[
                { label: t("detail.subtotal"), value: formatCurrency(order.subtotal_cents / 100, uiLocale) },
                { label: t("detail.shipping"), value: formatCurrency(order.shipping_cents / 100, uiLocale) },
                { label: t("detail.total"), value: <strong>{formatCurrency(order.total_cents / 100, uiLocale)}</strong> },
              ]}
            />
          </Panel>

          <Panel title={t("detail.fulfillments")}>
            <div className="flex flex-col gap-4">
              {fulfillments.map((f) => (
                <section key={f.id} aria-label={t("detail.fulfillment", { seller: f.seller_name_snapshot })} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-fg">{t("detail.fulfillment", { seller: f.seller_name_snapshot })}</h3>
                      <StatusBadge status={f.status} label={ts(f.status)} />
                      <Badge size="sm">{f.destination_zone}</Badge>
                      {f.eta_days ? <span className="type-caption text-fg-muted">{t("detail.eta", { n: f.eta_days })}</span> : null}
                    </div>
                    <span className="type-numeric text-xs text-fg-muted">{formatCurrency(f.shipping_cents_snapshot / 100, uiLocale)}</span>
                  </div>
                  <FulfillmentActions orderId={order.id} fulfillmentId={f.id} status={f.status} />
                  <h4 className="type-caption uppercase tracking-wider text-fg-muted">{t("detail.events")}</h4>
                  {f.events.length === 0 ? (
                    <p className="text-sm text-fg-muted">{t("detail.noEvents")}</p>
                  ) : (
                    <ol className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
                      {f.events.map((e) => (
                        <li key={e.id} className="flex flex-col text-sm">
                          <span className="text-fg">
                            {e.from_status ? `${ts(e.from_status)} → ` : ""}
                            <strong>{ts(e.to_status)}</strong>
                            <span className="text-fg-muted"> · {t(`detail.actor.${e.actor_type}`)}</span>
                          </span>
                          <span className="type-caption text-fg-muted">
                            {formatDateTime(e.created_at, uiLocale)}
                            {e.note ? ` · ${e.note}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title={t("detail.destination")} description={t("detail.destinationNote")}>
            <KeyValue
              items={[
                { label: tc("title"), value: destName ?? t("detail.destinationAnonymized") },
                { label: t("detail.zone"), value: dest?.zone ?? tc("none") },
                { label: tc("id"), value: <code className="font-mono text-xs">{dest?.code ?? tc("none")}</code> },
              ]}
            />
          </Panel>
          <Panel title={t("table.retention")}>
            <KeyValue
              items={[
                { label: t("detail.customer"), value: order.user_id ? <code className="font-mono text-xs">{order.user_id}</code> : t("detail.customerAnonymized") },
                { label: t("table.retention"), value: t("detail.retention", { date: formatDate(order.retention_expires_at, uiLocale) }) },
                { label: t("table.anonymized"), value: order.anonymized_at ? t("detail.anonymizedAt", { date: formatDateTime(order.anonymized_at, uiLocale) }) : t("detail.notAnonymized") },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
