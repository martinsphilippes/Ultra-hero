import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { FeedCard } from "@/components/calendar/FeedCard";
import { HeroAgenda } from "@/components/hero-work/HeroAgenda";
import { HeroWorkTabs } from "@/components/hero-work/HeroWorkTabs";
import { EmptyState, PageHeader } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import { getOrigin } from "@/lib/auth/origin";
import { gridRange, queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { parseMonth } from "@/lib/calendar/ics";
import { myFeedState } from "@/lib/calendar/queries";
import { mergeAgenda } from "@/lib/hero-work/agenda";
import { getHeroWorkspace, listHeroEvents, listHeroServices, listServiceDates } from "@/lib/hero-work/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heroWork.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string; dia?: string }> };

// Agenda do herói (0094). Herói com agência: a agenda mora no escritório (/creator/escritorio/agenda). Independente:
// compromissos que o titular cria (gravação, evento, reunião, entrega, outro) em grade mensal + lista do dia, mais as
// datas dos serviços do financeiro, sem valores. Titular cria/edita/exclui; membros da equipe leem.
export default async function HeroAgendaPage({ searchParams }: Props) {
  const ws = await getHeroWorkspace();
  if (ws.hasAgency) redirect("/creator/escritorio/agenda");
  const sp = await searchParams;
  const tz = defaultTimeZone;
  const { year, month } = parseMonth(sp.mes, tz);
  const { from, to } = queryRange(year, month);
  const range = gridRange(year, month);
  const [t, events, dates, services, feed, origin] = await Promise.all([
    getTranslations("heroWork.agenda"),
    listHeroEvents(ws.hero.id, from, to),
    listServiceDates(ws.hero.id, range.first, range.last),
    ws.canSeeFinance ? listHeroServices(ws.hero.id) : Promise.resolve({ available: true, items: [] }),
    myFeedState(),
    getOrigin(),
  ]);
  if (!events.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState title={t("unavailable")} />
      </div>
    );
  }
  const merged = mergeAgenda(events.items, dates, tz);
  return (
    <div className="flex flex-col gap-5" data-testid="hero-agenda">
      <PageHeader eyebrow={ws.hero.name} title={t("title")} description={ws.canWriteAgenda ? t("intro") : t("introMember")} />
      <HeroWorkTabs current="agenda" showFinance={ws.canSeeFinance} />
      {ws.hero.status === "suspended" ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="hero-suspended">
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t("suspended")}
        </p>
      ) : null}
      <HeroAgenda
        creatorId={ws.hero.id}
        events={merged}
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
      <FeedCard portal="hero" origin={origin} state={feed} />
    </div>
  );
}
