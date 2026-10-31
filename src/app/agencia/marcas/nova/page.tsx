import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandCreateForm, BrandLinkForm } from "@/components/agency/BrandForms";
import { PageHeader } from "@/components/ui";
import { listLinkableBrands } from "@/lib/agency/queries";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newBrand") };
}

// Nova marca: cadastrar (nasce fora do app) ou vincular uma que já aparece no app. Gestor+.
export default async function NewAgencyBrandPage() {
  const ctx = await requireAgency("manager");
  const [t, linkable] = await Promise.all([getTranslations("agency.brands"), ctx.agency.isDemo ? Promise.resolve([]) : listLinkableBrands(ctx.agency.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/agencia/marcas" backLabel={t("title")} />
      <section aria-labelledby="brand-create" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="brand-create" className="type-h3 text-fg">
          {t("createTitle")}
        </h2>
        <BrandCreateForm demo={ctx.agency.isDemo} />
      </section>
      {ctx.agency.isDemo ? null : (
        <section aria-labelledby="brand-link" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 id="brand-link" className="type-h3 text-fg">
            {t("linkTitle")}
          </h2>
          <BrandLinkForm brands={linkable} />
        </section>
      )}
    </div>
  );
}
