import { ArrowRight, TrendingUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterBox } from "@/components/finance/FinanceFilters";
import { BUCKET_KEYS, EXTRA_KEYS, type BucketKey, type CampaignProjection as Projection, type ExtraKey, type ProjectionBucket, bucketShares, bucketTotal, extrasTotal, projectionYears, segmentHint, yearHref } from "@/lib/projection/campaign";
import { cn } from "@/lib/utils";

// Aba "Projeção" do Financeiro (0139, pedido de 08/11/2026), para a agência (gestor, equipe e Adm) e para o Hero:
// "Projeção no seu segmento" (tudo de campanha da plataforma nos segmentos da pessoa — o "por que eu não estou
// nisso?") e "Projeção para você", no ano escolhido no filtro (ou no total). Cada número separa o que já fechou, o que
// está em negociação e o que está aberto para buscar, com o atalho para as oportunidades.

const DOT: Record<BucketKey, string> = { won: "bg-success", open: "bg-warning", available: "bg-accent" };

function money(locale: string, value: number): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value / 100);
}

type Labels = Record<BucketKey | ExtraKey, string>;

function Breakdown({ bucket, locale, labels }: { bucket: ProjectionBucket; locale: string; labels: Labels }) {
  const shares = bucketShares(bucket);
  const extras = EXTRA_KEYS.filter((k) => bucket[k] > 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
        {BUCKET_KEYS.map((k) => (shares[k] > 0 ? <span key={k} className={DOT[k]} style={{ width: `${shares[k]}%` }} /> : null))}
      </div>
      <dl className="flex flex-col gap-1">
        {BUCKET_KEYS.map((k) => (
          <div key={k} className="flex items-center justify-between gap-2 type-caption">
            <dt className="flex items-center gap-2 text-fg-muted">
              <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[k])} />
              {labels[k]}
            </dt>
            <dd className="font-mono tabular-nums text-fg">{money(locale, bucket[k])}</dd>
          </div>
        ))}
      </dl>
      {/* 0140: permuta e performance à parte, pelo valor estimado (fora do total em dinheiro) */}
      {extras.length > 0 ? (
        <dl className="flex flex-col gap-1 border-t border-border pt-2" data-testid="projection-extras">
          {extras.map((k) => (
            <div key={k} className="flex items-center justify-between gap-2 type-caption">
              <dt className="text-fg-muted">{labels[k]}</dt>
              <dd className="font-mono tabular-nums text-fg">{money(locale, bucket[k])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function BigCard({
  title,
  hint,
  bucket,
  locale,
  labels,
  cta,
  testid,
  highlight = false,
}: {
  title: string;
  hint: string;
  bucket: ProjectionBucket;
  locale: string;
  labels: Labels;
  cta?: { href: string; label: string } | null;
  testid: string;
  highlight?: boolean;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border p-4", highlight ? "border-accent/40 bg-accent-soft/40" : "border-border bg-surface")} data-testid={testid}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <p className="type-caption text-fg-muted">{hint}</p>
      </div>
      <p className="text-3xl font-bold tabular-nums text-fg" data-testid={`${testid}-total`}>
        {money(locale, bucketTotal(bucket))}
      </p>
      <Breakdown bucket={bucket} locale={locale} labels={labels} />
      {cta ? (
        <Link href={cta.href} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
          {cta.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

export async function CampaignProjection({
  data,
  year,
  currentYear,
  basePath,
  opportunitiesHref,
  side,
}: {
  data: Projection;
  year: number | null;
  currentYear: number;
  basePath: string;
  opportunitiesHref: string | null;
  side: "hero" | "team";
}) {
  const [t, locale] = await Promise.all([getTranslations("projection"), getLocale()]);
  const labels: Labels = {
    won: t("buckets.won"),
    open: t("buckets.open"),
    available: t("buckets.available"),
    barter: t("extras.barter"),
    performance: t("extras.performance"),
  };
  const period = year === null ? t("total") : String(year);
  const years = projectionYears(data.years, currentYear);
  const cta = opportunitiesHref && data.segment.available > 0 ? { href: opportunitiesHref, label: t("seeOpportunities") } : null;
  const ranking = data.segments.filter((s) => bucketTotal(s) + extrasTotal(s) > 0).slice(0, 12);

  return (
    <div className="flex flex-col gap-4" data-testid="campaign-projection">
      <div className="flex items-start gap-3">
        <TrendingUp className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-fg">{t("title")}</h2>
          <p className="type-caption text-fg-muted">{t("lead")}</p>
        </div>
      </div>

      <nav aria-label={t("periodLabel")} className="grid w-full max-w-md grid-cols-4 gap-1.5" data-testid="projection-years">
        {years.map((y) => (
          <FilterBox key={y} href={yearHref(basePath, y)} active={year === y} label={String(y)} />
        ))}
        <FilterBox href={yearHref(basePath, null)} active={year === null} label={t("total")} />
      </nav>

      <div className="grid gap-3 sm:grid-cols-2">
        <BigCard
          title={t("segment.title")}
          hint={data.mySegments.length > 0 ? segmentHint(data.mySegments) : t("segment.none")}
          bucket={data.segment}
          locale={locale}
          labels={labels}
          cta={cta}
          testid="projection-segment"
          highlight
        />
        <BigCard title={t("mine.title")} hint={side === "hero" ? t("mine.heroHint") : t("mine.teamHint")} bucket={data.mine} locale={locale} labels={labels} testid="projection-mine" />
      </div>
      {data.agency ? <BigCard title={t("agency.title")} hint={t("agency.hint")} bucket={data.agency} locale={locale} labels={labels} testid="projection-agency" /> : null}

      <p className="type-body-sm text-fg-muted" data-testid="projection-platform">
        {t("platform", { period, value: money(locale, bucketTotal(data.platform)) })}
      </p>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" aria-labelledby="projection-ranking">
        <h3 id="projection-ranking" className="text-sm font-semibold text-fg">
          {t("ranking")}
        </h3>
        {ranking.length === 0 ? (
          <p className="type-caption text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {ranking.map((s) => (
              <li key={s.name} className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5", s.mine && "bg-accent-soft")}>
                <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                  <span className="truncate">{s.name}</span>
                  {s.mine ? <span className="shrink-0 type-caption font-semibold text-accent-text">{t("yours")}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-sm tabular-nums text-fg">{money(locale, bucketTotal(s))}</span>
                  {extrasTotal(s) > 0 ? <span className="type-caption text-fg-muted">{t("extrasLine", { value: money(locale, extrasTotal(s)) })}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
