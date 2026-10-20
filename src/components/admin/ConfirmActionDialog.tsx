"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Button, Dialog, FormField, Textarea, useToast, type ButtonVariant } from "@/components/ui";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

type Props = {
  /** Texto do botão que abre o diálogo. */
  triggerLabel: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: "sm" | "md" | "lg";
  title: ReactNode;
  description?: ReactNode;
  /** Exige justificativa (ações críticas auditadas). */
  requireJustification?: boolean;
  confirmLabel?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  /** Server Action que executa a operação. Recebe a justificativa (pode ser vazia). */
  action: (justification: string) => Promise<ActionResult>;
  children?: ReactNode;
};

// Confirmação padrão para ações administrativas críticas: 2 passos + justificativa + toast.
export function ConfirmActionDialog({
  triggerLabel,
  triggerVariant = "secondary",
  triggerSize = "sm",
  title,
  description,
  requireJustification = false,
  confirmLabel,
  destructive = false,
  disabled = false,
  action,
  children,
}: Props) {
  const t = useTranslations("adminCommon.confirm");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const missing = requireJustification && justification.trim().length < 5;

  function submit() {
    if (missing) {
      setError(t("justificationRequired"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action(justification.trim());
      if (result.ok) {
        toast({ title: result.message ?? t("done"), variant: "success" });
        setOpen(false);
        setJustification("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} disabled={disabled} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={title}
        description={description}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant={destructive ? "danger" : "primary"} onClick={submit} loading={pending}>
              {confirmLabel ?? tc("confirm")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {children}
          {requireJustification ? (
            <FormField label={t("justification")} hint={t("justificationHint")} error={error ?? undefined} required>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} maxLength={500} disabled={pending} />
            </FormField>
          ) : error ? (
            <p role="alert" className="text-sm text-danger">{error}</p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
