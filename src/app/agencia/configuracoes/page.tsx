import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgencySettingsForm } from "@/components/agency/SettingsForms";
import { PaymentSettingsForm } from "@/components/finance/PaymentSettingsForm";
import { RateForm } from "@/components/finance/RateForm";
import { ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { agencyPaymentSettings, agencyRates } from "@/lib/finance/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("settings") };
}

// Configurações da agência: dados básicos (gestor+), a taxa de serviço do financeiro simulado e (0090) os dados de
// pagamento que a marca vê em "Pagamentos" (só Adm).
export default async function AgencySettingsPage() {
  const ctx = await requireAgency("manager");
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const [t, tr, tf, tp, rate, payment] = await Promise.all([
    getTranslations("agency.settings"),
    getTranslations("roadmap.catalog"),
    getTranslations("agency.finance"),
    getTranslations("payments.settings"),
    isAdmin ? agencyRates(ctx.agency.id) : Promise.resolve(null),
    isAdmin ? agencyPaymentSettings(ctx.agency.id) : Promise.resolve(null),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {/* 0107: catálogo de serviços e roteiros de entrega (Adm edita; gestor consulta) */}
      <Link
        href="/agencia/configuracoes/servicos"
        className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
        data-testid="settings-services"
      >
        <span className="flex items-start gap-3">
          <ListChecks className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-fg">{tr("title")}</span>
            <span className="type-caption text-fg-muted">{tr("settingsHint")}</span>
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
      </Link>
      <section aria-labelledby="agency-data" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="agency-data" className="type-h3 text-fg">
          {t("dataTitle")}
        </h2>
        <AgencySettingsForm
          initial={{ name: ctx.agency.name, timezone: ctx.agency.timezone, relationshipAlertDays: ctx.agency.relationshipAlertDays, contactEmail: ctx.agency.contactEmail }}
        />
      </section>
      {isAdmin && rate !== null ? (
        <section aria-labelledby="agency-rate" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="agency-rate">
          <div className="flex flex-col gap-1">
            <h2 id="agency-rate" className="type-h3 text-fg">
              {tf("rateTitle")}
            </h2>
            <p className="type-body-sm text-fg-muted">{tf("rateDescription")}</p>
          </div>
          <RateForm initialBp={rate.agencyRateBp} locked={ctx.agency.isDemo} />
        </section>
      ) : null}
      {isAdmin && payment?.available ? (
        <section id="agency-payment" aria-labelledby="agency-payment-title" className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="agency-payment">
          <div className="flex flex-col gap-1">
            <h2 id="agency-payment-title" className="type-h3 text-fg">
              {tp("title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{tp("description")}</p>
          </div>
          <PaymentSettingsForm initial={payment.data} locked={ctx.agency.isDemo} />
        </section>
      ) : null}
    </div>
  );
}
