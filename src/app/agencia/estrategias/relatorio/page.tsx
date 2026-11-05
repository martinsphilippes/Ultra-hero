import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { PrintButton } from "@/components/project-room/PrintButton";
import { EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatPlainDate } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { getCastingReport } from "@/lib/strategy/queries";
import { monthKey, reportRange, shiftMonth } from "@/lib/strategy/vocab";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("strategy.castingReport");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ mes?: string }> };

// Relatório automático do que o casting postou no mês (0111, D3): posts do app (perfil de criador do Hero) e entregas
// publicadas nas campanhas da agência. Base da reunião de início de mês; imprime/salva como PDF.
export default async function CastingReportPage({ searchParams }: Props) {
  const [ctx, sp] = await Promise.all([requireAgency(), searchParams]);
  const today = localDay(new Date(), ctx.agency.timezone || "America/Sao_Paulo");
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : monthKey(today);
  const range = reportRange(month, today);
  const [t, tk, locale, res] = await Promise.all([
    getTranslations("strategy.castingReport"),
    getTranslations("commercial.deliverableKinds"),
    getLocale() as Promise<Locale>,
    getCastingReport(ctx.agency.id, range.from, range.to),
  ]);
  const label = formatPlainDate(month, locale, { month: "long", year: "numeric" });
  const r = res.data;
  return (
    <div className="flex flex-col gap-5" data-testid="casting-report">
      <PageHeader
        title={t("title")}
        description={t("description", { from: formatPlainDate(range.from, locale), to: formatPlainDate(range.to, locale) })}
        backHref={`/agencia/estrategias?mes=${month.slice(0, 7)}`}
        backLabel={t("back")}
        actions={<div className="print:hidden">{r ? <PrintButton /> : null}</div>}
      />
      <nav aria-label={t("monthNav")} className="flex flex-wrap items-center gap-2 print:hidden">
        <FilterAnchor href={`/agencia/estrategias/relatorio?mes=${shiftMonth(month, -1).slice(0, 7)}`} active={false} label="‹" />
        <span className="px-2 text-sm font-semibold capitalize text-fg">{label}</span>
        <FilterAnchor href={`/agencia/estrategias/relatorio?mes=${shiftMonth(month, 1).slice(0, 7)}`} active={false} label="›" />
      </nav>
      {!r ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<BarChart3 />} title={res.available ? t("empty") : t("unavailable")} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={t("talents")} value={r.totals.talents} />
            <KpiCard label={t("active")} value={r.totals.active} />
            <KpiCard label={t("posts")} value={r.totals.posts} />
            <KpiCard label={t("deliverables")} value={r.totals.deliverables} />
          </div>
          <ul className="flex flex-col gap-3">
            {r.talents.map((h) => (
              <li key={h.talentId} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 break-inside-avoid" data-testid="casting-report-hero">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{h.name}</span>
                  <span className="type-caption text-fg-muted">{t("counts", { posts: h.postsCount, deliverables: h.deliverablesCount })}</span>
                </div>
                {h.segments.length > 0 ? <span className="type-caption text-fg-muted">{h.segments.join(" · ")}</span> : null}
                {h.posts.length === 0 && h.deliverables.length === 0 ? <p className="type-caption text-fg-subtle">{t("nothing")}</p> : null}
                {h.posts.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {h.posts.map((p) => (
                      <li key={`${p.slug}:${p.publishedAt}`} className="text-sm text-fg">
                        <span className="type-caption text-fg-muted">{formatDate(p.publishedAt, locale, { day: "2-digit", month: "2-digit" })} · {t("appPost")} · </span>
                        {p.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {h.deliverables.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {h.deliverables.map((d, i) => (
                      <li key={`${d.publishedAt}:${i}`} className="text-sm text-fg">
                        <span className="type-caption text-fg-muted">
                          {formatDate(d.publishedAt, locale, { day: "2-digit", month: "2-digit" })} · {tk.has(d.kind) ? tk(d.kind) : d.kind}
                          {d.brand ? ` · ${d.brand}` : ""} ·{" "}
                        </span>
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-accent-text underline-offset-2 hover:underline">
                            {d.title || d.deal}
                          </a>
                        ) : (
                          d.title || d.deal
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
