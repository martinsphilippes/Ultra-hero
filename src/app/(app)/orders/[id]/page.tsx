import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PartyPopper, Truck } from "lucide-react";
import { StatusBadge } from "@/components/admin";
import { CancelOrderButton } from "@/components/commerce/CancelOrderButton";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { OrderTimeline, type FulfillmentEvent } from "@/components/commerce/OrderTimeline";
import { advanceTransportSimulation } from "@/components/commerce/server/queries";
import { Badge, DemoBadge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";
import { localizedLabel } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

// Detalhe do pedido de teste: destino fictício (snapshot), remessas por fornecedor com linha do
// tempo, itens congelados e cancelamento enquanto nada foi expedido na simulação.

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

type OrderDetail = {
  id: string;
  status: string;
  confirmed_at: string;
  completed_at: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  retention_expires_at: string;
  destination_snapshot: { name?: Record<string, string>; code?: string; zone?: string; fictional?: boolean } | null;
  fulfillments: {
    id: string;
    seller_name_snapshot: string;
    status: string;
    shipping_cents_snapshot: number;
    destination_zone: string;
    eta_days: number | null;
    created_at: string;
    items: { id: string; title_snapshot: string; image_snapshot: string | null; price_cents_snapshot: number; quantity: number; product_version_snapshot: number | null }[];
    events: FulfillmentEvent[];
  }[];
};

const ORDER_SELECT =
  "id, status, confirmed_at, completed_at, subtotal_cents, shipping_cents, total_cents, retention_expires_at, destination_snapshot, " +
  "fulfillments:test_fulfillments(id, seller_name_snapshot, status, shipping_cents_snapshot, destination_zone, eta_days, created_at, " +
  "items:test_order_items(id, title_snapshot, image_snapshot, price_cents_snapshot, quantity, product_version_snapshot), " +
  "events:fulfillment_events(id, from_status, to_status, actor_type, note, created_at))";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("commerce.orders");
  return { title: `${t("order")} ${t("orderShort", { id: id.slice(0, 8).toUpperCase() })}` };
}

