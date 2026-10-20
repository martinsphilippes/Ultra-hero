import { ArrowRight, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { MiniBarChart, type DailyPoint } from "@/components/admin-ops/MiniBarChart";
import { parsePeriod, PeriodSelector } from "@/components/admin-ops/PeriodSelector";
import { Badge, Button, DemoBadge, ErrorState, PageHeader, Skeleton, VisuallyHidden } from "@/components/ui";
import { formatCurrency, formatNumber, formatPercent } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.dashboard")}` };
}

type SearchParams = Promise<{ days?: string }>;

// Painel do admin: KPIs do admin_metrics, mini-gráfico diário, kill switches e pendências.
export default async function AdminHomePage({ searchParams }: { searchParams: SearchParams }) {
  const { days: rawDays } = await searchParams;
  const days = parsePeriod(rawDays);
  const t = await getTranslations("adminOps.dashboard");
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={(await getTranslations("nav"))("portals.admin")} actions={<PeriodSelector value={days} />} />
      <Suspense key={days} fallback={<DashboardSkeleton />}>
        <DashboardContent days={Number(days)} />
      </Suspense>
    </div>
  );
}

type Metrics = Record<string, unknown>;
const num = (m: Metrics, key: string) => (typeof m[key] === "number" ? (m[key] as number) : 0);

async function DashboardContent({ days }: { days: number }) {
  const supabase = await createClient();
  const [t, tn, locale, metricsRes, settingsRes, inReview, suggested, newFeedback, awaiting] = await Promise.all([
    getTranslations("adminOps.dashboard"),
    getTranslations("nav.admin"),
    getLocale(),
    supabase.rpc("admin_metrics", { p_days: days }),
    supabase.from("app_settings").select("key, value").in("key", ["commerce.enabled", "ai.enabled", "experiment.open"]),
    supabase.from("content").select("id", { count: "exact", head: true }).eq("review_status", "in_review"),
    supabase.from("content_product_links").select("id", { count: "exact", head: true }).eq("status", "suggested"),
    supabase.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("test_fulfillments").select("id", { count: "exact", head: true }).eq("status", "awaiting"),
  ]);

  if (metricsRes.error || !metricsRes.data || typeof metricsRes.data !== "object" || Array.isArray(metricsRes.data)) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <ErrorState title={t("loadError")} description={metricsRes.error?.message} />
      </div>
    );
  }
  const m = metricsRes.data as Metrics;
  const daily = (Array.isArray(m.daily) ? m.daily : []) as DailyPoint[];
  const settings = new Map((settingsRes.data ?? []).map((s) => [s.key, s.value]));
  const n = (v: number) => formatNumber(v, locale);

  const pending = [
    { key: "inReview", count: inReview.count ?? 0, href: "/admin/content", nav: tn("content") },
    { key: "suggestedLinks", count: suggested.count ?? 0, href: "/admin/links", nav: tn("links") },
    { key: "newFeedback", count: newFeedback.count ?? 0, href: "/admin/feedback?status=new", nav: tn("feedback") },
    { key: "awaitingFulfillments", count: awaiting.count ?? 0, href: "/admin/orders", nav: tn("orders") },
  ] as const;

  const switches = [
    { key: "commerce.enabled", label: t("incidents.commerce") },
    { key: "ai.enabled", label: t("incidents.ai") },
    { key: "experiment.open", label: t("incidents.experiment") },
  ];

  return (
    <>
      <section aria-labelledby="kpis-title" className="flex flex-col gap-3">
        <h2 id="kpis-title" className="type-h2 text-fg">
          {t("kpis.heading")}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <KpiCard label={t("kpis.signups")} value={n(num(m, "signups"))} hint={t("kpis.signupsTotal", { count: n(num(m, "signups_total")) })} />
          <KpiCard label={t("kpis.activated")} value={n(num(m, "activated_users_distinct"))} hint={t("kpis.activatedHint")} />
          <KpiCard label={t("kpis.contentViews")} value={n(num(m, "content_views"))} />
          <KpiCard label={t("kpis.completions")} value={n(num(m, "completions"))} />
          <KpiCard label={t("kpis.enrollments")} value={n(num(m, "enrollments"))} />
          <KpiCard label={t("kpis.activeSubscriptions")} value={n(num(m, "active_simulated_subscriptions"))} hint={t("kpis.activeSubscriptionsHint")} tag={<DemoBadge size="sm" />} tagVariant="demo" />
          <KpiCard label={t("kpis.subscriptionInterest")} value={n(num(m, "subscription_interest"))} />
          <KpiCard label={t("kpis.commercialInterest")} value={n(num(m, "commercial_interest"))} />
          <KpiCard label={t("kpis.cartAdds")} value={n(num(m, "cart_adds"))} />
          <KpiCard label={t("kpis.testOrders")} value={n(num(m, "test_orders"))} tag={<DemoBadge size="sm" />} />
          <KpiCard label={t("kpis.testOrdersTotal")} value={formatCurrency(num(m, "test_orders_total_cents_demo") / 100, locale)} tag={<DemoBadge size="sm" />} />
          <KpiCard label={t("kpis.realRevenue")} value={formatCurrency(0, locale)} hint={t("kpis.realRevenueValue")} tone="muted" />
          <KpiCard label={t("kpis.recommendationRuns")} value={n(num(m, "recommendation_runs"))} hint={t("kpis.fallbackShare", { share: formatPercent(num(m, "recommendation_fallback_share"), locale) })} />
          <KpiCard label={t("kpis.feedback")} value={n(num(m, "feedback"))} />
          <KpiCard label={t("kpis.criticalErrors")} value={n(num(m, "critical_errors"))} tone={num(m, "critical_errors") > 0 ? "danger" : "default"} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="chart-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lg:col-span-3">
          <div>
            <h2 id="chart-title" className="type-h3 text-fg">
              {t("chart.title", { days })}
            </h2>
            <p className="type-caption text-fg-muted">{t("chart.description")}</p>
          </div>
          <MiniBarChart data={daily} />
        </section>

        <section aria-labelledby="incidents-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 lg:col-span-2">
          <div>
            <h2 id="incidents-title" className="type-h3 text-fg">
              {t("incidents.title")}
            </h2>
            <p className="type-caption text-fg-muted">{t("incidents.description")}</p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {switches.map((s) => {
              const on = settings.get(s.key) === true;
              return (
                <li key={s.key} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-fg">{s.label}</span>
                  <Badge variant={on ? "success" : "danger"}>{on ? t("incidents.on") : t("incidents.off")}</Badge>
                </li>
              );
            })}
          </ul>
          <Button asChild variant="secondary" size="sm" className="self-start">
            <Link href="/admin/settings">
              <Settings2 className="size-4" aria-hidden="true" />
              {t("incidents.manage")}
            </Link>
          </Button>
        </section>
      </div>

      <section aria-labelledby="pending-title" className="flex flex-col gap-3">
        <div>
          <h2 id="pending-title" className="type-h2 text-fg">
            {t("pending.title")}
          </h2>
          <p className="type-caption text-fg-muted">{t("pending.description")}</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {pending.map((p) => (
            <li key={p.key}>
              <Link
                href={p.href}
                className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t(`pending.${p.key}`)}</span>
                <span className="flex items-end justify-between gap-2">
                  <span className="type-numeric text-2xl font-bold text-fg">{n(p.count)}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-text">
                    {t("pending.open")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                    <VisuallyHidden>{p.nav}</VisuallyHidden>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

async function DashboardSkeleton() {
  const t = await getTranslations("common.states");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-8">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-56 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
