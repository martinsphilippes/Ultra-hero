"use client";

import { CalendarPlus, Car, CheckCircle2, Clock, MapPin, Pencil, Users, UtensilsCrossed, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, Button, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { cancelShootDayAction, checkinAction } from "@/lib/project-room/actions";
import type { RoomMember, ShootDay } from "@/lib/project-room/queries";
import { buildShootIcs, checkinOpen, mapHref, type RoomPortal } from "@/lib/project-room/vocab";
import { ShootDayForm } from "./ShootDayForm";

type Props = {
  portal: RoomPortal;
  dealId: string;
  dealTitle: string;
  day: ShootDay;
  timezone: string;
  /** Agência que pode mexer na sala: edita e cancela. */
  canManage: boolean;
  /** Agência e staff veem os horários de chegada. */
  showArrivals: boolean;
  people: RoomMember[];
  canCheckin: boolean;
};

// Ficha da diária (0110): data/hora, local com mapa, estacionamento, alimentação, limite de pessoas, equipe com função e
// "Cheguei ao local" (cada pessoa no próprio celular). A agência vê quem chegou; a ficha vai para a agenda (.ics).
export function ShootDayCard({ portal, dealId, dealTitle, day, timezone, canManage, showArrivals, people, canCheckin }: Props) {
  const t = useTranslations("projectRoom.shoot");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const me = day.crew.find((c) => c.me) ?? null;
  const when = formatDate(day.startsAt, locale, { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }, timezone);
  const until = formatDate(day.endsAt, locale, { hour: "2-digit", minute: "2-digit" }, timezone);
  const open = checkinOpen(day.startsAt, day.endsAt);

  function checkin() {
    start(async () => {
      const result = await checkinAction({ portal, dealId, shootDayId: day.id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  function cancel() {
    if (!window.confirm(t("confirmCancel"))) return;
    start(async () => {
      const result = await cancelShootDayAction({ dealId, id: day.id });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  function download() {
    const ics = buildShootIcs({ id: day.id, title: t("icsTitle", { deal: dealTitle }), location: day.location, mapUrl: day.mapUrl, startsAt: day.startsAt, endsAt: day.endsAt, notes: [day.parking, day.food].filter(Boolean).join(" · ") }, timezone);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "diaria.ics";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="shoot-day">
      <header className="flex flex-col gap-1">
        <span className="type-caption font-semibold uppercase tracking-wider text-accent-text">{t("title")}</span>
        <p className="text-base font-semibold capitalize text-fg">
          {when} – {until}
        </p>
      </header>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="type-caption text-fg-muted">{t("location")}</dt>
            <dd className="text-fg">
              {day.location} ·{" "}
              <a href={mapHref(day.location, day.mapUrl)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-text underline-offset-2 hover:underline">
                {t("openMap")}
              </a>
            </dd>
          </div>
        </div>
        {day.parking ? (
          <div className="flex items-start gap-2">
            <Car className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <div>
              <dt className="type-caption text-fg-muted">{t("parking")}</dt>
              <dd className="text-fg">{day.parking}</dd>
            </div>
          </div>
        ) : null}
        {day.food ? (
          <div className="flex items-start gap-2">
            <UtensilsCrossed className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <div>
              <dt className="type-caption text-fg-muted">{t("food")}</dt>
              <dd className="text-fg">{day.food}</dd>
            </div>
          </div>
        ) : null}
        {day.peopleLimit ? (
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <div>
              <dt className="type-caption text-fg-muted">{t("limit")}</dt>
              <dd className="text-fg">{t("people", { n: day.peopleLimit })}</dd>
            </div>
          </div>
        ) : null}
      </dl>
      {day.notes ? <p className="whitespace-pre-wrap type-body-sm text-fg-muted">{day.notes}</p> : null}
      <section className="flex flex-col gap-2" aria-label={t("crew")}>
        <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
          {t("crew")}
          {showArrivals && day.arrived !== null ? (
            <Badge size="sm" variant={day.arrived === day.total && day.total > 0 ? "success" : "neutral"} data-testid="shoot-arrived">
              {t("arrived", { n: day.arrived, total: day.total })}
            </Badge>
          ) : null}
        </h4>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {day.crew.map((c, i) => (
            <li key={`${c.name}:${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-fg">{c.name}</span>
                <span className="type-caption text-fg-muted">{[t(`sides.${c.side === "talent" || c.side === "staff" ? c.side : "agency"}`), c.role].filter(Boolean).join(" · ")}</span>
              </span>
              {c.checkedInAt ? (
                <span className="flex shrink-0 items-center gap-1 type-caption text-success">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {formatDate(c.checkedInAt, locale, { hour: "2-digit", minute: "2-digit" }, timezone)}
                </span>
              ) : showArrivals || c.me ? (
                <span className="flex shrink-0 items-center gap-1 type-caption text-fg-muted">
                  <Clock className="size-4" aria-hidden="true" />
                  {t("notYet")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {me && canCheckin ? (
          me.checkedInAt ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {t("youArrived")}
            </p>
          ) : (
            <Button type="button" size="lg" block onClick={checkin} loading={pending} disabled={!open} leadingIcon={<MapPin />} data-testid="shoot-checkin" className="sm:w-auto">
              {open ? t("checkin") : t("checkinClosed")}
            </Button>
          )
        ) : null}
        <Button type="button" variant="secondary" onClick={download} leadingIcon={<CalendarPlus />}>
          {t("addToCalendar")}
        </Button>
        {canManage ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setEditing(true)} leadingIcon={<Pencil />} disabled={pending}>
              {t("edit")}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel} leadingIcon={<XCircle />} disabled={pending}>
              {t("cancel")}
            </Button>
          </>
        ) : null}
      </div>
      <p className="type-caption text-fg-subtle">{t("checkinHint")}</p>
      {editing ? <ShootDayForm dealId={dealId} day={day} people={people} timezone={timezone} onClose={() => setEditing(false)} /> : null}
    </article>
  );
}
