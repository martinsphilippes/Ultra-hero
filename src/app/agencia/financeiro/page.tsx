import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { EntryTable } from "@/components/finance/EntryTable";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { AgencyPaymentsList } from "@/components/finance/Payments";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { AGENCY_PAYMENT_FILTERS, filterReceivables, type AgencyPaymentFilter } from "@/lib/finance/payments";
import { agencyBrandPayments, financeSummary, listEntries } from "@/lib/finance/queries";
import { ENTRY_FILTERS, type EntryFilter } from "@/lib/finance/vocab";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("finance") };
}

type Props = { searchParams: Promise<{ f?: string; p?: string }> };

// Financeiro (Adm): a receber da marca, comissão e repasses de cada negócio contratado, com situação. Tudo
// simulado: registro interno, sem cobrança real.
// 0090: aba "Pagamentos da marca" (f=payments): parcelas, pagamentos informados com comprovante, confirmar/recusar.
export default async function AgencyFinancePage({ searchParams }: Props) {
  const [ctx, sp] = await Promise.all([requireAgency("admin"), searchParams]);
  if (sp.f === "payments") return <BrandPaymentsTab agencyId={ctx.agency.id} filterParam={sp.p} />;
  const filter: EntryFilter = (ENTRY_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as EntryFilter) : "open";
  const [t, summary, list] = await Promise.all([getTranslations("agency.finance"), financeSummary(ctx.agency.id), listEntries(ctx.agency.id, filter)]);
  if (!summary.available || !list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Wallet />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-testid="agency-finance">
      <PageHeader title={t("title")} description={t("description")} />
      {summary.data ? <FinanceKpis summary={summary.data} /> : null}
      <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-2" data-testid="finance-filters">
        {ENTRY_FILTERS.map((f) => (
          <FilterAnchor key={f} href={`/agencia/financeiro?f=${f}`} active={filter === f} label={t(`filters.${f}`)} />
        ))}
        <FilterAnchor href="/agencia/financeiro?f=payments" active={false} label={t("filters.payments")} />
      </nav>
      <EntryTable entries={list.items} canAct emptyText={t(`empty.${filter}`)} />
    </div>
  );
}

async function BrandPaymentsTab({ agencyId, filterParam }: { agencyId: string; filterParam?: string }) {
  const filter: AgencyPaymentFilter = (AGENCY_PAYMENT_FILTERS as readonly string[]).includes(filterParam ?? "") ? (filterParam as AgencyPaymentFilter) : "reported";
  const [t, tp, res] = await Promise.all([getTranslations("agency.finance"), getTranslations("payments.agency"), agencyBrandPayments(agencyId)]);
  const data = res.data;
  const today = localDay(new Date(), data?.timezone ?? "America/Sao_Paulo");
  const items = data ? filterReceivables(data.items, filter, today) : [];
  return (
    <div className="flex flex-col gap-5" data-testid="agency-finance-payments">
      <PageHeader title={t("title")} description={tp("description")} />
      <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-2" data-testid="finance-filters">
        {ENTRY_FILTERS.map((f) => (
          <FilterAnchor key={f} href={`/agencia/financeiro?f=${f}`} active={false} label={t(`filters.${f}`)} />
        ))}
        <FilterAnchor href="/agencia/financeiro?f=payments" active label={t("filters.payments")} />
      </nav>
      {data && !data.hasSettings ? (
        <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="payments-no-settings">
          {tp("noSettings")}{" "}
          <Link href="/agencia/configuracoes#agency-payment" className="font-medium text-accent-text underline-offset-2 hover:underline">
            {tp("noSettingsLink")}
          </Link>
        </p>
      ) : null}
      <nav aria-label={tp("filtersLabel")} className="flex flex-wrap gap-2">
        {AGENCY_PAYMENT_FILTERS.map((f) => (
          <FilterAnchor key={f} href={`/agencia/financeiro?f=payments&p=${f}`} active={filter === f} label={tp(`filters.${f}`)} />
        ))}
      </nav>
      {!res.available || !data ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<Wallet />} title={t("unavailable")} description={t("unavailableHint")} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Wallet />} title={tp(`empty.${filter}`)} />
        </div>
      ) : (
        <AgencyPaymentsList items={items} today={today} />
      )}
      <p className="type-caption text-fg-subtle">{tp("simulated")}</p>
    </div>
  );
}
