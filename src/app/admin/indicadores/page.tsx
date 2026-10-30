import { Download, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PeriodSelector } from "@/components/admin-ops/PeriodSelector";
import { SectionTabs } from "@/components/admin-indicators/SectionTabs";
import { CollectiblesSection, ConversionSection, HeroesSection, ProfessionalsSection, RankingSection, ShortcutsSection } from "@/components/admin-indicators/sections";
import { Button, DemoBadge, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { INDICATOR_PERIODS, indicatorsExportHref, parseIndicatorPeriod, parseIndicatorSection, type SectionData } from "@/lib/indicators";
import { loadIndicatorSection } from "@/lib/indicators/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.admin")} · ${t("admin.indicators")}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Indicadores (Etapa 5, 0060): por herói, atalho, conversão, profissionais, colecionáveis e ranking.
// Só agregados (nenhuma pessoa). Seção e período ficam na URL (?secao=&days=); CSV por seção.
export default async function AdminIndicatorsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const section = parseIndicatorSection(raw.secao);
  const period = parseIndicatorPeriod(raw.days);
  const [t, tn, result] = await Promise.all([getTranslations("adminOps.indicators"), getTranslations("nav"), loadIndicatorSection(section, period)]);

  return (
    <div className="flex flex-col gap-5" data-testid="indicators-page" data-section={section}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        eyebrow={tn("portals.admin")}
        actions={
          <>
            <PeriodSelector value={period} periods={INDICATOR_PERIODS} />
            {result.state === "ok" ? (
              <Button asChild variant="secondary" size="sm">
                <a href={indicatorsExportHref(section, period)} title={t("exportHint")} data-testid="indicators-export">
                  <Download className="size-4" aria-hidden="true" />
                  {t("export")}
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <ul className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
        <li className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-fg-muted">
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          {t("privacy")}
        </li>
        <li className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-warning">
          <DemoBadge size="sm" />
          {t("simulatedNote")}
        </li>
      </ul>

      <SectionTabs active={section} period={period} />

      <p className="sr-only" aria-live="polite">
        {t("currentView", { section: t(`sections.${section}`), days: Number(period) })}
      </p>

      {result.state === "missing" ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="indicators-missing">
          <EmptyState title={t("missing.title")} description={t("missing.description")} />
        </div>
      ) : result.state === "error" ? (
        <div className="rounded-2xl border border-border bg-surface">
          <ErrorState description={result.message} />
        </div>
      ) : (
        <SectionBody section={section} data={result.data} />
      )}
    </div>
  );
}

function SectionBody({ section, data }: { section: keyof SectionData; data: SectionData[keyof SectionData] }) {
  switch (section) {
    case "herois":
      return <HeroesSection data={data as SectionData["herois"]} />;
    case "atalhos":
      return <ShortcutsSection data={data as SectionData["atalhos"]} />;
    case "conversao":
      return <ConversionSection data={data as SectionData["conversao"]} />;
    case "profissionais":
      return <ProfessionalsSection data={data as SectionData["profissionais"]} />;
    case "colecionaveis":
      return <CollectiblesSection data={data as SectionData["colecionaveis"]} />;
    default:
      return <RankingSection data={data as SectionData["ranking"]} />;
  }
}
