import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import type { TalentSelf } from "@/lib/talent/server";

// Cabeçalho das telas da agência no Portal do Herói (0097): o nome do herói no casting e a agência (com o gestor).
export async function AgencyHeader({ talent }: { talent: TalentSelf }) {
  const t = await getTranslations("talent");
  return (
    <PageHeader
      eyebrow={t("meta.eyebrow")}
      title={talent.displayName}
      description={talent.manager ? t("home.agencyWithManager", { agency: talent.agency, manager: talent.manager }) : t("home.agency", { agency: talent.agency })}
    />
  );
}
