import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RouteTabs } from "@/components/agency/RouteTabs";
import { StageBadge } from "@/components/deals/StatusBadges";
import { Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { loadDeal } from "./_lib";

type Props = { children: ReactNode; params: Promise<{ id: string }> };

// Ficha do negócio com abas por rota (Visão geral, Creators, Entregas, Conversa, Documentos).
export default async function DealLayout({ children, params }: Props) {
  const { id } = await params;
  const [{ deal }, t, locale] = await Promise.all([loadDeal(id), getTranslations("agency.deal"), getLocale() as Promise<Locale>]);
  const base = `/agencia/negocios/${deal.id}`;
  return (
    <div className="flex flex-col gap-5" data-testid="deal-page">
      <PageHeader
        title={deal.title}
        backHref="/agencia/pipeline"
        backLabel={t("backToPipeline")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StageBadge stage={deal.stage} outcome={deal.outcome} size="md" />
            <span className="text-fg">{deal.brand.name}</span>
            {deal.isDemo ? (
              <Badge variant="demo" size="sm">
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
          { href: `${base}/creators`, label: t("tabs.talents") },
          { href: `${base}/entregas`, label: t("tabs.deliverables") },
          { href: `${base}/conversa`, label: t("tabs.messages") },
          { href: `${base}/documentos`, label: t("tabs.documents") },
        ]}
      />
      {children}
    </div>
  );
}
