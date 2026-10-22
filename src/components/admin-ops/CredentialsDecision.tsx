"use client";

import { useTranslations } from "next-intl";
import { decideCreatorCredentials } from "@/app/admin/creators/credentials-actions";
import { ConfirmActionDialog } from "@/components/admin";

// Aprovar ou reprovar o pedido de credenciais de um herói (justificativa obrigatória, auditada).
// `text` é o texto que a fila mostrou: a decisão só vale se o pedido ainda for esse.
export function CredentialsDecision({ creatorId, name, text, canApprove, canReject }: { creatorId: string; name: string; text: string; canApprove: boolean; canReject: boolean }) {
  const t = useTranslations("recipes.admin.credentials");
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {canApprove && (
        <ConfirmActionDialog
          triggerLabel={t("approve")}
          triggerVariant="primary"
          title={t("approveTitle", { name })}
          description={t("approveDescription")}
          requireJustification
          action={(justification) => decideCreatorCredentials({ creatorId, approved: true, expectedText: text }, justification)}
        />
      )}
      {canReject && (
        <ConfirmActionDialog
          triggerLabel={t("reject")}
          title={t("rejectTitle", { name })}
          description={t("rejectDescription")}
          requireJustification
          destructive
          action={(justification) => decideCreatorCredentials({ creatorId, approved: false, expectedText: text }, justification)}
        />
      )}
    </span>
  );
}
