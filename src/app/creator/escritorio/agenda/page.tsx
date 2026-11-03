import type { Metadata } from "next";
import { CalendarDays, Handshake } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AgendaCalendar } from "@/components/calendar/AgendaCalendar";
import { FeedCard } from "@/components/calendar/FeedCard";
import { PublicChips } from "@/components/sponsorship/NegotiationView";
import { SponsorshipStatusBadge, sponsorshipWhen } from "@/components/sponsorship/SponsorshipView";
import { EmptyState } from "@/components/ui";
import { defaultTimeZone, type Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getOrigin } from "@/lib/auth/origin";
import { queryRange, zonedDayKey } from "@/lib/calendar/grid";
import { parseMonth } from "@/lib/calendar/ics";
import { listEvents, myFeedState } from "@/lib/calendar/queries";
import { listTalentSponsorships } from "@/lib/sponsorship/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("agenda") };
}

type Props = { searchParams: Promise<{ mes?: string; dia?: string }> };

// Agenda do creator (web e app): campanhas confirmadas, prazos de resposta, entregas e gravações que a
// agência marcou como visíveis para ele. A agenda pessoal dele fica fora; o feed .ics leva tudo ao celular.
export default async function OfficeAgendaPage({ searchParams }: Props) {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const tz = defaultTimeZone;
  const { year, month } = parseMonth(sp.mes, tz);
  // bloco 9: a grade cobre também os dias dos meses vizinhos e os eventos de vários dias em curso
  const { from, to } = queryRange(year, month);
  const [t, tsp, locale, list, feed, origin, sponsorships] = await Promise.all([
    getTranslations("talent.agenda"),
    getTranslations("sponsorship.talent"),
    getLocale() as Promise<Locale>,
    listEvents({ from, to, overlap: true, talentId: ctx.talent.id }),
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
  return (
    <div className="flex flex-col gap-5" data-testid="office-agenda">
      <p className="type-body-sm text-fg-muted">{t("intro")}</p>
      <AgendaCalendar events={list.items} timeZone={tz} portal="office" year={year} month={month} today={zonedDayKey(new Date(), tz)} base="/creator/escritorio/agenda" requestedDay={sp.dia} emptyTitle={t("empty")} emptyHint={t("emptyHint")} />
      {/* 0085: situações suas que a agência ofereceu às marcas; se patrocinada, por quem (nunca quem recusou); 0088: + público e o combinado */}
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
                  {o.sponsors.length > 0
                    ? tsp("sponsoredBy", { brands: o.sponsors.join(", ") })
                    : o.status === "open"
                      ? tsp("open", { date: formatDateTime(o.respondBy, locale, tz) })
                      : tsp("closed")}
                </span>
                <PublicChips value={o.public} label={tsp("public")} />
                {/* 0088: o que ficou combinado com cada marca (o que o creator vai fazer); nunca o valor da marca */}
                {o.agreements.map((a) => (
                  <div key={`${a.brand}-${a.tier}`} className="mt-1 flex flex-col gap-1 rounded-xl bg-accent-soft p-3" data-testid="office-sponsorship-agreement">
                    <span className="text-sm font-semibold text-fg">{tsp("agreement", { brand: a.brand, tier: a.tier })}</span>
                    <ul className="flex list-disc flex-col gap-0.5 pl-5 type-body-sm text-fg">
                      {a.perks.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <FeedCard portal="office" origin={origin} state={feed} />
    </div>
  );
}
