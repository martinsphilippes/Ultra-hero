import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Info } from "lucide-react";
import { ymdToDate } from "@/components/me/dates";
import { TrendChart, type TrendPoint } from "@/components/me/today/TrendChart";
import { WatchDemoLabel } from "@/components/me/today/WatchToday";
import { indexCardKind, sectionAvailable, sectionPoints, trendCodes, usualRange } from "@/components/me/today/watch-helpers";
import { DemoBadge, PageHeader } from "@/components/ui";
import { isDetailSection, metricDef, MODEL_INFO, type MetricCode } from "@/lib/wearables/catalog";
import type { MetricPoint, WatchSnapshot } from "@/lib/wearables/demo";
import { getNativeApp } from "@/lib/native-app/server";
import { formatClock, formatDecimal, formatMetric } from "@/lib/wearables/format";
import { cn } from "@/lib/utils";
import { loadWatchView, wantsExample } from "../view";

type Params = { section: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { section } = await params;
  const [t, tw] = await Promise.all([getTranslations("me.today.detail"), getTranslations("wearables.sections")]);
  return { title: isDetailSection(section) ? t("metaTitle", { section: tw(section) }) : undefined };
}

// Só o que acumula ao longo do dia fica "parcial" hoje; a noite já está fechada.
const PARTIAL_SECTIONS = new Set(["activity", "workouts", "stress", "environment"]);
const ZERO_BASED = new Set<MetricCode>(["steps", "sleep_asleep_min", "cardio_load_day_uh", "daylight_min", "body_battery_high", "disposition_uh", "stress_avg"]);

