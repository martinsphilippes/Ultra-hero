import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ServiceEditor } from "@/components/roadmap/ServiceEditor";
import { PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getService } from "@/lib/roadmap/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("services") };
}

type Props = { params: Promise<{ id: string }> };

// Um serviço do catálogo e o roteiro (etapas). Adm edita; gestor consulta. Mudanças valem para os próximos roteiros
// (os já gerados guardam a cópia das etapas).
export default async function ServicePage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireAgency("manager");
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const [t, service] = await Promise.all([getTranslations("roadmap.catalog"), getService(ctx.agency.id, id)]);
  if (!service) notFound();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={service.name} description={t("editHint")} backHref="/agencia/configuracoes/servicos" backLabel={t("title")} />
      <ServiceEditor service={service} readOnly={!isAdmin || ctx.agency.isDemo} />
    </div>
  );
}
