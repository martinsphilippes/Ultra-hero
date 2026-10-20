"use client";

import { useTranslations } from "next-intl";
import { setAccountSuspended } from "@/app/admin/ops-actions";
import { ConfirmActionDialog } from "@/components/admin";

type Props = { userId: string; suspended: boolean; disabled?: boolean };

// Suspender/reativar conta de consumidor: 2 passos + justificativa (auditada no banco).
export function AccountSuspensionButton({ userId, suspended, disabled = false }: Props) {
  const t = useTranslations("adminOps.users.suspension");
  const suspend = !suspended;
  return (
    <ConfirmActionDialog
      triggerSize="md"
      triggerLabel={suspend ? t("suspend") : t("reactivate")}
      triggerVariant={suspend ? "ghost" : "secondary"}
      title={suspend ? t("suspendTitle") : t("reactivateTitle")}
      description={suspend ? t("suspendDescription") : t("reactivateDescription")}
      confirmLabel={suspend ? t("suspend") : t("reactivate")}
      requireJustification
      destructive={suspend}
      disabled={disabled}
      action={(justification) => setAccountSuspended({ userId, suspended: suspend }, justification)}
    >
      {suspend && <p className="type-caption text-fg-muted">{t("sessionNote")}</p>}
    </ConfirmActionDialog>
  );
}
