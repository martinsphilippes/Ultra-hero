import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EventList } from "@/components/calendar/EventList";
import { FeedCard } from "@/components/calendar/FeedCard";
import { MonthNav } from "@/components/calendar/MonthNav";
import { EmptyState, PageHeader } from "@/components/ui";
import { getOrigin } from "@/lib/auth/origin";
import { getBrandContext } from "@/lib/brand-portal/server";
import { monthKey, parseMonth, shiftMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState } from "@/lib/calendar/queries";
import { defaultTimeZone } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string }> };

// Agenda da marca: campanhas confirmadas, publicações, reuniões marcadas como visíveis e as datas comerciais
// que a agência publica. Nunca a agenda interna da agência nem a dos creators.
export default async function BrandAgendaPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const tz = defaultTimeZone;
  const { year, month } = parseMonth(sp.mes, tz);
  const next = shiftMonth(year, month, 1);
  const from = new Date(Date.UTC(year, month - 1, 1) - 24 * 3600_000).toISOString();
  const to = new Date(Date.UTC(next.year, next.month - 1, 1) + 24 * 3600_000).toISOString();
  const [t, list, feed, origin] = await Promise.all([getTranslations("brandPortal.agenda"), listEvents({ from, to, brandId: undefined }), myFeedState(), getOrigin()]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<CalendarDays />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const items = list.items.filter((e) => (e.brandId === null || e.brandId === ctx.brand.id) && monthKey(year, month) === new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date(e.startsAt)));
  return (
    <div className="flex flex-col gap-5" data-testid="brand-agenda">
      <PageHeader title={t("title")} description={ctx.agency ? t("description", { agency: ctx.agency.name }) : t("descriptionNoAgency")} />
      <MonthNav base="/marca/agenda" year={year} month={month} />
      <EventList events={items} timeZone={tz} portal="brand" emptyTitle={t("empty")} emptyHint={t("emptyHint")} />
      <p className="type-caption text-fg-muted">{t("note")}</p>
      {ctx.role ? <FeedCard portal="brand" origin={origin} state={feed} /> : null}
    </div>
  );
}
