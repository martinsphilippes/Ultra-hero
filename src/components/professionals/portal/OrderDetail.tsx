import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ServiceOrderView } from "@/lib/professionals/queries";
import { durationParts, serviceFormatParts, type OrderActor } from "@/lib/professionals/rules";
import { OrderStatusBadge, OrderTimeline } from "../OrderParts";
import { OrderActions } from "./OrderActions";

// Detalhe de um pedido (portal e admin): resumo, agenda, tempo de resposta, histórico e ações.
export async function OrderDetail({ order, actor }: { order: ServiceOrderView; actor: Extract<OrderActor, "professional" | "admin"> }) {
  const [t, tp, locale, format] = await Promise.all([getTranslations("professionals"), getTranslations("professionals.portal"), getLocale(), getFormatter()]);
  const parts = serviceFormatParts(order);
  const meta = [t(`mode.${parts.mode}`), parts.minutes !== null ? t("format.minutes", { minutes: parts.minutes }) : null, parts.weeks !== null ? t("format.weeks", { weeks: parts.weeks }) : null]
    .filter(Boolean)
    .join(" · ");
  const response = order.firstResponseAt ? durationParts((Date.parse(order.firstResponseAt) - Date.parse(order.createdAt)) / 60000) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="pro-order-detail">
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-lg font-semibold text-fg">{order.title}</p>
            <p className="type-caption text-fg-muted">{meta}</p>
            <p className="type-caption text-fg-muted">{order.clientLabel ? tp("client", { name: order.clientLabel }) : tp("clientRemoved")}</p>
            <p className="type-caption text-fg-muted">{t("orders.placedAt", { date: format.dateTime(new Date(order.createdAt), { dateStyle: "medium", timeStyle: "short" }) })}</p>
            {response ? <p className="type-caption text-fg-muted">{t("admin.orders.response", { time: tp(`duration.${response.unit}`, { value: response.value }) })}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <OrderStatusBadge status={order.status} />
            <p className="type-numeric font-semibold text-fg">{formatCurrency(order.priceCents / 100, locale as Locale)}</p>
          </div>
        </div>
        {order.status === "scheduled" && order.scheduleNote ? (
          <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 type-body-sm text-fg">{t("orders.schedule", { note: order.scheduleNote })}</p>
        ) : null}
      </section>
      <OrderActions orderId={order.id} status={order.status} actor={actor} />
      <section aria-labelledby={`history-${order.id}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <h2 id={`history-${order.id}`} className="text-base font-semibold text-fg">
          {tp("history")}
        </h2>
        <OrderTimeline events={order.events} showSystem />
      </section>
    </div>
  );
}
