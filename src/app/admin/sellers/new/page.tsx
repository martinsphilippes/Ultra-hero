import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SellerForm } from "@/components/admin-ops/SellerForm";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.sellers");
  return { title: t("createTitle") };
}

// Nova organização fornecedora (fictícia).
export default async function NewSellerPage() {
  const [t, tn] = await Promise.all([getTranslations("adminOps.sellers"), getTranslations("nav")]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("createTitle")} description={t("description")} eyebrow={tn("admin.sellers")} backHref="/admin/sellers" backLabel={tn("admin.sellers")} />
      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
        <SellerForm />
      </div>
    </div>
  );
}
