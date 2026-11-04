import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RouteTabs } from "@/components/agency/RouteTabs";
import { StageBadge } from "@/components/deals/StatusBadges";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { loadDeal } from "./_lib";

type Props = { children: ReactNode; params: Promise<{ id: string }> };

// Ficha do negócio com abas por rota (Visão geral, Roteiro, Creators, Entregas, Conversa, Documentos).
// 0110: abas Sala e Fechamento. 0107: aba Roteiro (serviço, etapas por setor e prazos em dias úteis); negócio só do herói (sem marca) esconde as abas
// que dependem da marca (heróis do elenco, termos, entregas e conversa com a marca).
export default async function DealLayout({ children, params }: Props) {
  const { id } = await params;
  const [{ deal }, t, locale] = await Promise.all([loadDeal(id), getTranslations("agency.deal"), getLocale() as Promise<Locale>]);
  const base = `/agencia/negocios/${deal.id}`;
  const hasBrand = deal.brand.id !== "";
  return (
    <div className="flex flex-col gap-5" data-testid="deal-page">
      <PageHeader
        title={deal.title}
        backHref="/agencia/pipeline"
        backLabel={t("backToPipeline")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StageBadge stage={deal.stage} outcome={deal.outcome} size="md" />
            <span className="text-fg">{deal.clientLabel}</span>
            {deal.service ? (
              <Badge variant="info" size="sm">
                {deal.service.name}
              </Badge>
            ) : null}
            {deal.isDemo ? (
              <Badge variant="neutral" size="sm">
                {t("demoTag")}
              </Badge>
            ) : null}
            <span className="text-fg-muted">
              {deal.expectedStart ? t("period", { start: formatPlainDate(deal.expectedStart, locale), end: formatPlainDate(deal.expectedEnd ?? deal.expectedStart, locale) }) : t("noPeriod")}
            </span>
          </span>
        }
      />
      <RouteTabs
        label={t("tabsLabel")}
        tabs={[
          { href: base, label: t("tabs.overview"), exact: true },
          { href: `${base}/roteiro`, label: t("tabs.roadmap") },
          // 0110: sala do projeto (substitui o grupo de WhatsApp do staff)
          { href: `${base}/sala`, label: t("tabs.room") },
          ...(hasBrand
            ? [
                { href: `${base}/herois`, label: t("tabs.talents") },
                { href: `${base}/termos`, label: t("tabs.terms") },
              ]
            : []),
          { href: `${base}/tarefas`, label: t("tabs.tasks") },
          ...(hasBrand
            ? [
                { href: `${base}/entregas`, label: t("tabs.deliverables") },
                { href: `${base}/conversa`, label: t("tabs.messages") },
              ]
            : []),
          { href: `${base}/documentos`, label: t("tabs.documents") },
          // 0110: fechamento (clipping, notas do cliente e próximo negócio)
          { href: `${base}/clipping`, label: t("tabs.closing") },
        ]}
      />
      {children}
    </div>
  );
}
