import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/professionals/portal/ProfileForm";
import { PageHeader } from "@/components/ui";
import { getMyProfessional } from "@/lib/professionals/queries";
import { saveProfileAction } from "../actions";

export const dynamic = "force-dynamic";

// Perfil público do profissional (o que aparece em /profissionais/<slug>).
export default async function ProfessionalProfilePage() {
  const { professional: pro } = await getMyProfessional();
  if (!pro) return null;
  const t = await getTranslations("professionals.portal");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("profile.title")} description={t("profile.description")} eyebrow={t("title")} />
      <ProfileForm
        mode="professional"
        initial={{ name: pro.name, photoUrl: pro.photoUrl, bio: pro.bio, cities: pro.cities, online: pro.online, registryNumber: pro.registryNumber, registryUf: pro.registryUf }}
        onSave={saveProfileAction}
      />
    </div>
  );
}
