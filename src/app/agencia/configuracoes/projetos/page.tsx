import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProjectSettingsForm } from "@/components/project-room/ProjectSettingsForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getProjectSettings } from "@/lib/project-room/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.settings");
  return { title: t("title") };
}

// Normas Groscove para a equipe e modelo de NDA da sala do projeto (0110): o Adm edita; a equipe consulta.
export default async function ProjectSettingsPage() {
  const ctx = await requireAgency("staff");
  const [t, settings] = await Promise.all([getTranslations("projectRoom.settings"), getProjectSettings(ctx.agency.id)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} backHref="/agencia/configuracoes" backLabel={t("back")} />
      {settings.data ? (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <ProjectSettingsForm norms={settings.data.norms} nda={settings.data.ndaText} version={settings.data.ndaVersion} canEdit={agencyCan(ctx.role, "admin", ctx.platformAdmin) && !ctx.agency.isDemo} />
        </section>
      ) : (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<ShieldCheck />} title={t("unavailable")} />
        </div>
      )}
    </div>
  );
}
