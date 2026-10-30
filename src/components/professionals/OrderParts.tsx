import { useFormatter, useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { ServiceOrderEvent } from "@/lib/professionals/queries";
import type { OrderStatus } from "@/lib/professionals/rules";

// Peças dos pedidos de serviço (0058) usadas no Minhas compras, no portal e no admin.

export const ORDER_BADGE: Record<OrderStatus, BadgeVariant> = {
  pending: "warning",
  accepted: "info",
  scheduled: "accent",
  completed: "success",
  declined: "neutral",
  cancelled: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("professionals.orders.status");
  return (
    <Badge variant={ORDER_BADGE[status]} size="sm" data-testid="service-order-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}

/** Histórico com recados (mudanças sem recado do sistema ficam de fora). */
export function OrderTimeline({ events, showSystem = false }: { events: ServiceOrderEvent[]; showSystem?: boolean }) {
  const t = useTranslations("professionals.orders");
  const format = useFormatter();
  const shown = events.filter((e) => showSystem || e.note || e.fromStatus !== e.toStatus);
  if (shown.length === 0) return null;
  return (
    <ol className="flex flex-col gap-2 border-l border-border pl-3">
      {shown.map((e) => (
        <li key={e.id} className="flex flex-col gap-0.5">
          <p className="type-caption text-fg-muted">
            <span className="font-semibold text-fg">{t.has(`actor.${e.actorType}`) ? t(`actor.${e.actorType}`) : e.actorType}</span>
            {" · "}
            {e.fromStatus !== e.toStatus ? `${t(`status.${e.toStatus as OrderStatus}`)} · ` : ""}
            {format.dateTime(new Date(e.createdAt), { dateStyle: "short", timeStyle: "short" })}
          </p>
          {e.note ? <p className="type-body-sm whitespace-pre-line text-fg">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
