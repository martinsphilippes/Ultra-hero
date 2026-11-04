import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlatformEventAdminActions } from "@/components/platform-calendar/PlatformEventAdminActions";
import { PlatformEventForm } from "@/components/platform-calendar/PlatformEventForm";
import { InterestCounts, InterestList, PlatformEventView } from "@/components/platform-calendar/PlatformEventView";
import { PageHeader } from "@/components/ui";
import { platformEventToForm } from "@/lib/platform-calendar/form";
import { getPlatformEvent, interestSummary, listEventInterests } from "@/lib/platform-calendar/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar.admin");
  return { title: t("edit") };
}

// Evento do Calendário Groscove no admin (0098): como os portais veem, interessados (todos), editar, cancelar/excluir.
export default async function AdminAgendaEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getPlatformEvent(id);
  if (!event) notFound();
  const [t, interests, counts] = await Promise.all([getTranslations("groscoveCalendar"), listEventInterests(id), interestSummary(id)]);
  const live = event.status !== "draft" && event.publishedAt !== null && new Date(event.publishedAt).getTime() <= Date.now();
  return (
    <div className="flex flex-col gap-5" data-testid="admin-agenda-event">
      <PageHeader title={t("admin.edit")} backHref="/admin/agenda" backLabel={t("admin.back")} actions={<PlatformEventAdminActions id={event.id} title={event.title} canCancel={live && event.status !== "cancelled"} canDelete={!live} />} />
      <PlatformEventView event={event} showStatus showSourceNotes>
        <InterestCounts counts={counts} />
        <InterestList items={interests} title={t("interest.adminTitle")} empty={t("interest.adminEmpty")} />
      </PlatformEventView>
      <h2 className="text-base font-semibold text-fg">{t("admin.editTitle")}</h2>
      <PlatformEventForm initial={platformEventToForm(event)} />
    </div>
  );
}
