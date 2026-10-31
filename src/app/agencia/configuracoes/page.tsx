import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgencySettingsForm } from "@/components/agency/SettingsForms";
import { PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("settings") };
}

// Configurações da agência (Etapa A: dados básicos; segmentos, comissão e datas chegam nas próximas).
export default async function AgencySettingsPage() {
  const ctx = await requireAgency("manager");
  const t = await getTranslations("agency.settings");
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
      <section aria-labelledby="agency-commission-soon" className="flex flex-col gap-1 rounded-2xl border border-dashed border-border-strong p-4">
        <h2 id="agency-commission-soon" className="text-sm font-semibold text-fg">
          {t("soonTitle")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("soonBody")}</p>
      </section>
    </div>
  );
}
