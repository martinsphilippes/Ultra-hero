import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AuthAlertProps = { tone?: "error" | "success" | "info"; children: ReactNode; className?: string };

// Mensagem de formulário (erro geral ou sucesso) anunciada por leitores de tela.
export function AuthAlert({ tone = "error", children, className }: AuthAlertProps) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        isError && "border-danger/30 bg-danger-soft text-danger",
        tone === "success" && "border-success/30 bg-success-soft text-success",
        tone === "info" && "border-info/30 bg-info-soft text-info",
        className,
      )}
    >
      {isError ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : tone === "info" ? (
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <p className="text-fg">{children}</p>
    </div>
  );
}
