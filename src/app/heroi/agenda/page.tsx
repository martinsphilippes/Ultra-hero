import type { Metadata } from "next";
import { CalendarDays, Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FeedCard } from "@/components/calendar/FeedCard";
import { AgendaTabs } from "@/components/culture/AgendaTabs";
import { HeroAgenda } from "@/components/hero-work/HeroAgenda";
import { EmptyState, PageHeader } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import { getOrigin } from "@/lib/auth/origin";
import { gridRange, queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { parseMonth } from "@/lib/calendar/ics";
import { myFeedState } from "@/lib/calendar/queries";
import { mergeAgenda } from "@/lib/hero-work/agenda";
import { heroPortalSections } from "@/lib/hero-work/rules";
import { findHeroWorkspace, listHeroEvents, listHeroServices, listServiceDates } from "@/lib/hero-work/server";
import { getTalentContext } from "@/lib/talent/server";
import { AgencyAgenda } from "./AgencyAgenda";
import { AgendaFilterBar } from "@/components/platform-calendar/AgendaFilterBar";
import { groscoveForAgenda, mergeWithGroscove } from "@/lib/platform-calendar/agenda";
import { agendaFilterParams, parseAgendaFilters } from "@/lib/platform-calendar/vocab";
import { monthKey } from "@/lib/calendar/ics";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heroWork.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string; dia?: string; cal?: string; territorio?: string; colecao?: string }> };

// Agenda do Portal do Herói (0094 + 0097), uma tela só. Com agência: a agenda da agência (campanhas, prazos, entregas,
// gravações que ela marcou como visíveis e patrocínios) e, se houver, os compromissos próprios do herói. Sem agência:
// os compromissos que o titular cria (gravação, evento, reunião, entrega, outro) em grade mensal + lista do dia, mais as
// datas dos serviços do financeiro, sem valores. Titular cria/edita/exclui; membros da equipe leem.
export default async function HeroAgendaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [t, talent, ws] = await Promise.all([getTranslations("heroWork.agenda"), getTalentContext(), findHeroWorkspace()]);
  const casting = talent.state === "ok";
  const tz = defaultTimeZone;
  const { year, month } = parseMonth(sp.mes, tz);
  const { from, to } = queryRange(year, month);
  const range = gridRange(year, month);
  // 0098: Calendário Groscove (agenda central da plataforma) junto com a agenda do herói, com filtros próprios
  const gFilters = parseAgendaFilters(sp);
  const groscove = await groscoveForAgenda({ from, to }, gFilters);
  const gParams = agendaFilterParams(gFilters);
  const [events, dates, services, feed, origin] = ws
    ? await Promise.all([
        listHeroEvents(ws.hero.id, from, to),
        listServiceDates(ws.hero.id, range.first, range.last),
        ws.canSeeFinance ? listHeroServices(ws.hero.id) : Promise.resolve({ available: true, items: [] }),
        myFeedState(),
        getOrigin(),
      ])
    : [null, [], { available: true, items: [] }, null, null];
  const show = heroPortalSections({ casting, hasHero: ws !== null, heroHasAgency: ws?.hasAgency ?? false, ownCount: (events?.items.length ?? 0) + dates.length });
  const eyebrow = casting ? talent.talent.displayName : (ws?.hero.name ?? undefined);

  if (!show.agency && !show.own) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} />
        <div className="rounded-2xl border border-border bg-surface" data-testid="office-none">
          <EmptyState icon={<CalendarDays />} title={t("unavailable")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="hero-agenda-page">
      <PageHeader eyebrow={eyebrow} title={t("title")} description={show.agency ? undefined : ws?.canWriteAgenda ? t("intro") : t("introMember")} />
      <AgendaTabs base="/heroi/agenda" active="agenda" />
      <AgendaFilterBar base="/heroi/agenda" params={{ mes: monthKey(year, month) }} filters={gFilters} collections={groscove.collections} />
      {show.agency ? <AgencyAgenda sp={sp} groscove={groscove.events} filters={gFilters} /> : null}
      {show.own && ws && events ? (
        <section className="flex flex-col gap-4" aria-labelledby="hero-own-agenda" data-testid="hero-agenda">
          {show.agency ? (
            <div className="flex flex-col gap-1">
              <h2 id="hero-own-agenda" className="text-base font-semibold text-fg">
                {t("ownTitle", { name: ws.hero.name })}
              </h2>
              <p className="type-body-sm text-fg-muted">{ws.canWriteAgenda ? t("intro") : t("introMember")}</p>
            </div>
          ) : (
            <h2 id="hero-own-agenda" className="sr-only">
              {t("ownTitle", { name: ws.hero.name })}
            </h2>
          )}
          {!events.available ? (
            <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
              <EmptyState title={t("unavailable")} />
            </div>
          ) : (
            <>
              {ws.hero.status === "suspended" ? (
                <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="hero-suspended">
                  <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  {t("suspended")}
                </p>
              ) : null}
              <HeroAgenda
                creatorId={ws.hero.id}
                events={show.agency ? mergeWithGroscove(mergeAgenda(events.items, dates, tz), [], gFilters) : mergeWithGroscove(mergeAgenda(events.items, dates, tz), groscove.events, gFilters)}
                extraParams={gParams}
                editable={events.items}
                services={services.items.filter((s) => s.status !== "cancelled").map((s) => ({ id: s.id, title: s.title, client: s.client, serviceOn: s.serviceOn }))}
                timeZone={tz}
                year={year}
                month={month}
                today={zonedDayKey(new Date(), tz)}
                requestedDay={sp.dia}
                canWrite={ws.canWriteAgenda}
                canSeeFinance={ws.canSeeFinance}
              />
            </>
          )}
          {/* com agência, o feed .ics já aparece na agenda da agência */}
          {!show.agency && feed && origin ? <FeedCard portal="hero" origin={origin} state={feed} /> : null}
        </section>
      ) : null}
    </div>
  );
}
