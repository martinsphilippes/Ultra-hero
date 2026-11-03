import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { BrandPaymentsList, PaymentDataCard } from "@/components/finance/Payments";
import { EmptyState, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { getBrandContext } from "@/lib/brand-portal/server";
import { formatCents } from "@/lib/deals/schemas";
import { paymentTotals } from "@/lib/finance/payments";
import { brandPayments } from "@/lib/finance/queries";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

const TONE = { fg: "text-fg", danger: "text-danger", warning: "text-warning", success: "text-success" } as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("payments.brand");
  return { title: t("title") };
}

// Pagamentos da marca (0090): tudo o que a marca deve às agências (campanhas, patrocínios e chamadas acordados que
// geraram o "a receber"), com parcelas, vencimento e situação, os dados de pagamento da agência e "Informar
// pagamento" (dono e equipe). Registro/controle simulado: nada aqui cobra nem move dinheiro.
export default async function BrandPaymentsPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const [t, locale, res] = await Promise.all([getTranslations("payments.brand"), getLocale() as Promise<Locale>, brandPayments(ctx.brand.id)]);
  if (!res.available || !res.data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<Wallet />} title={t("unavailable")} />
        </div>
      </div>
    );
  }
  const data = res.data;
  const today = localDay(new Date(), data.agencies[0]?.timezone ?? "America/Sao_Paulo");
  const totals = paymentTotals(data.items, today);
  const tile = (label: string, cents: number, tone: "fg" | "danger" | "warning" | "success" = "fg", extra?: string) => (
    <div className="flex min-h-16 flex-col justify-center rounded-xl border border-border bg-surface px-3 py-2">
      <span className="type-caption text-fg-muted">{label}</span>
      <span className={`font-mono text-base font-semibold ${TONE[tone]}`}>{formatCents(cents, locale)}</span>
      {extra ? <span className="type-caption text-fg-muted">{extra}</span> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-5" data-testid="brand-payments-page">
      <PageHeader title={t("title")} description={t("description")} />
      {data.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Wallet />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="payment-totals">
            {tile(t("totals.open"), totals.openCents)}
            {tile(t("totals.overdue"), totals.overdueCents, totals.overdueCount > 0 ? "danger" : "fg", totals.overdueCount > 0 ? t("totals.count", { count: totals.overdueCount }) : undefined)}
            {tile(t("totals.reported"), totals.reportedCents, totals.reportedCount > 0 ? "warning" : "fg")}
            {tile(t("totals.paid"), totals.paidCents, "success")}
          </div>
          {data.agencies.map((a) => (
            <PaymentDataCard key={a.agencyId} agencyName={a.name} settings={a.settings} />
          ))}
          <BrandPaymentsList items={data.items} today={today} canAct={Boolean(ctx.role)} />
        </>
      )}
      <p className="type-caption text-fg-subtle" data-testid="payments-simulated">
        {t("simulated")}
      </p>
    </div>
  );
}
