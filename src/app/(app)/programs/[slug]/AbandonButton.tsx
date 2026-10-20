"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { abandonEnrollment } from "@/app/(app)/programs/actions";
import { useActionError } from "@/components/library";
import { Button, Dialog, useToast } from "@/components/ui";

type Props = { enrollmentId: string; path: string; className?: string };

// Abandonar inscrição ativa (progresso nos conteúdos continua salvo).
export function AbandonButton({ enrollmentId, path, className }: Props) {
  const t = useTranslations("consume.program");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const errorMessage = useActionError();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await abandonEnrollment({ enrollmentId, path });
      setOpen(false);
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      toast({ title: t("abandoned"), variant: "info" });
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className={className}>
        {t("abandon")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("abandonTitle")}
        description={t("abandonDescription")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={pending} data-autofocus>
              {t("abandon")}
            </Button>
          </>
        }
      />
    </>
  );
}
