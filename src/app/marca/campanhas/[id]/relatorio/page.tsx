import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/media/PrintButton";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { getBrandCampaign } from "@/lib/deals/queries";
import { formatCents } from "@/lib/deals/schemas";
import { getDealExecution } from "@/lib/execution/queries";
import { brandBudgetSummary } from "@/lib/finance/queries";
import { campaignTotals, conversionRate, currentMetrics, engagementRate, metricsByDeliverable, METRIC_KEYS, salesTotals, sumMetrics, type MetricValues } from "@/lib/media/metrics";
import { getDealMedia } from "@/lib/media/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("media.report");
  return { title: t("meta") };
}

type Props = { params: Promise<{ id: string }> };

const PUBLISHED = ["published", "proof_submitted", "done"];

// Relatório da campanha com 1 clique (0083): uma página pensada para imprimir em A4 ("Baixar PDF" abre a impressão
// do navegador → "Salvar como PDF"). Resumo, influenciadores, entregáveis, métricas (valor atual de cada uma),
// verba (0082: reservado, comprometido e pago — o que a marca paga, nunca cachê ou comissão) e vendas por cupom.
export default async function CampaignReportPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, tc, tm, tn, locale, detail] = await Promise.all([
    getTranslations("media.report"),
    getTranslations("commercial"),
    getTranslations("media.metrics"),
    getTranslations("mediaKit.networks"),
    getLocale() as Promise<Locale>,
    getBrandCampaign(id),
  ]);
  if (!detail || !detail.deal) notFound();
  const { request, deal } = detail;
  const [exec, media, budgetRes] = await Promise.all([getDealExecution(deal.id), getDealMedia(deal.id, { sales: true }), brandBudgetSummary(request.id)]);
  const execution = exec.available ? exec.data : null;
  const data = media.data;
  const budget = budgetRes.available ? budgetRes.data : null;
  const deliverables = (execution?.deliverables ?? []).filter((d) => d.status !== "cancelled");
  const byDeliverable = metricsByDeliverable(data.metrics);
  const totals = campaignTotals(data.metrics);
  const sales = salesTotals(data.sales);
  const clicks = data.links.reduce((a, l) => a + l.clicks, 0);
  const nf = new Intl.NumberFormat(locale);
  const num = (v: number | null) => (v === null ? "—" : nf.format(v));
  const talents = detail.talents.filter((x) => x.status === "proposed" || x.status === "contracted");
  const published = deliverables.filter((d) => PUBLISHED.includes(d.status)).length;
  const rate = engagementRate(totals);
  const start = deal.expectedStart ?? request.periodStart;
  const end = deal.expectedEnd ?? request.periodEnd;
  const roi = budget && budget.committedCents > 0 && sales.revenueCents > 0 ? Math.round((sales.revenueCents / budget.committedCents) * 100) / 100 : null;
  const card = "rounded-2xl border border-border bg-surface p-4 print:break-inside-avoid print:rounded-none print:border-0 print:p-0";
  const th = "px-2 py-1.5 text-left type-caption font-semibold text-fg-muted";
  const td = "px-2 py-1.5 align-top text-sm text-fg";

  const kpis: { label: string; value: string }[] = [
    ...METRIC_KEYS.filter((k) => totals[k] !== null).map((k) => ({ label: tm(`labels.${k}`), value: num(totals[k]) })),
    ...(rate !== null ? [{ label: tm("engagement"), value: `${nf.format(rate)}%` }] : []),
    { label: t("linkClicks"), value: num(clicks) },
    { label: t("salesQty"), value: num(sales.quantity) },
    { label: t("revenue"), value: formatCents(sales.revenueCents, locale) },
    ...(roi !== null ? [{ label: t("roi"), value: `${nf.format(roi)}×` }] : []),
  ];

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-5 print:max-w-none print:gap-4" data-testid="campaign-report-page">
      <style>{`@media print { @page { size: A4; margin: 12mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/marca/campanhas/${request.id}`} className="min-h-11 content-center text-sm font-medium text-accent-text underline-offset-2 hover:underline">
          ← {t("back")}
        </Link>
        <PrintButton label={t("download")} />
      </div>
      <p className="type-caption text-fg-muted print:hidden">{t("printHint")}</p>

      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <span className="type-caption uppercase tracking-wide text-fg-muted">{t("kicker", { brand: ctx.brand.name })}</span>
        <h1 className="text-2xl font-semibold text-fg">{request.title || deal.title}</h1>
        <p className="type-body-sm text-fg-muted">
          {tc(`brandStatus.${detail.brandStatus}`)}
          {start ? ` · ${t("period", { start: formatPlainDate(start, locale), end: formatPlainDate(end ?? start, locale) })}` : ""}
          {` · ${t("generatedAt", { date: formatDateTime(new Date().toISOString(), locale) })}`}
        </p>
      </header>

      <section className={card} aria-labelledby="rep-summary">
        <h2 id="rep-summary" className="mb-2 text-base font-semibold text-fg">
          {t("summary")}
        </h2>
        <p className="mb-3 text-sm text-fg">{t("summaryLine", { talents: talents.length, deliverables: deliverables.length, published })}</p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="flex flex-col rounded-xl bg-surface-hover px-3 py-2 print:border print:border-border">
              <dt className="type-caption text-fg-muted">{k.label}</dt>
              <dd className="font-mono text-lg font-semibold text-fg">{k.value}</dd>
            </div>
          ))}
        </dl>
        {data.metrics.length === 0 ? <p className="mt-2 type-caption text-fg-muted">{t("noMetrics")}</p> : null}
      </section>

      <section className={card} aria-labelledby="rep-talents">
        <h2 id="rep-talents" className="mb-2 text-base font-semibold text-fg">
          {t("talents")}
        </h2>
        {talents.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>{t("cols.talent")}</th>
                  <th className={th}>{t("cols.deliverables")}</th>
                  <th className={th}>{tm("labels.views")}</th>
                  <th className={th}>{tm("engagement")}</th>
                  <th className={th}>{t("linkClicks")}</th>
                  <th className={th}>{t("salesQty")}</th>
                  <th className={th}>{t("revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {talents.map((x) => {
                  const mine = deliverables.filter((d) => d.dealTalentId === x.dealTalentId);
                  const values: MetricValues = sumMetrics(mine.map((d) => currentMetrics(byDeliverable.get(d.id) ?? []).values));
                  const link = data.links.find((l) => l.dealTalentId === x.dealTalentId);
                  const sold = link ? sales.byLink.get(link.id) : undefined;
                  const er = engagementRate(values);
                  return (
                    <tr key={x.dealTalentId} className="border-b border-border last:border-0">
                      <td className={td}>
                        {x.name}
                        {link?.coupon ? <span className="block type-caption text-fg-muted">{t("couponIs", { coupon: link.coupon })}</span> : null}
                      </td>
                      <td className={td}>{t("publishedOf", { published: mine.filter((d) => PUBLISHED.includes(d.status)).length, total: mine.length })}</td>
                      <td className={td}>{num(values.views)}</td>
                      <td className={td}>{er === null ? "—" : `${nf.format(er)}%`}</td>
                      <td className={td}>{link ? num(link.clicks) : "—"}</td>
                      <td className={td}>
                        {sold ? num(sold.quantity) : "—"}
                        {link && sold && conversionRate(link.clicks, sold.quantity) !== null ? <span className="block type-caption text-fg-muted">{t("conversion", { rate: nf.format(conversionRate(link.clicks, sold.quantity) as number) })}</span> : null}
                      </td>
                      <td className={td}>{sold ? formatCents(sold.revenueCents, locale) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="rep-deliverables">
        <h2 id="rep-deliverables" className="mb-2 text-base font-semibold text-fg">
          {t("deliverables")}
        </h2>
        {deliverables.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>{t("cols.deliverable")}</th>
                  <th className={th}>{t("cols.talent")}</th>
                  <th className={th}>{t("cols.status")}</th>
                  <th className={th}>{tm("labels.reach")}</th>
                  <th className={th}>{tm("labels.views")}</th>
                  <th className={th}>{tm("labels.likes")}</th>
                  <th className={th}>{tm("labels.comments")}</th>
                  <th className={th}>{tm("labels.shares")}</th>
                  <th className={th}>{tm("labels.saves")}</th>
                </tr>
              </thead>
              <tbody>
                {deliverables.map((d) => {
                  const cur = currentMetrics(byDeliverable.get(d.id) ?? []);
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className={td}>
                        {d.title || tc(`deliverableKinds.${d.kind}`)}
                        <span className="block type-caption text-fg-muted">
                          {[tc(`deliverableKinds.${d.kind}`), d.network ? tn(d.network) : null, d.publishedAt ? formatPlainDate(d.publishedAt.slice(0, 10), locale) : null].filter(Boolean).join(" · ")}
                        </span>
                        {d.publishedUrl ? (
                          <a href={d.publishedUrl} target="_blank" rel="noopener noreferrer" className="block break-all type-caption text-accent-text underline-offset-2 hover:underline">
                            {d.publishedUrl}
                          </a>
                        ) : null}
                      </td>
                      <td className={td}>{d.talentName}</td>
                      <td className={td}>{tc(`deliverableStatus.${d.status}`)}</td>
                      <td className={td}>{num(cur.values.reach)}</td>
                      <td className={td}>{num(cur.values.views)}</td>
                      <td className={td}>{num(cur.values.likes)}</td>
                      <td className={td}>{num(cur.values.comments)}</td>
                      <td className={td}>{num(cur.values.shares)}</td>
                      <td className={td}>{num(cur.values.saves)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
        <section className={card} aria-labelledby="rep-budget">
          <h2 id="rep-budget" className="mb-2 text-base font-semibold text-fg">
            {t("budget")}
          </h2>
          {budget ? (
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-fg-muted">{t("reserved")}</dt>
                <dd className="font-mono text-fg">{budget.reservedCents === null ? "—" : formatCents(budget.reservedCents, locale)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-fg-muted">{t("committed")}</dt>
                <dd className="font-mono text-fg">{formatCents(budget.committedCents, locale)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-fg-muted">{t("paid")}</dt>
                <dd className="font-mono text-fg">{formatCents(budget.paidCents, locale)}</dd>
              </div>
              {budget.over ? <p className="type-caption text-danger">{t("over")}</p> : null}
            </dl>
          ) : (
            <p className="type-body-sm text-fg-muted">{t("noBudget")}</p>
          )}
        </section>
        <section className={card} aria-labelledby="rep-sales">
          <h2 id="rep-sales" className="mb-2 text-base font-semibold text-fg">
            {t("sales")}
          </h2>
          {data.links.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("noLinks")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.links.map((l) => {
                const sold = sales.byLink.get(l.id);
                const talent = talents.find((x) => x.dealTalentId === l.dealTalentId);
                return (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span className="text-fg">
                      {l.coupon || "—"} <span className="text-fg-muted">· {talent?.name ?? ""}</span>
                    </span>
                    <span className="font-mono text-fg">
                      {t("salesLine", { clicks: l.clicks, quantity: sold?.quantity ?? 0 })} · {formatCents(sold?.revenueCents ?? 0, locale)}
                    </span>
                  </li>
                );
              })}
              <li className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-semibold">
                <span className="text-fg">{t("total")}</span>
                <span className="font-mono text-fg">
                  {t("salesLine", { clicks, quantity: sales.quantity })} · {formatCents(sales.revenueCents, locale)}
                </span>
              </li>
            </ul>
          )}
          <p className="mt-2 type-caption text-fg-muted">{t("salesHint")}</p>
        </section>
      </div>
    </article>
  );
}
