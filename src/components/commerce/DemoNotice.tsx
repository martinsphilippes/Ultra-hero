import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  tone?: "warning" | "info" | "success";
  className?: string;
  /** role=status para avisos permanentes; alert para mudanças importantes. */
  live?: "status" | "alert";
};

const tones = {
  warning: "border-warning/30 bg-warning-soft text-fg [&_svg]:text-warning",
  info: "border-info/30 bg-info-soft text-fg [&_svg]:text-info",
  success: "border-success/30 bg-success-soft text-fg [&_svg]:text-success",
};

// Faixa de aviso do comércio demonstrativo (sem pagamento, destino fictício, dados anonimizados…).
export function DemoNotice({ children, tone = "warning", className, live = "status" }: Props) {
  return (
    <div role={live} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", tones[tone], className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="type-body-sm flex-1 text-balance">{children}</div>
    </div>
  );
}
