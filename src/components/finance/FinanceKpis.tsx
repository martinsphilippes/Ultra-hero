import { ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import type { FinanceSummary } from "@/lib/finance/queries";

// Indicadores financeiros (Adm; só aparecem para quem abre /agencia/financeiro): cada cartão abre a lista já filtrada.
// a receber, comissão, repasses e vencidos; 0108: previstos numa linha à parte. Só registro, sem transação: o aviso abaixo diz isso.
export async function FinanceKpis({ summary, compact = false }: { summary: FinanceSummary; compact?: boolean }) {
  const [t, locale] = await Promise.all([getTranslations("agency.finance"), getLocale() as Promise<Locale>]);
  return (
    <div className="flex flex-col gap-3" data-testid="finance-kpis">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard href="/agencia/financeiro?f=receivable" label={t("kpi.receivableOpen")} value={formatCents(summary.receivableOpenCents, locale)} hint={t("kpi.receivableSettled", { value: formatCents(summary.receivableSettledCents, locale) })} />
        <KpiCard href="/agencia/financeiro?f=open" label={t("kpi.commissionOpen")} value={formatCents(summary.commissionOpenCents, locale)} hint={t("kpi.commissionSettled", { value: formatCents(summary.commissionSettledCents, locale) })} />
        <KpiCard href="/agencia/financeiro?f=payable" label={t("kpi.payoutOpen")} value={formatCents(summary.payoutOpenCents, locale)} hint={t("kpi.payoutSettled", { value: formatCents(summary.payoutSettledCents, locale) })} />
        <KpiCard href="/agencia/financeiro?f=overdue" label={t("kpi.overdue")} value={summary.overdueCount} hint={t("kpi.openCount", { count: summary.openCount, deals: summary.deals })} tone={summary.overdueCount > 0 ? "danger" : "default"} />
      </div>
      {summary.forecastCount > 0 ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 type-body-sm text-fg-muted" data-testid="finance-forecast">
          {t("kpi.forecast", { receivable: formatCents(summary.receivableForecastCents, locale), payout: formatCents(summary.payoutForecastCents, locale) })}
        </p>
      ) : null}
      {!compact ? (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted" data-testid="finance-disclaimer">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          {t("disclaimer")}
        </p>
      ) : null}
    </div>
  );
}
