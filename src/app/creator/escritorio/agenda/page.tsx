import type { Metadata } from "next";
import { CalendarDays, Handshake } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { EventList } from "@/components/calendar/EventList";
import { FeedCard } from "@/components/calendar/FeedCard";
import { MonthNav } from "@/components/calendar/MonthNav";
import { SponsorshipStatusBadge, sponsorshipWhen } from "@/components/sponsorship/SponsorshipView";
import { EmptyState } from "@/components/ui";
import { defaultTimeZone, type Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getOrigin } from "@/lib/auth/origin";
import { monthKey, parseMonth, shiftMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState } from "@/lib/calendar/queries";
import { listTalentSponsorships } from "@/lib/sponsorship/queries";
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
  const [t, tsp, locale, list, feed, origin, sponsorships] = await Promise.all([
    getTranslations("talent.agenda"),
    getTranslations("sponsorship.talent"),
    getLocale() as Promise<Locale>,
    listEvents({ from, to, talentId: ctx.talent.id }),
    myFeedState(),
    getOrigin(),
    listTalentSponsorships(),
  ]);
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
      {/* 0085: situações suas que a agência ofereceu às marcas; se patrocinada, por quem (nunca quem recusou) */}
      {sponsorships.items.length > 0 ? (
        <section aria-labelledby="office-sponsorships" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="office-sponsorships">
          <div className="flex flex-col gap-1">
            <h2 id="office-sponsorships" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Handshake className="size-4 text-accent-text" aria-hidden="true" />
              {tsp("title")}
            </h2>
            <p className="type-caption text-fg-muted">{tsp("hint")}</p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {sponsorships.items.map((o) => (
              <li key={o.id} className="flex flex-col gap-1 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <SponsorshipStatusBadge status={o.status} />
                  <span className="text-sm font-semibold text-fg">{o.title}</span>
                </span>
                <span className="type-caption text-fg-muted">
                  {sponsorshipWhen(o, locale, tz)}
                  {o.location ? ` · ${o.location}` : ""}
                </span>
                <span className="type-caption text-fg">
                  {o.status === "sponsored" && o.sponsors.length > 0
                    ? tsp("sponsoredBy", { brands: o.sponsors.join(", ") })
                    : o.status === "open"
                      ? tsp("open", { date: formatDateTime(o.respondBy, locale, tz) })
                      : tsp("closed")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <FeedCard portal="office" origin={origin} state={feed} />
    </div>
  );
}
