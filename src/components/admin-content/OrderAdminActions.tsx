"use client";

import { useTranslations } from "next-intl";
import { cancelOrderAction, transitionFulfillmentAction } from "@/app/admin/orders/actions";
import { ConfirmActionDialog } from "@/components/admin";

type FStatus = "awaiting" | "preparing" | "ready_for_dispatch" | "in_transit" | "delivered" | "cancelled" | "failed";
type Target = "preparing" | "ready_for_dispatch" | "in_transit" | "delivered" | "failed" | "cancelled";

// Transições permitidas ao admin (espelha fulfillment_transition no SQL).
const ADMIN_TRANSITIONS: Record<FStatus, Target[]> = {
  awaiting: ["preparing", "cancelled"],
  preparing: ["ready_for_dispatch", "cancelled"],
  ready_for_dispatch: ["in_transit", "cancelled"],
  in_transit: ["delivered", "failed"],
  delivered: [],
  cancelled: [],
  failed: [],
};

export function FulfillmentActions({ orderId, fulfillmentId, status }: { orderId: string; fulfillmentId: string; status: FStatus }) {
  const t = useTranslations("adminContent.orders.actions");
  const ts = useTranslations("adminCommon.status");
  const targets = ADMIN_TRANSITIONS[status] ?? [];
  if (targets.length === 0) return <p className="type-caption text-fg-muted">{t("noTransitions")}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((to) => (
        <ConfirmActionDialog
          key={to}
          triggerLabel={t("transition", { status: ts(to) })}
          triggerVariant={to === "cancelled" || to === "failed" ? "danger" : "secondary"}
          destructive={to === "cancelled" || to === "failed"}
          title={t("transitionTitle", { status: ts(to) })}
          description={t("transitionDescription")}
          requireJustification={to === "cancelled" || to === "failed"}
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
