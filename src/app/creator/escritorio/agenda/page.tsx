import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EventList } from "@/components/calendar/EventList";
import { FeedCard } from "@/components/calendar/FeedCard";
import { MonthNav } from "@/components/calendar/MonthNav";
import { EmptyState } from "@/components/ui";
import { defaultTimeZone } from "@/i18n/config";
import { getOrigin } from "@/lib/auth/origin";
import { monthKey, parseMonth, shiftMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState } from "@/lib/calendar/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string }> };

// Agenda do creator (web e app): campanhas confirmadas, prazos de resposta, entregas e gravações que a
// agência marcou como visíveis para ele. A agenda pessoal dele fica fora; o feed .ics leva tudo ao celular.
export default async function OfficeAgendaPage({ searchParams }: Props) {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const tz = defaultTimeZone;
  const { year, month } = parseMonth(sp.mes, tz);
  const next = shiftMonth(year, month, 1);
  const from = new Date(Date.UTC(year, month - 1, 1) - 24 * 3600_000).toISOString();
  const to = new Date(Date.UTC(next.year, next.month - 1, 1) + 24 * 3600_000).toISOString();
  const [t, list, feed, origin] = await Promise.all([getTranslations("talent.agenda"), listEvents({ from, to, talentId: ctx.talent.id }), myFeedState(), getOrigin()]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<CalendarDays />} title={t("unavailable")} />
      </div>
    );
  }
  const items = list.items.filter((e) => monthKey(year, month) === new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date(e.startsAt)));
  return (
    <div className="flex flex-col gap-5" data-testid="office-agenda">
      <p className="type-body-sm text-fg-muted">{t("intro")}</p>
      <MonthNav base="/creator/escritorio/agenda" year={year} month={month} />
      <EventList events={items} timeZone={tz} portal="office" emptyTitle={t("empty")} emptyHint={t("emptyHint")} />
      <FeedCard portal="office" origin={origin} state={feed} />
    </div>
  );
}
