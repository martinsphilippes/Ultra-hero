import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlatformEventForm } from "@/components/platform-calendar/PlatformEventForm";
import { PageHeader } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import { zonedDayKey } from "@/lib/calendar/grid";
import { newPlatformForm } from "@/lib/platform-calendar/form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar.admin");
  return { title: t("new") };
}

// Novo evento do Calendário Groscove (admin, 0098): nasce como rascunho por padrão.
export default async function AdminAgendaNewPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations("groscoveCalendar.admin");
  const day = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : zonedDayKey(new Date(), defaultTimeZone);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("new")} backHref="/admin/agenda" backLabel={t("back")} />
      <PlatformEventForm initial={newPlatformForm(day)} />
    </div>
  );
}
