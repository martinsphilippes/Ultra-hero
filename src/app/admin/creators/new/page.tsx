import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreatorForm } from "@/components/admin-ops/CreatorForm";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.creators");
  return { title: t("createTitle") };
}

// Nova personalidade (fictícia por padrão; pessoa real exige direitos autorizados).
export default async function NewCreatorPage() {
  const [t, tn] = await Promise.all([getTranslations("adminOps.creators"), getTranslations("nav")]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} description={t("description")} eyebrow={tn("admin.creators")} backHref="/admin/creators" backLabel={tn("admin.creators")} />
      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
        <CreatorForm />
      </div>
    </div>
  );
}