// Detalhe por categoria: o que o relógio mediu (v1 e v1d), com horário e fonte; tendência de 7 ou
// 30 dias contra a faixa habitual; como é medido; e o aviso de bem-estar. Só leitura.
export default async function TodayDetailPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const [{ section }, search] = await Promise.all([params, searchParams]);
  if (!isDetailSection(section)) notFound();
  const example = wantsExample(search.exemplo);
  const suffix = example ? "?exemplo=1" : "";
  const view = await loadWatchView(`/profile/today/${section}${suffix}`, example);
  if (view.kind === "connect" || view.kind === "syncing") redirect("/profile/today");
  // app das lojas: sem relógio simulado (TodaySection)
  if (view.kind !== "real" && (await getNativeApp())) redirect("/profile");
  const snapshot = view.snapshot;
  if (!sectionAvailable(snapshot, section)) notFound();

  const period = search.p === "30" ? 30 : 7;
  const [t, tw, locale] = await Promise.all([getTranslations("me.today"), getTranslations("wearables"), getLocale()]);
  const device = snapshot.deviceName;
  const backHref = view.kind === "example" ? "/profile/today?exemplo=1" : "/profile";
  const real = view.kind === "real";
  const shortDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const when = (p: MetricPoint) => (p.date === snapshot.date ? t("detail.at", { time: formatClock(p.at, locale) }) : t("detail.onDate", { date: longDate.format(ymdToDate(p.date)), time: formatClock(p.at, locale) }));
  const periodHref = (n: number) => `/profile/today/${section}?${new URLSearchParams({ ...(example ? { exemplo: "1" } : {}), p: String(n) }).toString()}`;

  const points = sectionPoints(snapshot, section);
  const trends = trendCodes(snapshot, section);
  const info = MODEL_INFO[snapshot.model];

  return (
    <div className="flex flex-col gap-6" data-testid="today-detail" data-section={section}>
      <PageHeader title={tw(`sections.${section}`)} eyebrow={t("title")} backHref={backHref} backLabel={t("detail.back")} actions={real ? null : <DemoBadge />} />
      {view.kind === "real" ? null : <WatchDemoLabel mode={view.kind} device={device} />}

      {section === "readiness" ? <ReadinessSummary snapshot={snapshot} /> : null}

      <section aria-labelledby="measured-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 id="measured-title" className="type-h3 text-fg">
          {t("detail.measuredTitle")}
        </h2>
        <dl className="flex flex-col divide-y divide-border" data-testid="detail-metrics">
          {points.map((p) => {
            const usual = usualRange(snapshot, p.code);
            const def = metricDef(p.code);
            return (
              <div key={p.code} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" data-metric={p.code}>
                <dt className="type-body-sm text-fg-muted">
                  {tw(`metrics.${p.code}`)}
                  {def?.mode === "C" ? <span className="type-caption"> · {t("computedByUs")}</span> : null}
                </dt>
                <dd className="flex flex-col sm:items-end">
                  <span className="type-body font-semibold type-numeric text-fg">{formatMetric(p.code, p.value, locale)}</span>
                  <span className="type-caption type-numeric text-fg-muted">
                    {when(p)}
                    {usual ? ` · ${t("detail.usual", { low: formatMetric(p.code, usual.low, locale), high: formatMetric(p.code, usual.high, locale) })}` : null}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {trends.length > 0 ? (
        <section aria-labelledby="trend-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="trend-title" className="type-h3 text-fg">
              {t("detail.trendTitle", { name: tw(`metrics.${trends[0]}`) })}
            </h2>
            <nav aria-label={t("detail.periodLabel")} className="inline-flex rounded-lg border border-border p-0.5">
              {[7, 30].map((n) => (
                <Link
                  key={n}
                  href={periodHref(n)}
                  aria-current={period === n ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 min-w-16 items-center justify-center rounded-md px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    period === n ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {t("detail.days", { n })}
                </Link>
              ))}
            </nav>
          </div>
          {trends.map((code) => {
            const days = snapshot.history.slice(-period);
            const pts: TrendPoint[] = days.map((d) => {
              const v = d.values[code];
              return { date: d.date, label: shortDate.format(ymdToDate(d.date)), value: typeof v === "number" ? v : null, display: typeof v === "number" ? formatMetric(code, v, locale) : t("detail.noToday"), partial: d.partial && PARTIAL_SECTIONS.has(metricDef(code)?.section ?? "") };
            });
            const vals = pts.map((p) => p.value).filter((v): v is number => v !== null);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            const todayPoint = pts[pts.length - 1];
            const name = tw(`metrics.${code}`);
            return (
              <TrendChart
                key={code}
                testId={`trend-${code}`}
                title={name}
                locale={locale}
                summary={t("detail.chartSummary", { name, n: period, avg: avg === null ? t("detail.noToday") : formatMetric(code, avg, locale), today: todayPoint?.display ?? t("detail.noToday") })}
                points={pts}
                // dias passados no gráfico são inteiros: a banda é a faixa de dias inteiros
                band={snapshot.fullDayBaselines[code] ?? snapshot.baselines[code] ?? null}
                bandLabel={t("detail.band")}
                partialLabel={t("detail.partial")}
                zeroBased={ZERO_BASED.has(code)}
                formatTick={metricDef(code)?.unit === "min" ? (v) => `${formatDecimal(v / 60, locale)} h` : undefined}
                table={{ toggle: t("detail.tableToggle"), caption: t("detail.tableCaption", { name }), colDate: t("detail.colDate"), colValue: t("detail.colValue") }}
              />
            );
          })}
        </section>
      ) : null}

      <section aria-labelledby="how-title" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 id="how-title" className="type-h3 text-fg">
          {t("detail.howTitle")}
        </h2>
        <p className="type-body-sm max-w-prose text-fg">{tw(`howMeasured.${section}`)}</p>
        {section === "vitals" && snapshot.values.hrv_night ? <p className="type-caption text-fg-muted">{t("detail.hrvMethod", { method: info.hrvMethod.toUpperCase() })}</p> : null}
        {section === "readiness" && info.hiddenIndexNote === "garmin" ? <p className="type-caption text-fg-muted">{t("cards.garminNote")}</p> : null}
        {section === "readiness" && info.hiddenIndexNote === "apple_readiness" ? <p className="type-caption text-fg-muted">{t("cards.appleNote")}</p> : null}
      </section>

      <footer className="flex flex-col gap-2 rounded-xl bg-surface-elevated p-4">
        <p className="type-caption text-fg-muted">
          <span className="font-semibold text-fg">{t("detail.sourceTitle")}: </span>
          {t(real ? "real.detailSource" : "detail.source", { device, time: formatClock(snapshot.syncedAt, locale) })}
        </p>
        <p className="flex items-start gap-2 type-caption text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("wellness")}
        </p>
        <Link href={`/profile/today/about${suffix}`} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("aboutLink")}
        </Link>
      </footer>
    </div>
  );
}

// Índice do dia: o da marca em destaque quando existe (Body Battery), e o nosso cálculo
// (Disposição Groscove Ultra) recolhido em "Ver nosso cálculo"; sem índice da marca, o nosso aberto.
async function ReadinessSummary({ snapshot }: { snapshot: WatchSnapshot }) {
  const [t, locale] = await Promise.all([getTranslations("me.today"), getLocale()]);
  const kind = indexCardKind(snapshot);
  const disp = snapshot.disposition;
  const brand = MODEL_INFO[snapshot.model].brand;
  const vendor = snapshot.values.readiness_vendor ?? null;
  const vendorTitle = brand === "oura" || brand === "whoop" || brand === "polar" ? t(`cards.vendorReadiness.names.${brand}`) : t("cards.vendorReadiness.title");
  const vendorScale = vendor?.scale === "oura_readiness" || vendor?.scale === "whoop_recovery_pct" || vendor?.scale === "polar_nightly_recharge_status" ? vendor.scale : null;
  const vendorLabel = vendor?.label && ["very_poor", "poor", "compromised", "ok", "good", "very_good"].includes(vendor.label) ? vendor.label : null;
  const vendorValue = vendor ? (vendorLabel ? t(`cards.vendorReadiness.polar.${vendorLabel}`) : `${vendor.value}${vendorScale === "whoop_recovery_pct" ? "%" : ""}`) : "";
  const body = disp ? (
    <div className="flex flex-col gap-2">
      <p className="type-body font-semibold text-fg">{t("cards.disposition.score", { score: disp.score, band: t(`cards.disposition.${disp.band}`) })}</p>
      <ul className="flex flex-col gap-1">
        {disp.components.map((c) => (
          <li key={c.key} className="type-caption type-numeric text-fg">
            {t("cards.disposition.component", {
              name: t(`cards.disposition.components.${c.key}`),
              weight: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(c.weight),
              direction: c.z > 0.25 ? t("cards.disposition.pushUp") : c.z < -0.25 ? t("cards.disposition.pushDown") : t("cards.disposition.neutral"),
            })}
          </li>
        ))}
      </ul>
      <p className="type-caption text-fg-muted">{t("computedByUs")}</p>
      <p className="type-caption text-fg-muted">{t("cards.disposition.notBrand")}</p>
    </div>
  ) : null;

  return (
    <section aria-labelledby="readiness-summary-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="detail-readiness">
      <h2 id="readiness-summary-title" className="type-h3 text-fg">
        {kind === "body_battery" ? t("cards.bodyBattery.title") : kind === "readiness_vendor" ? vendorTitle : t("cards.disposition.title")}
      </h2>
      {kind === "readiness_vendor" && vendor ? (
        <>
          {/* índice da marca com escala e rótulo originais (RN-08); o nosso cálculo fica recolhido */}
          <p className="type-h2 type-numeric text-fg">{vendorValue}</p>
          {vendorScale ? <p className="type-caption text-fg-muted">{t(`cards.vendorReadiness.scale.${vendorScale}`, { value: vendor.value })}</p> : null}
          {body ? (
            <details className="rounded-lg border border-border">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{t("cards.disposition.ours")}</summary>
              <div className="px-3 pb-3">{body}</div>
            </details>
          ) : null}
        </>
      ) : kind === "body_battery" && snapshot.values.body_battery_now ? (
        <>
          <p className="type-h2 type-numeric text-fg">{t("cards.bodyBattery.value", { value: snapshot.values.body_battery_now.value, time: formatClock(snapshot.values.body_battery_now.at, locale) })}</p>
          <p className="type-caption text-fg-muted">{t("cards.bodyBattery.scale")}</p>
          {body ? (
            <details className="rounded-lg border border-border">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{t("cards.disposition.ours")}</summary>
              <div className="px-3 pb-3">{body}</div>
            </details>
          ) : null}
        </>
      ) : (
        <>
          {disp ? <p className="type-h3 text-fg">{t(`cards.disposition.${disp.band}`)}</p> : null}
          {body}
        </>
      )}
    </section>
  );
}

