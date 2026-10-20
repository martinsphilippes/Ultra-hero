"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/components/admin";
import { Button, IconButton, useToast, type ButtonVariant } from "@/components/ui";

type Props = {
  action: () => Promise<ActionResult>;
  children?: ReactNode;
  /** Modo ícone: exige `label`. */
  icon?: ReactNode;
  label?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  /** Atualiza a rota após sucesso (padrão: sim). */
  refresh?: boolean;
  onDone?: (result: ActionResult) => void;
};

// Botão que dispara uma Server Action sem confirmação, com toast de resultado.
// Para ações críticas use ConfirmActionDialog (2 passos + justificativa).
export function ActionButton({ action, children, icon, label, variant = "secondary", size = "sm", disabled, className, refresh = true, onDone }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast({ title: result.message, variant: "success" });
        if (refresh) router.refresh();
      } else {
        toast({ title: result.error, variant: "error" });
      }
      onDone?.(result);
    });
  }

  if (icon && label && !children) {
    return <IconButton icon={icon} label={label} variant={variant} size={size} onClick={run} loading={pending} disabled={disabled} className={className} />;
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={run} loading={pending} disabled={disabled} className={className} leadingIcon={icon}>
      {children}
    </Button>
  );
}
