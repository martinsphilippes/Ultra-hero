"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setCreatorProduct, type CreatorProductStatus } from "@/app/admin/ops-actions";
import { ConfirmActionDialog, type ActionResult } from "@/components/admin";

type Props = {
  creatorId: string;
  productId: string;
  /** Status atual da alocação; null = sem alocação. */
  status: string | null;
};

// Validar / suspender / rejeitar a alocação produto↔herói (2 passos; a nota vai para a auditoria).
// Validar não exige justificativa; suspender e rejeitar exigem, como nos vínculos por conteúdo.
export function CreatorProductActions({ creatorId, productId, status }: Props) {
  const t = useTranslations("adminOps.creators.products.actions");
  const router = useRouter();

  function run(next: CreatorProductStatus) {
    return async (note: string): Promise<ActionResult> => {
      const result = await setCreatorProduct({ creatorId, productId, status: next }, note);
      if (result.ok) router.refresh();
      return result;
    };
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status !== "validated" && (
        <ConfirmActionDialog triggerLabel={t("validate")} triggerVariant="primary" title={t("validateTitle")} description={t("validateDescription")} confirmLabel={t("validate")} action={run("validated")} />
      )}
      {status !== "suspended" && status !== "rejected" && (
        <ConfirmActionDialog triggerLabel={t("suspend")} title={t("suspendTitle")} description={t("suspendDescription")} requireJustification action={run("suspended")} />
      )}
      {status !== "rejected" && (
        <ConfirmActionDialog triggerLabel={t("reject")} triggerVariant="danger" destructive title={t("rejectTitle")} description={t("rejectDescription")} requireJustification action={run("rejected")} />
      )}
    </div>
  );
}
