import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/deals/schemas";

// Valor em reais; o app das lojas esconde valores (regra da 0072: native:hidden), a web mostra.
export function HeroMoney({ cents, locale, className }: { cents: number; locale: string; className?: string }) {
  return <span className={cn("tabular-nums native:hidden", className)}>{formatCents(cents, locale)}</span>;
}
