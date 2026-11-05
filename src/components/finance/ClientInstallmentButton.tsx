"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useToast } from "@/components/ui";
import { setClientInstallmentAction } from "@/lib/finance/plan-actions";
import { cn } from "@/lib/utils";

// Parcela do Hero-cliente recebida / desfazer (Adm). O banco quita o lançamento quando todas estão recebidas.
export function ClientInstallmentButton({ installmentId, paid }: { installmentId: string; paid: boolean }) {
  const t = useTranslations("payments.client");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={paid ? t("markOpen") : t("markPaid")}
      title={paid ? t("markOpen") : t("markPaid")}
      onClick={() =>
        start(async () => {
          const result = await setClientInstallmentAction({ installmentId, paid: !paid });
          toast(result.ok ? { title: result.message, variant: "success" } : { title: result.error, variant: "error" });
        })
      }
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60"
      data-testid="client-installment-toggle"
    >
      {paid ? <CheckCircle2 className="size-6 text-success" aria-hidden="true" /> : <Circle className={cn("size-6", pending && "animate-pulse")} aria-hidden="true" />}
    </button>
  );
}
