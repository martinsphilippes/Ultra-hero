import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ImportWizard } from "@/components/platform-calendar/ImportWizard";
import { PageHeader } from "@/components/ui";
import { existingForImport } from "@/lib/platform-calendar/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar.import");
  return { title: t("title") };
}

// Importação do Calendário Groscove (admin, 0098). Os eventos já cadastrados (chave, título, dia) vão para a tela só
// para achar duplicidade; a gravação é uma RPC transacional.
export default async function AdminAgendaImportPage() {
  const [t, existing] = await Promise.all([getTranslations("groscoveCalendar.import"), existingForImport()]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("intro")} backHref="/admin/agenda" backLabel={t("back")} />
      <ImportWizard existing={existing} />
    </div>
  );
}
