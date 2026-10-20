"use client";

import { useTranslations } from "next-intl";
import { deleteLink } from "@/app/creator/links/actions";
import { ConfirmActionDialog } from "@/components/admin";

// Exclui um vínculo ainda "sugerido" (RLS impede excluir validados/suspensos/rejeitados).
export function DeleteLinkButton({ id, productTitle }: { id: string; productTitle: string }) {
  const t = useTranslations("creator.links");
  const te = useTranslations("creator.errors");
  const tc = useTranslations("common.actions");
  return (
    <ConfirmActionDialog
      triggerLabel={tc("delete")}
      triggerVariant="ghost"
      title={t("deleteTitle")}
      description={t("deleteDescription", { product: productTitle })}
      destructive
      confirmLabel={tc("delete")}
      action={async () => {
        const result = await deleteLink({ id });
        if (result.ok) return { ok: true, message: t("deleted") };
        const key = result.error.split(":")[0].trim();
        return { ok: false, error: te.has(key) ? te(key) : te("generic") };
      }}
    />
  );
}
