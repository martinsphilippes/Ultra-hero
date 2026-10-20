"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { cancelOrder } from "@/app/(app)/orders/actions";
import { ConfirmActionDialog } from "@/components/admin";

type Props = { orderId: string; disabled?: boolean };

// Cancelamento de pedido de teste com confirmação em 2 passos (sem justificativa obrigatória).
export function CancelOrderButton({ orderId, disabled }: Props) {
  const t = useTranslations("commerce.orders.detail");
  const te = useTranslations("commerce.errors");
  const router = useRouter();
  return (
    <ConfirmActionDialog
      triggerLabel={t("cancel")}
      triggerVariant="danger"
      triggerSize="md"
      title={t("cancelTitle")}
      description={t("cancelDescription")}
      confirmLabel={t("cancel")}
      destructive
      disabled={disabled}
      action={async () => {
        const result = await cancelOrder({ orderId });
        if (result.ok) {
          router.refresh();
          return { ok: true, message: t("cancelled") };
        }
        return { ok: false, error: te.has(result.error) ? te(result.error) : te("generic") };
      }}
    />
  );
}
