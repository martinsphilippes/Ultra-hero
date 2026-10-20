import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { shiftDate, ymdToDate } from "./dates";

type Props = {
  /** Data local de hoje (YYYY-MM-DD) no fuso do usuário. */
  today: string;
  /** Contagem de atividades por data local. */
  countsByDate: Map<string, number>;
  days?: number;
  className?: string;
};

// Faixa dos últimos N dias: barras em CSS puro, cada dia com rótulo acessível (data + quantidade).
export async function ActivityStrip({ today, countsByDate, days = 14, className }: Props) {
  const [t, locale] = await Promise.all([getTranslations("me.evolution.activity"), getLocale()]);
  const uiLocale = locale as Locale;
  const dates = Array.from({ length: days }, (_, i) => shiftDate(today, i - (days - 1)));
  const max = Math.max(1, ...dates.map((d) => countsByDate.get(d) ?? 0));
  const weekday = new Intl.DateTimeFormat(uiLocale, { weekday: "narrow", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat(uiLocale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <section aria-labelledby="activity-strip-title" className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 id="activity-strip-title" className="type-h3 text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("description")}</p>
      </div>
      <ol className="grid grid-cols-7 gap-1.5 sm:grid-cols-14 sm:gap-2" aria-label={t("title")}>
        {dates.map((date) => {
          const count = countsByDate.get(date) ?? 0;
          const height = count === 0 ? 6 : Math.max(14, Math.round((count / max) * 44));
          const isToday = date === today;
          const label = `${longDate.format(ymdToDate(date))}${isToday ? ` (${t("today")})` : ""}`;
          return (
            <li key={date} className="flex flex-col items-center gap-1" aria-label={t("day", { date: label, n: count })}>
              <span aria-hidden="true" className="flex h-12 w-full items-end justify-center">
                <span
                  className={cn(
                    "block w-full max-w-5 rounded-full transition-[height]",
                    count > 0 ? "bg-accent" : "bg-border-strong",
                    isToday && count === 0 && "ring-1 ring-accent/60",
                  )}
                  style={{ height }}
                />
              </span>
              <span aria-hidden="true" className={cn("type-caption uppercase", isToday ? "font-bold text-accent-text" : "text-fg-muted")}>
                {weekday.format(ymdToDate(date))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
