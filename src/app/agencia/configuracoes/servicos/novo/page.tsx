import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ServiceEditor } from "@/components/roadmap/ServiceEditor";
import { PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("services") };
}

// Serviço novo (só o Adm).
export default async function NewServicePage() {
  const ctx = await requireAgency("manager");
  if (!agencyCan(ctx.role, "admin", ctx.platformAdmin) || ctx.agency.isDemo) redirect("/agencia/configuracoes/servicos");
  const t = await getTranslations("roadmap.catalog");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("new")} description={t("editHint")} backHref="/agencia/configuracoes/servicos" backLabel={t("title")} />
      <ServiceEditor service={null} readOnly={false} />
    </div>
  );
}
