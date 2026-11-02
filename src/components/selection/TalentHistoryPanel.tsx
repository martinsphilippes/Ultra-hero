import { Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrandStatusBadge } from "@/components/deals/StatusBadges";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { BRAND_STATUSES, type BrandStatus } from "@/lib/deals/stages";
import { formatAvg, onTimePct } from "@/lib/selection/logic";
import type { TalentHistory } from "@/lib/selection/queries";

// Histórico do creator com a marca (0081): campanhas que a marca enxerga e as avaliações da equipe dela.
export async function TalentHistoryPanel({ history }: { history: TalentHistory }) {
  const [t, locale] = await Promise.all([getTranslations("selection.rating"), getLocale() as Promise<Locale>]);
  const s = history.summary;
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const status = (v: string): BrandStatus => ((BRAND_STATUSES as readonly string[]).includes(v) ? (v as BrandStatus) : "draft");
  return (
    <section className={card} aria-labelledby="talent-history" data-testid="talent-history">
      <div className="flex flex-col gap-1">
        <h2 id="talent-history" className="text-base font-semibold text-fg">
          {t("historyTitle")}
        </h2>
        <p className="type-caption text-fg-muted">{t("historyHint")}</p>
      </div>
      {s.count > 0 ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-fg" data-testid="talent-rating-summary">
          <Star className="size-4 fill-accent text-accent" aria-hidden="true" />
          {t("summary", {
            avg: formatAvg(s.avg, locale) ?? "—",
            count: s.count,
            pct: onTimePct(s) ?? 0,
          })}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t("campaigns")}</h3>
        {history.campaigns.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {history.campaigns.map((c, i) => (
              <li key={`${c.requestId ?? "c"}-${i}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  {c.requestId ? (
                    <Link href={`/marca/campanhas/${c.requestId}`} className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                      {c.title || "—"}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-fg">{c.title || "—"}</span>
                  )}
                  {c.periodStart ? <span className="type-caption text-fg-muted">{formatPlainDate(c.periodStart, locale)}</span> : null}
                </span>
                <BrandStatusBadge status={status(c.brandStatus)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{t("ratings")}</h3>
        {history.ratings.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("noRatings")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {history.ratings.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 py-2">
                <span className="text-sm font-medium text-fg">
                  {r.deliverableTitle || r.kind} · {r.campaignTitle}
                </span>
                <span className="type-caption text-fg-muted">
                  {t("done", {
                    quality: r.quality,
                    onTime: r.onTime ? t("onTimeYes") : t("onTimeNo"),
                    name: r.ratedLabel || "—",
                    date: formatDateTime(r.createdAt, locale),
                  })}
                </span>
                {r.comment ? <span className="type-body-sm text-fg">“{r.comment}”</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
