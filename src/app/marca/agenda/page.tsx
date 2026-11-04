import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { FeedCard } from "@/components/calendar/FeedCard";
import { EmptyState, PageHeader } from "@/components/ui";
import { getOrigin } from "@/lib/auth/origin";
import { getBrandContext } from "@/lib/brand-portal/server";
import { queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { parseMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState } from "@/lib/calendar/queries";
import { defaultTimeZone } from "@/i18n/config";
import { AgendaFilterBar } from "@/components/platform-calendar/AgendaFilterBar";
import { groscoveForAgenda, mergeWithGroscove } from "@/lib/platform-calendar/agenda";
import { agendaFilterParams, parseAgendaFilters } from "@/lib/platform-calendar/vocab";
import { monthKey } from "@/lib/calendar/ics";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string; dia?: string; cal?: string; territorio?: string; colecao?: string }> };

// Agenda da marca: campanhas confirmadas, publicações, reuniões marcadas como visíveis e as datas comerciais
// que a agência publica. Nunca a agenda interna da agência nem a dos creators.
export default async function BrandAgendaPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const tz = defaultTimeZone;
  const { year, month } = parseMonth(sp.mes, tz);
  // bloco 9: a grade cobre também os dias dos meses vizinhos e os eventos de vários dias em curso
  const { from, to } = queryRange(year, month);
  // 0098: + Calendário Groscove (agenda central da plataforma), com filtros próprios
  const gFilters = parseAgendaFilters(sp);
  const [t, list, feed, origin, groscove] = await Promise.all([
    getTranslations("brandPortal.agenda"),
    listEvents({ from, to, overlap: true, brandId: undefined }),
    myFeedState(),
    getOrigin(),
    groscoveForAgenda({ from, to }, gFilters),
  ]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<CalendarDays />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const items = mergeWithGroscove(
    list.items.filter((e) => e.brandId === null || e.brandId === ctx.brand.id),
    groscove.events,
    gFilters,
  );
  return (
    <div className="flex flex-col gap-5" data-testid="brand-agenda">
      <PageHeader title={t("title")} description={ctx.agency ? t("description", { agency: ctx.agency.name }) : t("descriptionNoAgency")} />
      <AgendaFilterBar base="/marca/agenda" params={{ mes: monthKey(year, month) }} filters={gFilters} collections={groscove.collections} />
      <AgendaCalendar events={items} timeZone={tz} portal="brand" year={year} month={month} today={zonedDayKey(new Date(), tz)} base="/marca/agenda" extraParams={agendaFilterParams(gFilters)} requestedDay={sp.dia} emptyTitle={t("empty")} emptyHint={t("emptyHint")} />
      <p className="type-caption text-fg-muted">{t("note")}</p>
      {ctx.role ? <FeedCard portal="brand" origin={origin} state={feed} /> : null}
    </div>
  );
}