export default async function OrderDetailPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const user = await requireUser(`/orders/${id}`);
  await advanceTransportSimulation();

  const [t, tc, ts, locale, supabase] = await Promise.all([
    getTranslations("commerce.orders"),
    getTranslations("commerce.cart"),
    getTranslations("adminCommon.status"),
    getLocale(),
    createClient(),
  ]);
  const { data } = await supabase.from("test_orders").select(ORDER_SELECT).eq("id", id).eq("user_id", user.id).maybeSingle();
  const order = (data as unknown as OrderDetail | null) ?? null;
  if (!order) notFound();

  const uiLocale = locale as Locale;
  const currency = new Intl.NumberFormat(uiLocale, { style: "currency", currency: "BRL" });
  const isNew = query.new === "1";
  const short = order.id.slice(0, 8).toUpperCase();
  const dispatched = order.fulfillments.some((f) => ["ready_for_dispatch", "in_transit", "delivered"].includes(f.status));
  const terminal = ["cancelled", "completed", "partially_completed", "failed"].includes(order.status);
  const canCancel = !dispatched && !terminal && order.fulfillments.some((f) => ["awaiting", "preparing"].includes(f.status));
  const fulfillments = [...order.fulfillments].sort((a, b) => a.seller_name_snapshot.localeCompare(b.seller_name_snapshot));
  const zone = order.destination_snapshot?.zone;
  const zoneLabel = zone && (zone === "local" || zone === "regional" || zone === "national") ? tc(`destination.zone.${zone}`) : (zone ?? "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <>
            {t("order")} <span className="type-numeric">{t("orderShort", { id: short })}</span>
          </>
        }
        description={
          <>
            {t("date")} <time dateTime={order.confirmed_at}>{formatDateTime(order.confirmed_at, uiLocale)}</time>
          </>
        }
        eyebrow={<DemoBadge />}
        backHref="/orders"
        backLabel={t("detail.backToOrders")}
        actions={<StatusBadge status={order.status} label={ts.has(order.status) ? ts(order.status) : order.status} size="md" />}
      />

      {isNew ? (
        <DemoNotice tone="success" live="alert">
          <span className="flex items-start gap-2">
            <PartyPopper className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{t("detail.newTitle")}</strong> {t("detail.newDescription")}
            </span>
          </span>
        </DemoNotice>
      ) : null}
      <DemoNotice>{t("banner")}</DemoNotice>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section aria-labelledby="order-fulfillments" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="order-fulfillments" className="type-h2 text-fg">
              {t("detail.fulfillments")}
            </h2>
            <p className="type-caption inline-flex items-center gap-1.5 text-fg-muted">
              <Truck className="size-4" aria-hidden="true" />
              {t("detail.transportNote")}
            </p>
          </div>
          {fulfillments.map((f) => (
            <article key={f.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" aria-labelledby={`f-${f.id}`}>
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`f-${f.id}`} className="type-h3 text-fg">
                  {t("detail.fulfillment", { seller: f.seller_name_snapshot })}
                </h3>
                <StatusBadge status={f.status} label={ts.has(f.status) ? ts(f.status) : f.status} />
              </header>
              <p className="type-caption text-fg-muted">
                {f.eta_days !== null ? t("detail.eta", { n: f.eta_days }) : null}
                {f.eta_days !== null ? " · " : null}
                {t("detail.shipping")}: <span className="type-numeric">{currency.format(f.shipping_cents_snapshot / 100)}</span>
              </p>
              <ul className="divide-y divide-border" aria-label={t("detail.items")}>
                {f.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated">
                      {item.image_snapshot ? <Image src={item.image_snapshot} alt="" fill sizes="48px" unoptimized={item.image_snapshot.endsWith(".svg")} className="object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-fg">{item.title_snapshot}</p>
                      <p className="type-caption text-fg-muted">{t("detail.itemLine", { qty: item.quantity, price: currency.format(item.price_cents_snapshot / 100) })}</p>
                    </div>
                    <p className="type-numeric text-sm font-semibold text-fg">{currency.format((item.price_cents_snapshot * item.quantity) / 100)}</p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <h4 className="type-overline text-fg-muted">{t("detail.timeline")}</h4>
                <OrderTimeline events={[...f.events].sort((a, b) => a.created_at.localeCompare(b.created_at))} label={t("detail.timeline")} />
              </div>
            </article>
          ))}
        </section>

        <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-[calc(var(--spacing-topbar)+1rem)]" aria-labelledby="order-summary">
          <h2 id="order-summary" className="type-h3 text-fg">
            {t("detail.summary")}
          </h2>
          <div className="flex flex-col gap-1">
            <p className="type-overline text-fg-muted">{t("detail.destination")}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
              {order.destination_snapshot?.name ? localizedLabel(order.destination_snapshot.name, uiLocale) : "—"}
              {zoneLabel ? (
                <Badge variant="neutral" size="sm">
                  {t("detail.zone", { zone: zoneLabel })}
                </Badge>
              ) : null}
              <Badge variant="demo" size="sm">
                {tc("destination.label")}
              </Badge>
            </p>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("detail.subtotal")}</dt>
              <dd className="type-numeric font-medium text-fg">{currency.format(order.subtotal_cents / 100)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("detail.shipping")}</dt>
              <dd className="type-numeric font-medium text-fg">{currency.format(order.shipping_cents / 100)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
              <dt className="font-semibold text-fg">{t("detail.total")}</dt>
              <dd className="type-numeric font-bold text-fg">{currency.format(order.total_cents / 100)}</dd>
            </div>
          </dl>
          <p className="type-caption text-fg-subtle">{t("retention", { date: formatDate(order.retention_expires_at, uiLocale) })}</p>
          {canCancel ? <CancelOrderButton orderId={order.id} /> : dispatched && !terminal ? <p className="type-caption text-fg-muted">{t("detail.cancelBlocked")}</p> : null}
        </aside>
      </div>
    </div>
  );
}
