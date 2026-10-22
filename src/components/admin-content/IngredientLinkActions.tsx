"use client";

import { useTranslations } from "next-intl";
import { setIngredientLinkStatusAction } from "@/app/admin/links/ingredient-actions";
import { ConfirmActionDialog } from "@/components/admin";

type Status = "suggested" | "validated" | "suspended" | "rejected";

// Validar / suspender / recusar um vínculo ingrediente ↔ produto (2 passos). Recusar e suspender
// pedem motivo (mínimo de 5 caracteres), que fica na auditoria e aparece para o herói no editor.
export function IngredientLinkActions({ linkId, status, label }: { linkId: string; status: Status; label: string }) {
  const t = useTranslations("shopping.admin.actions");
  return (
    <div className="flex flex-wrap justify-end gap-1.5" role="group" aria-label={label}>
      {status !== "validated" && (
        <ConfirmActionDialog
          triggerLabel={t("validate")}
          triggerVariant="primary"
          triggerSize="md"
          title={t("validateTitle")}
          description={t("validateDescription")}
          confirmLabel={t("validate")}
          action={(note) => setIngredientLinkStatusAction(linkId, "validated", note)}
        />
      )}
      {status === "validated" && (
        <ConfirmActionDialog triggerLabel={t("suspend")} triggerSize="md" title={t("suspendTitle")} requireJustification action={(note) => setIngredientLinkStatusAction(linkId, "suspended", note)} />
      )}
      {status !== "rejected" && (
        <ConfirmActionDialog
          triggerLabel={t("reject")}
          triggerVariant="danger"
          triggerSize="md"
          destructive
          title={t("rejectTitle")}
          requireJustification
          action={(note) => setIngredientLinkStatusAction(linkId, "rejected", note)}
        />
      )}
    </div>
  );
}
