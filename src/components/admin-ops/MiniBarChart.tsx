import { getTranslations } from "next-intl/server";
import { formatDate } from "@/i18n/format";
import { getLocale } from "@/i18n/server";

export type DailyPoint = { day: string; signups: number; events: number };

// Mini-gráfico de barras em CSS (sem biblioteca): cadastros e eventos por dia.
// Cada dia é um item de lista com rótulo acessível; a escala é independente por série.
export async function MiniBarChart({ data }: { data: DailyPoint[] }) {
  const [t, locale] = await Promise.all([getTranslations("adminOps.dashboard.chart"), getLocale()]);
  if (data.length === 0) return <p className="type-body-sm text-fg-muted">{t("empty")}</p>;

  const maxSignups = Math.max(1, ...data.map((d) => d.signups));
  const maxEvents = Math.max(1, ...data.map((d) => d.events));

  return (
    <figure className="flex flex-col gap-3">
      <ul className="flex h-36 items-end gap-1" aria-label={t("description")}>
        {data.map((d) => {
          const date = formatDate(d.day, locale, { day: "2-digit", month: "2-digit" }, "UTC");
          return (
            <li key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5" aria-label={t("bar", { date, signups: d.signups, events: d.events })}>
              <div className="flex h-full items-end gap-px">
                <span aria-hidden="true" className="block w-1/2 rounded-t-sm bg-accent" style={{ height: `${Math.max(2, (d.signups / maxSignups) * 100)}%` }} />
                <span aria-hidden="true" className="block w-1/2 rounded-t-sm bg-info/70" style={{ height: `${Math.max(2, (d.events / maxEvents) * 100)}%` }} />
              </div>
              <span aria-hidden="true" className="hidden truncate text-center text-[0.625rem] text-fg-subtle sm:block">
                {date}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="flex flex-wrap items-center gap-4 type-caption text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-accent" />
          {t("signups")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-info/70" />
          {t("events")}
        </span>
      </figcaption>
    </figure>
  );
}
