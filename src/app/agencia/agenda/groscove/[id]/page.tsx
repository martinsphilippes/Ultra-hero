import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InterestCounts, InterestList, PlatformEventView } from "@/components/platform-calendar/PlatformEventView";
import { BackLink } from "@/components/ui/back-link";
import { AgencyEventActions, CompatibilityPanel, EventCommercialPanel } from "@/components/culture/EventCommerce";
import { EventPosts } from "@/components/culture/EventPosts";
import { compatFromInterests } from "@/lib/culture/compat";
import { eventCommercial, listVisiblePosts } from "@/lib/culture/queries";
import { createClient } from "@/lib/supabase/server";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { agendaBackHref } from "@/lib/platform-calendar/links";
import { getPlatformEvent, interestSummary, listEventInterests } from "@/lib/platform-calendar/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar");
  return { title: t("badge") };
}

// Evento do Calendário Groscove na agência (0098): detalhe, contagens totais e — gestor+ — os Heros do PRÓPRIO
// casting e as marcas atendidas que manifestaram interesse (a RLS só devolve esses). O colaborador vê só o evento.
export default async function AgencyGroscoveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAgency("staff");
  const { id } = await params;
  const event = await getPlatformEvent(id);
  if (!event || event.effective === "draft" || event.effective === "scheduled") notFound();
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const [t, counts, interests, history, posts] = await Promise.all([
    getTranslations("groscoveCalendar"),
    interestSummary(id),
    isManager ? listEventInterests(id) : Promise.resolve([]),
    eventCommercial(id),
    listVisiblePosts({ eventId: id, limit: 10 }),
  ]);
  // 0101: compatibilidade — Heros do casting × marcas atendidas com interesse (a RLS já filtrou); ficha do casting para o atalho
  const compat = compatFromInterests(interests);
  const fichas = new Map<string, string>();
  if (isManager && compat.heroes.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("talent_profiles")
      .select("id, creator_id")
      .eq("agency_id", ctx.agency.id)
      .is("archived_at", null)
      .in("creator_id", compat.heroes.map((h) => h.id));
    for (const r of data ?? []) if (r.creator_id) fichas.set(r.creator_id, r.id);
  }
  const closed = event.status === "cancelled" || new Date(event.endsAt).getTime() < Date.now();
  return (
    <div className="flex flex-col gap-4" data-testid="agency-groscove-event">
      <BackLink href={agendaBackHref("/agencia/agenda", event.startsAt, event.timezone)}>{t("detail.back")}</BackLink>
      <PlatformEventView event={event}>
        <InterestCounts counts={counts} />
        <AgencyEventActions eventId={event.id} canCreate={isManager} closed={closed} />
        {isManager ? (
          <CompatibilityPanel
            eventId={event.id}
            heroes={compat.heroes.map((h) => ({ ...h, talentId: fichas.get(h.id) ?? null }))}
            brands={compat.brands}
            mode="agency"
            canCreate={!closed}
          />
        ) : null}
        {isManager ? (
          <InterestList items={interests} title={t("interest.agencyTitle")} hint={t("interest.agencyHint")} empty={t("interest.agencyEmpty")} />
        ) : null}
        <p className="type-caption text-fg-subtle">{t("interest.notContractAgency")}</p>
        <EventPosts posts={posts.items} portal="agency" />
        <EventCommercialPanel items={history} />
      </PlatformEventView>
    </div>
  );
}
