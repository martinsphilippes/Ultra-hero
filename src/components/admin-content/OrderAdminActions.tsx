"use client";

import { useTranslations } from "next-intl";
import { cancelOrderAction, transitionFulfillmentAction } from "@/app/admin/orders/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { adminTargetsFor, transitionNeedsJustification, type FulfillmentStatus } from "@/lib/seller-ops/shipments";

// Transições permitidas ao admin (espelha fulfillment_transition no SQL; usada em Pedidos e Remessas).
export function FulfillmentActions({ orderId, fulfillmentId, status }: { orderId: string; fulfillmentId: string; status: FulfillmentStatus }) {
  const t = useTranslations("adminContent.orders.actions");
  const ts = useTranslations("adminCommon.status");
  const targets = adminTargetsFor(status);
  if (targets.length === 0) return <p className="type-caption text-fg-muted">{t("noTransitions")}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((to) => (
        <ConfirmActionDialog
          key={to}
          triggerLabel={t("transition", { status: ts(to) })}
          triggerVariant={transitionNeedsJustification(to) ? "danger" : "secondary"}
          destructive={transitionNeedsJustification(to)}
          title={t("transitionTitle", { status: ts(to) })}
          description={t("transitionDescription")}
          requireJustification={transitionNeedsJustification(to)}
          action={(note) => transitionFulfillmentAction(orderId, fulfillmentId, to, note)}
        />
      ))}
    </div>
  );
}

export function CancelOrderButton({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const t = useTranslations("adminContent.orders.actions");
  return (
    <ConfirmActionDialog
      triggerLabel={t("cancelOrder")}
      triggerVariant="danger"
      destructive
      title={t("cancelTitle")}
      description={t("cancelDescription")}
      requireJustification
      disabled={disabled}
      action={(j) => cancelOrderAction(orderId, j)}
    />
  );
}
