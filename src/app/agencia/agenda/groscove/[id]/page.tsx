import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InterestCounts, InterestList, PlatformEventView } from "@/components/platform-calendar/PlatformEventView";
import { BackLink } from "@/components/ui/back-link";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { agendaBackHref } from "@/lib/platform-calendar/links";
import { getPlatformEvent, interestSummary, listEventInterests } from "@/lib/platform-calendar/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar");
  return { title: t("badge") };
}

// Evento do Calendário Groscove na agência (0098): detalhe, contagens totais e — gestor+ — os heróis do PRÓPRIO
// casting e as marcas atendidas que manifestaram interesse (a RLS só devolve esses). O colaborador vê só o evento.
export default async function AgencyGroscoveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAgency("staff");
  const { id } = await params;
  const event = await getPlatformEvent(id);
  if (!event || event.effective === "draft" || event.effective === "scheduled") notFound();
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const [t, counts, interests] = await Promise.all([getTranslations("groscoveCalendar"), interestSummary(id), isManager ? listEventInterests(id) : Promise.resolve([])]);
  return (
    <div className="flex flex-col gap-4" data-testid="agency-groscove-event">
      <BackLink href={agendaBackHref("/agencia/agenda", event.startsAt, event.timezone)}>{t("detail.back")}</BackLink>
      <PlatformEventView event={event}>
        <InterestCounts counts={counts} />
        {isManager ? (
          <InterestList items={interests} title={t("interest.agencyTitle")} hint={t("interest.agencyHint")} empty={t("interest.agencyEmpty")} />
        ) : null}
        <p className="type-caption text-fg-subtle">{t("interest.notContractAgency")}</p>
      </PlatformEventView>
    </div>
  );
}
