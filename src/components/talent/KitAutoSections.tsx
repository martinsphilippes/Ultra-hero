import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { metricEntries, onTimeRate, type KitStats, type PortfolioItem } from "@/lib/talent/kit-auto";
import { formatCount } from "@/lib/talent/media-kit";

type Heading = "h2" | "h3";

// Números do media kit calculados na hora (0084): nada digitado de novo. Campos sem dado mostram "—".
export function KitStatsView({ stats, as: Sub = "h2" }: { stats: KitStats; as?: Heading }) {
  const t = useTranslations("mediaKit.auto");
  const tm = useTranslations("mediaKit.auto.metrics");
  const locale = useLocale() as Locale;
  const rate = onTimeRate(stats);
  const metrics = metricEntries(stats.metrics);
  const tile = (label: string, value: string, hint?: string) => (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-bg p-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="font-mono text-lg font-semibold text-fg">{value}</dd>
      {hint ? <dd className="type-caption text-fg-subtle">{hint}</dd> : null}
    </div>
  );
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="kit-stats" data-testid="kit-stats">
      <Sub id="kit-stats" className="text-sm font-semibold text-fg">
        {t("title")}
      </Sub>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tile(t("campaigns"), String(stats.completed_campaigns))}
        {tile(t("published"), String(stats.published_deliverables))}
        {tile(t("onTime"), rate === null ? "—" : `${rate}%`, rate === null ? undefined : t("onTimeBase", { count: stats.on_time_base }))}
        {tile(t("rating"), stats.rating_avg === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(stats.rating_avg)}/5`, stats.rating_count > 0 ? t("ratingCount", { count: stats.rating_count }) : undefined)}
        {stats.app_followers !== null ? tile(t("appFollowers"), formatCount(stats.app_followers, locale) ?? "0") : null}
        {metrics.map((m) => tile(tm(m.key), formatCount(m.value, locale) ?? "0"))}
      </dl>
      <p className="type-caption text-fg-muted">
        {stats.networks_updated_at ? t("networksUpdated", { date: formatPlainDate(stats.networks_updated_at.slice(0, 10), locale) }) : t("networksNever")}
        {stats.computed_at ? ` · ${t("computedAt", { date: formatDateTime(stats.computed_at, locale) })}` : null}
      </p>
    </section>
  );
}

// Portfólio (0084): campanhas feitas, marca e entregáveis publicados com link e métricas atuais.
export function PortfolioList({ items, as: Sub = "h2" }: { items: PortfolioItem[]; as?: Heading }) {
  const t = useTranslations("mediaKit.auto");
  const tm = useTranslations("mediaKit.auto.metrics");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="kit-portfolio" data-testid="kit-portfolio">
      <Sub id="kit-portfolio" className="text-sm font-semibold text-fg">
        {t("portfolio")}
      </Sub>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("portfolioEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li key={`${item.campaign}-${i}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{item.campaign}</span>
                <Badge size="sm">{item.brand}</Badge>
              </div>
              <ul className="flex flex-col gap-2">
                {item.deliverables.map((d) => {
                  const metrics = metricEntries(d.metrics);
                  return (
                    <li key={d.url} className="flex flex-col gap-1 rounded-xl bg-bg p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-fg">{d.title}</span>
                        <span className="type-caption text-fg-muted">
                          {d.network && (tn.has(d.network as never) ? tn(d.network as never) : d.network)}
                          {d.published_at ? ` · ${formatPlainDate(d.published_at.slice(0, 10), locale)}` : ""}
                        </span>
                      </div>
                      {metrics.length > 0 ? (
                        <p className="type-caption text-fg-muted">{metrics.map((m) => `${tm(m.key)} ${formatCount(m.value, locale)}`).join(" · ")}</p>
                      ) : null}
                      <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 w-fit items-center gap-1 text-xs font-medium text-accent-text underline-offset-2 hover:underline">
                        {t("openPost")}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
