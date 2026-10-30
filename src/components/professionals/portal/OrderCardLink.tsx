import { ChevronRight } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ServiceOrderView } from "@/lib/professionals/queries";
import { OrderStatusBadge } from "../OrderParts";

/** Linha de pedido nas listas do portal e do admin (abre o detalhe). */
export function OrderCardLink({ order, href, showProfessional = false }: { order: ServiceOrderView; href: string; showProfessional?: boolean }) {
  const t = useTranslations("professionals.portal");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      data-testid="pro-order-row"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">{order.title}</span>
          <OrderStatusBadge status={order.status} />
        </span>
        <span className="type-caption text-fg-muted">
          {showProfessional && order.professional ? `${order.professional.name} · ` : ""}
          {order.clientLabel ? t("client", { name: order.clientLabel }) : t("clientRemoved")} · {format.dateTime(new Date(order.createdAt), { dateStyle: "short", timeStyle: "short" })}
        </span>
      </span>
      <span className="type-numeric text-sm font-semibold text-fg">{formatCurrency(order.priceCents / 100, locale)}</span>
      <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
    </Link>
  );
}
