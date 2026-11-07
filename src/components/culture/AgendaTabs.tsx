import { CalendarDays, Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Rota da agenda do portal (ex.: /heroi/agenda). A Real-Time Culture fica em `${base}/cultura`. */
  base: string;
  active: "agenda" | "cultura";
};

// Segmento "Agenda | Cultura" no topo da agenda de cada portal (0101). A Real-Time Culture mora DENTRO da agenda (não
// muda a navegação geral do app nem dos portais) e consome o mesmo Calendário Groscove.
export function AgendaTabs({ base, active }: Props) {
  const t = useTranslations("culture.tabs");
  const item = (key: "agenda" | "cultura", href: string, icon: ReactNode, label: string) => (
    <Link
      href={href}
      scroll={false}
      aria-current={active === key ? "page" : undefined}
      data-testid={`agenda-tab-${key}`}
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors [&_svg]:size-4",
        active === key ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <nav aria-label={t("label")} className="flex gap-1 rounded-2xl border border-border bg-surface-hover p-1" data-testid="agenda-tabs">
      {item("agenda", base, <CalendarDays aria-hidden="true" />, t("agenda"))}
      {item("cultura", `${base}/cultura`, <Sparkles aria-hidden="true" />, t("culture"))}
    </nav>
  );
}
