import { Handshake } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ServiceOrderView } from "@/lib/professionals/queries";
import { serviceFormatParts } from "@/lib/professionals/rules";
import { CancelServiceOrderButton } from "./CancelServiceOrderButton";
import { OrderStatusBadge, OrderTimeline } from "./OrderParts";

// Minhas compras → Serviços (0058): situação de cada pedido, agenda e recados do profissional.
export async function ServiceOrdersList({ orders, fresh }: { orders: ServiceOrderView[]; fresh: boolean }) {
  const [t, locale, format] = await Promise.all([getTranslations("professionals"), getLocale(), getFormatter()]);
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
          icon={<Handshake />}
          title={t("orders.empty")}
          action={
            <Button asChild>
              <Link href="/profissionais">{t("orders.emptyAction")}</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {fresh ? (
        <p role="status" className="rounded-2xl border border-success/30 bg-success-soft p-4 type-body-sm font-medium text-fg">
          {t("orders.newBanner")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {orders.map((order) => {
          const parts = serviceFormatParts(order);
          const meta = [t(`mode.${parts.mode}`), parts.minutes !== null ? t("format.minutes", { minutes: parts.minutes }) : null, parts.weeks !== null ? t("format.weeks", { weeks: parts.weeks }) : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={order.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="service-order">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold text-fg">{order.title}</p>
                  {order.professional ? (
                    <Link href={`/profissionais/${order.professional.slug}`} className="type-caption font-semibold text-accent-text hover:underline">
                      {order.professional.name} · {t(`specialty.${order.professional.specialty}`)}
                    </Link>
                  ) : null}
                  <p className="type-caption text-fg-muted">{meta}</p>
                  <p className="type-caption text-fg-muted">{t("orders.placedAt", { date: format.dateTime(new Date(order.createdAt), { dateStyle: "medium" }) })}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <OrderStatusBadge status={order.status} />
                  <p className="type-numeric text-sm font-semibold text-fg">{formatCurrency(order.priceCents / 100, locale as Locale)}</p>
                </div>
              </div>
              {order.status === "scheduled" && order.scheduleNote ? (
                <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 type-body-sm text-fg">{t("orders.schedule", { note: order.scheduleNote })}</p>
              ) : null}
              <OrderTimeline events={order.events} />
              {order.status === "pending" ? (
                <div className="flex justify-end">
                  <CancelServiceOrderButton orderId={order.id} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
