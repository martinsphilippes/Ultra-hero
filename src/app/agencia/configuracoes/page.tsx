import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgencySettingsForm } from "@/components/agency/SettingsForms";
import { RateForm } from "@/components/finance/RateForm";
import { PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { agencyRates } from "@/lib/finance/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("settings") };
}

// Configurações da agência: dados básicos (gestor+) e a taxa de serviço do financeiro simulado (só Adm).
export default async function AgencySettingsPage() {
  const ctx = await requireAgency("manager");
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const [t, tf, rate] = await Promise.all([getTranslations("agency.settings"), getTranslations("agency.finance"), isAdmin ? agencyRates(ctx.agency.id) : Promise.resolve(null)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
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
    </div>
  );
}
