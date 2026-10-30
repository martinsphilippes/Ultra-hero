import { getTranslations } from "next-intl/server";
import { ServiceEditor } from "@/components/professionals/portal/ServiceEditor";
import { PageHeader } from "@/components/ui";
import { getMyProfessional, professionalServices } from "@/lib/professionals/queries";
import { saveServiceAction } from "../actions";

export const dynamic = "force-dynamic";

// Serviços do profissional: ele cria e edita; a equipe pode desativar (aparece marcado).
export default async function ProfessionalServicesPage() {
  const { professional: pro } = await getMyProfessional();
  if (!pro) return null;
  const [t, services] = await Promise.all([getTranslations("professionals.portal"), professionalServices(pro.id)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("services.title")} description={t("services.description")} eyebrow={t("title")} />
      <ServiceEditor services={services} onSave={saveServiceAction} />
    </div>
  );
}
