import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { monthKey, shiftMonth } from "@/lib/calendar/ics";

type Props = { base: string; year: number; month: number; extraParams?: Record<string, string | undefined> };

// Navegação de mês por parâmetro (?mes=YYYY-MM) com <a> comum: mesma página, carga completa (docs/testing.md).
export function MonthNav({ base, year, month, extraParams = {} }: Props) {
  const t = useTranslations("commercial.agenda");
  const locale = useLocale() as Locale;
  const href = (y: number, m: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) if (v) params.set(k, v);
    params.set("mes", monthKey(y, m));
    return `${base}?${params.toString()}`;
  };
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  const link = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  return (
    <nav aria-label={t("monthNav")} className="flex items-center justify-between gap-2" data-testid="month-nav">
      <a href={href(prev.year, prev.month)} className={link} aria-label={t("prevMonth")}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </a>
      <h2 className="text-base font-semibold capitalize text-fg" aria-live="polite">
        {label}
      </h2>
      <a href={href(next.year, next.month)} className={link} aria-label={t("nextMonth")}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </a>
    </nav>
  );
}
