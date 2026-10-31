import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { EntryTable } from "@/components/finance/EntryTable";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { financeSummary, listEntries } from "@/lib/finance/queries";
import { ENTRY_FILTERS, type EntryFilter } from "@/lib/finance/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("finance") };
}

type Props = { searchParams: Promise<{ f?: string }> };

// Financeiro (Adm): a receber da marca, comissão e repasses de cada negócio contratado, com situação. Tudo
// simulado: registro interno, sem cobrança real.
export default async function AgencyFinancePage({ searchParams }: Props) {
  const [ctx, sp] = await Promise.all([requireAgency("admin"), searchParams]);
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
      </nav>
      <EntryTable entries={list.items} canAct emptyText={t(`empty.${filter}`)} />
    </div>
  );
}
