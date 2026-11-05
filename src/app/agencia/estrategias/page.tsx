import type { Metadata } from "next";
import { BarChart3, Lightbulb, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { StrategyStatusBadge } from "@/components/strategy/StrategyStatusBadge";
import { buttonBase, buttonSizes, buttonVariants, EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { listStrategyIdeas } from "@/lib/strategy/queries";
import { monthKey, shiftMonth, STRATEGY_STATUSES } from "@/lib/strategy/vocab";
import { localDay } from "@/lib/today/logic";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("strategy");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ mes?: string }> };

// Estratégias para marcas (0111, D3; processo mensal do PDF): banco de ideias do mês (marca, segmento, Hero, data do
// Calendário Groscove, texto) com aprovação da Estratégia, relatório do que o casting postou e envio à marca como
// oportunidade de patrocínio. Interno da agência: todo membro propõe; Estratégia/Adm aprovam.
export default async function StrategiesPage({ searchParams }: Props) {
  const [ctx, sp] = await Promise.all([requireAgency(), searchParams]);
  const today = localDay(new Date(), ctx.agency.timezone || "America/Sao_Paulo");
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : monthKey(today);
  const [t, locale, list] = await Promise.all([getTranslations("strategy"), getLocale() as Promise<Locale>, listStrategyIdeas(ctx.agency.id, month)]);
  const label = formatPlainDate(month, locale, { month: "long", year: "numeric" });
  const counts = Object.fromEntries(STRATEGY_STATUSES.map((s) => [s, list.items.filter((x) => x.status === s).length]));
  return (
    <div className="flex flex-col gap-5" data-testid="strategies">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/agencia/estrategias/nova?mes=${month.slice(0, 7)}`} className={cn(buttonBase, buttonVariants.primary, buttonSizes.md, "w-full sm:w-fit")} data-testid="strategy-new">
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Link>
            <Link href={`/agencia/estrategias/relatorio?mes=${month.slice(0, 7)}`} className={cn(buttonBase, buttonVariants.secondary, buttonSizes.md, "w-full sm:w-fit")} data-testid="strategy-report-link">
              <BarChart3 className="size-4" aria-hidden="true" />
              {t("report")}
            </Link>
          </div>
        }
      />
      <nav aria-label={t("monthNav")} className="flex flex-wrap items-center gap-2">
        <FilterAnchor href={`/agencia/estrategias?mes=${shiftMonth(month, -1).slice(0, 7)}`} active={false} label={`‹ ${t("prev")}`} />
        <span className="px-2 text-sm font-semibold capitalize text-fg">{label}</span>
        <FilterAnchor href={`/agencia/estrategias?mes=${shiftMonth(month, 1).slice(0, 7)}`} active={false} label={`${t("next")} ›`} />
      </nav>
      <p className="type-caption text-fg-muted">
        {STRATEGY_STATUSES.map((s) => `${t(`status.${s}`)}: ${counts[s]}`).join(" · ")}
        {list.canApprove ? ` · ${t("youApprove")}` : ""}
      </p>
      {!list.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<Lightbulb />} title={t("unavailable")} />
        </div>
      ) : list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Lightbulb />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((x) => (
            <li key={x.id}>
              <Link
                href={`/agencia/estrategias/${x.id}`}
                className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                data-testid="strategy-item"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <StrategyStatusBadge status={x.status} />
                  <span className="text-sm font-semibold text-fg">{x.title}</span>
                </span>
                <span className="type-caption text-fg-muted">
                  {[x.brand || x.brandLabel, x.talent, x.segment, x.event, x.ideaOn ? formatPlainDate(x.ideaOn, locale) : null].filter(Boolean).join(" · ")}
                </span>
                <span className="type-caption text-fg-subtle">{t("by", { name: x.authorLabel || "—" })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
