import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/professionals/portal/ProfileForm";
import { PageHeader } from "@/components/ui";
import { saveProfessionalAdmin } from "../actions";

// Novo profissional (perfil sem conta; depois o admin aprova, cadastra serviços e convida a pessoa).
export default async function NewProfessionalPage() {
  const t = await getTranslations("professionals.admin");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("newTitle")} backHref="/admin/professionals" backLabel={t("title")} />
      <ProfileForm
        mode="admin"
        redirectOnCreate
        initial={{ name: "", photoUrl: null, bio: "", cities: [], online: true, registryNumber: "", registryUf: "SP", slug: "", specialty: "nutritionist", registryType: "CRN", sortOrder: 100 }}
        onSave={saveProfessionalAdmin.bind(null, null)}
      />
    </div>
  );
}
