import { CalendarDays, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, EmptyState, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { EventKind } from "@/lib/calendar/vocab";
import { EventDeleteButton } from "./EventDeleteButton";

const KIND_VARIANT: Record<EventKind, BadgeVariant> = {
  campaign: "success",
  deliverable: "info",
  consult_deadline: "warning",
  meeting: "accent",
  recording: "accent",
  commercial_date: "warning",
  other: "neutral",
};

type Props = {
  events: CalendarEvent[];
  timeZone: string;
  /** Portal que está lendo: define links e ações. */
  portal: "agency" | "brand" | "office";
  canDelete?: boolean;
  emptyTitle: string;
  emptyHint?: string;
};

/** Chave de dia no fuso (YYYY-MM-DD) para agrupar. */
function dayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Lista agrupada por dia (serve aos três portais): tipo, horário ou "dia inteiro", título, de quem é,
// local; na agência, link para o negócio e remoção dos manuais. Nunca valores.
export function EventList({ events, timeZone, portal, canDelete = false, emptyTitle, emptyHint }: Props) {
  const t = useTranslations("commercial.agenda");
  const tk = useTranslations("commercial.eventKinds");
  const locale = useLocale() as Locale;
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState icon={<CalendarDays />} title={emptyTitle} description={emptyHint} size="sm" />
      </div>
    );
  }
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dayKey(e.startsAt, timeZone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(e);
  }
  const timeOf = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <ol className="flex flex-col gap-4" data-testid="event-list">
      {Array.from(groups.entries()).map(([day, items]) => (
        <li key={day} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{formatDate(`${day}T12:00:00`, locale, { weekday: "long", day: "2-digit", month: "long" }, timeZone)}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-3 p-3" data-testid="event-item" data-kind={e.kind}>
                <span className="w-24 shrink-0 font-mono text-sm text-fg-muted">
                  {e.allDay ? t("allDay") : `${timeOf(e.startsAt)}${e.endsAt !== e.startsAt ? `–${timeOf(e.endsAt)}` : ""}`}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" variant={KIND_VARIANT[e.kind]}>
                      {tk(e.kind)}
                    </Badge>
                    {portal === "agency" && e.dealId ? (
                      <Link href={`/agencia/negocios/${e.dealId}`} className="text-sm font-semibold text-fg underline-offset-2 hover:underline">
                        {e.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-fg">{e.title}</span>
                    )}
                  </span>
                  {e.subtitle ? <span className="type-caption text-fg-muted">{e.subtitle}</span> : null}
                  {e.description ? <span className="whitespace-pre-wrap type-body-sm text-fg-muted">{e.description}</span> : null}
                  {e.location ? (
                    <span className="flex items-center gap-1 type-caption text-fg-muted">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {e.location}
                    </span>
                  ) : null}
                  {portal === "agency" ? (
                    <span className="type-caption text-fg-subtle">
                      {e.source === "system" ? t("system") : t("manual")}
                      {e.visibleToBrand ? ` · ${t("visibleBrand")}` : ""}
                      {e.visibleToTalent ? ` · ${t("visibleTalent")}` : ""}
                      {e.allDay && new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime() > 86_400_000 ? ` · ${t("until", { date: formatDate(new Date(new Date(e.endsAt).getTime() - 60_000), locale, undefined, timeZone) })}` : ""}
                    </span>
                  ) : null}
                </span>
                {canDelete && e.source === "manual" ? <EventDeleteButton id={e.id} dealId={e.dealId} title={e.title} /> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
