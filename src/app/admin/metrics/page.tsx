import { Download } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { parsePeriod, PeriodSelector } from "@/components/admin-ops/PeriodSelector";
import { Button, DemoBadge, ErrorState, PageHeader, ProgressBar } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.metrics")}` };
}

type SearchParams = Promise<{ days?: string }>;
type Metrics = Record<string, unknown>;
const num = (m: Metrics, key: string) => (typeof m[key] === "number" ? (m[key] as number) : 0);

// Métricas agregadas: funil, eventos por nome, série diária e exportação CSV (sem ids de usuário).
export default async function AdminMetricsPage({ searchParams }: { searchParams: SearchParams }) {
  const { days: rawDays } = await searchParams;
  const period = parsePeriod(rawDays);
  const days = Number(period);
  const supabase = await createClient();
  const [t, tk, tn, locale, res] = await Promise.all([
    getTranslations("adminOps.metrics"),
    getTranslations("adminOps.dashboard.kpis"),
    getTranslations("nav"),
    getLocale(),
    supabase.rpc("admin_metrics", { p_days: days }),
  ]);

  const header = (
    <PageHeader
      title={t("title")}
      description={t("description")}
      eyebrow={tn("portals.admin")}
      actions={
        <>
          <PeriodSelector value={period} />
          <Button asChild variant="secondary" size="sm">
            <a href={`/admin/metrics/export?days=${days}`} title={t("exportHint")}>
              <Download className="size-4" aria-hidden="true" />
              {t("export")}
            </a>
          </Button>
        </>
      }
    />
  );

  if (res.error || !res.data || typeof res.data !== "object" || Array.isArray(res.data)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-2xl border border-border bg-surface">
          <ErrorState description={res.error?.message} />
        </div>
      </div>
    );
  }
  const m = res.data as Metrics;
  const n = (v: number) => formatNumber(v, locale);
  const events = Object.entries((m.events_by_name ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const daily = (Array.isArray(m.daily) ? m.daily : []) as { day: string; signups: number; events: number }[];

  const funnel = [
    { key: "signups", value: num(m, "signups") },
    { key: "activated", value: num(m, "activated_users_distinct") },
    { key: "enrollments", value: num(m, "enrollments") },
    { key: "subscriptionInterest", value: num(m, "subscription_interest") },
    { key: "commercialInterest", value: num(m, "commercial_interest") },
    { key: "testOrders", value: num(m, "test_orders") },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="flex flex-col gap-8">
      {header}
      <p className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
        <DemoBadge size="sm" />
        {t("disclaimer")}
      </p>

      <section aria-labelledby="funnel-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div>
          <h2 id="funnel-title" className="type-h3 text-fg">
            {t("funnel.title")}
          </h2>
          <p className="type-caption text-fg-muted">{t("funnel.description")}</p>
        </div>
        <ol className="flex flex-col gap-3">
          {funnel.map((step, i) => {
            const prev = i > 0 ? funnel[i - 1].value : 0;
            const share = i > 0 && prev > 0 ? step.value / prev : null;
            return (
              <li key={step.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-fg">{t(`funnel.${step.key}`)}</span>
                  <span className="type-numeric text-fg">
                    {n(step.value)}
                    {share !== null && <span className="ml-2 type-caption text-fg-muted">{t("funnel.ofPrevious", { share: formatPercent(share, locale) })}</span>}
                  </span>
                </div>
                <ProgressBar value={step.value} max={funnelMax} label={t(`funnel.${step.key}`)} size="sm" tone={i >= 3 ? "warning" : "accent"} />
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("funnel.testOrders")} value={formatCurrency(num(m, "test_orders_total_cents_demo") / 100, locale)} tag={<DemoBadge size="sm" />} />
        <KpiCard label={tk("realRevenue")} value={formatCurrency(0, locale)} hint={tk("realRevenueValue")} tone="muted" />
        <KpiCard label={t("recommendations.runs")} value={n(num(m, "recommendation_runs"))} />
        <KpiCard label={t("recommendations.fallback")} value={formatPercent(num(m, "recommendation_fallback_share"), locale)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="events-title" className="flex flex-col gap-3">
          <h2 id="events-title" className="type-h3 text-fg">
            {t("events.title")}
          </h2>
          {events.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("events.empty")}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("events.tableCaption")}</caption>
                <thead className="bg-surface-elevated text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2">
                      {t("events.name")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      {t("events.count")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map(([name, count]) => (
                    <tr key={name}>
                      <td className="px-4 py-2 font-mono text-xs text-fg">{name}</td>
                      <td className="px-4 py-2 text-right type-numeric text-fg">{n(count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="daily-title" className="flex flex-col gap-3">
          <h2 id="daily-title" className="type-h3 text-fg">
            {t("daily.title")}
          </h2>
          <div className="max-h-96 overflow-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("daily.tableCaption")}</caption>
              <thead className="sticky top-0 bg-surface-elevated text-left text-xs font-semibold uppercase tracking-wider text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    {t("daily.day")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    {t("daily.signups")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    {t("daily.events")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {daily.map((d) => (
                  <tr key={d.day}>
                    <td className="px-4 py-2 type-numeric text-fg">{formatDate(d.day, locale, { day: "2-digit", month: "2-digit", year: "numeric" }, "UTC")}</td>
                    <td className="px-4 py-2 text-right type-numeric text-fg">{n(d.signups)}</td>
                    <td className="px-4 py-2 text-right type-numeric text-fg">{n(d.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
