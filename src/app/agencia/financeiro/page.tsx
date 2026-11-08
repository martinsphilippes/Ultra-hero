import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EntryTable } from "@/components/finance/EntryTable";
import { FilterBox, type FinanceFilterKey, FinanceFilters } from "@/components/finance/FinanceFilters";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { ClientPayments } from "@/components/finance/ClientPayments";
import { AgencyPaymentsList } from "@/components/finance/Payments";
import { CampaignProjection } from "@/components/projection/CampaignProjection";
import { EmptyState, PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { parseYearParam } from "@/lib/projection/campaign";
import { loadCampaignProjection } from "@/lib/projection/queries";
import { AGENCY_PAYMENT_FILTERS, filterReceivables, type AgencyPaymentFilter } from "@/lib/finance/payments";
import { agencyBrandPayments, agencyClientReceivables, financeSummary, listEntries } from "@/lib/finance/queries";
import { ENTRY_FILTERS, type EntryFilter } from "@/lib/finance/vocab";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("finance") };
}

type Props = { searchParams: Promise<{ f?: string; p?: string; ano?: string }> };

/** Rótulos dos filtros do topo (lançamentos, projeção e pagamentos da marca). */
function filterLabels(t: (key: string) => string): Record<FinanceFilterKey, string> {
  return Object.fromEntries([...ENTRY_FILTERS, "payments", "projection"].map((f) => [f, t(`filters.${f}`)])) as Record<FinanceFilterKey, string>;
}

// Financeiro (Adm): a receber da marca, comissão e repasses de cada negócio contratado, com situação. Tudo
// simulado: registro interno, sem cobrança real.
// 0090: aba "Pagamentos da marca" (f=payments): parcelas, pagamentos informados com comprovante, confirmar/recusar.
// 0139: aba "Projeção" (f=projection): gestor e equipe também entram, mas só nela (as outras abas são do Adm).
export default async function AgencyFinancePage({ searchParams }: Props) {
  const [ctx, sp] = await Promise.all([requireAgency("staff"), searchParams]);
  const admin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  if (sp.f === "projection" || !admin) {
    return (
      <ProjectionTab
        agencyId={ctx.agency.id}
        timezone={ctx.agency.timezone}
        admin={admin}
        canOpportunities={agencyCan(ctx.role, "manager", ctx.platformAdmin)}
        yearParam={sp.ano}
      />
    );
  }
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
      <FinanceFilters active={filter} label={t("filtersLabel")} labels={filterLabels(t)} />
      <EntryTable entries={list.items} canAct emptyText={t(`empty.${filter}`)} />
    </div>
  );
}

async function ProjectionTab({
  agencyId,
  timezone,
  admin,
  canOpportunities,
  yearParam,
}: {
  agencyId: string;
  timezone: string;
  admin: boolean;
  canOpportunities: boolean;
  yearParam?: string;
}) {
  const current = Number(localDay(new Date(), timezone || "America/Sao_Paulo").slice(0, 4));
  const year = parseYearParam(yearParam, current);
  const [t, data] = await Promise.all([getTranslations("agency.finance"), loadCampaignProjection(agencyId, year)]);
  return (
    <div className="flex flex-col gap-5" data-testid="agency-finance-projection">
      <PageHeader title={t("title")} description={admin ? t("description") : undefined} />
      {admin ? <FinanceFilters active="projection" label={t("filtersLabel")} labels={filterLabels(t)} /> : null}
      {data ? (
        <CampaignProjection
          data={data}
          year={year}
          currentYear={current}
          basePath="/agencia/financeiro?f=projection"
          opportunitiesHref={canOpportunities ? "/agencia/oportunidades?aba=pedidos" : null}
          side="team"
        />
      ) : (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<Wallet />} title={t("unavailable")} description={t("unavailableHint")} />
        </div>
      )}
    </div>
  );
}

async function BrandPaymentsTab({ agencyId, filterParam }: { agencyId: string; filterParam?: string }) {
  const filter: AgencyPaymentFilter = (AGENCY_PAYMENT_FILTERS as readonly string[]).includes(filterParam ?? "") ? (filterParam as AgencyPaymentFilter) : "reported";
  const [t, tp, res, clients] = await Promise.all([getTranslations("agency.finance"), getTranslations("payments.agency"), agencyBrandPayments(agencyId), agencyClientReceivables(agencyId)]);
  const data = res.data;
  const today = localDay(new Date(), data?.timezone ?? "America/Sao_Paulo");
  const items = data ? filterReceivables(data.items, filter, today) : [];
  return (
    <div className="flex flex-col gap-5" data-testid="agency-finance-payments">
      <PageHeader title={t("title")} description={tp("description")} />
      <FinanceFilters active="payments" label={t("filtersLabel")} labels={filterLabels(t)} />
      {data && !data.hasSettings ? (
        <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="payments-no-settings">
          {tp("noSettings")}{" "}
          <Link href="/agencia/configuracoes#agency-payment" className="font-medium text-accent-text underline-offset-2 hover:underline">
            {tp("noSettingsLink")}
          </Link>
        </p>
      ) : null}
      <nav aria-label={tp("filtersLabel")} className="grid w-full max-w-2xl grid-cols-3 gap-1.5 sm:grid-cols-5" data-testid="payments-filters">
        {AGENCY_PAYMENT_FILTERS.map((f) => (
          <FilterBox key={f} href={`/agencia/financeiro?f=payments&p=${f}`} active={filter === f} label={tp(`filters.${f}`)} />
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
      {/* 0111: Heros-clientes (assessoria, mentoria, business plan): a agência marca cada parcela recebida */}
      <ClientPayments items={clients.items} side="agency" today={today} />
      <p className="type-caption text-fg-subtle">{tp("simulated")}</p>
    </div>
  );
}
