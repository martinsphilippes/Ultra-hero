"use client";

import { Ban, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { cancelPlatformEventAction, deletePlatformEventAction } from "@/lib/platform-calendar/actions";

type Props = { id: string; title: string; canCancel: boolean; canDelete: boolean };

// Cancelar (o que já esteve no ar: continua visível, riscado) ou excluir (rascunho/programado ainda não publicado).
export function PlatformEventAdminActions({ id, title, canCancel, canDelete }: Props) {
  const t = useTranslations("groscoveCalendar.admin");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!canCancel && !canDelete) return null;

  function cancel() {
    start(async () => {
      const result = await cancelPlatformEventAction({ id, reason });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!window.confirm(t("confirmDelete", { title }))) return;
    start(async () => {
      const result = await deletePlatformEventAction({ id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (result.ok) router.push("/admin/agenda");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canCancel ? (
        <Button type="button" variant="secondary" leadingIcon={<Ban />} onClick={() => setOpen(true)} disabled={pending} data-testid="platform-cancel">
          {t("cancel")}
        </Button>
      ) : null}
      {canDelete ? (
        <Button type="button" variant="ghost" leadingIcon={<Trash2 />} onClick={remove} disabled={pending} data-testid="platform-delete">
          {t("delete")}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("cancelTitle")}
        description={t("cancelHint")}
        footer={
          <Button type="button" variant="danger" onClick={cancel} disabled={pending} data-testid="platform-cancel-confirm">
            {t("cancelConfirm")}
          </Button>
        }
      >
        <FormField label={t("cancelReason")} optionalLabel={t("optional")}>
          <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </Dialog>
    </div>
  );
}
