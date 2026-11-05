import { Ban, CalendarDays, Hash, Info, MapPin } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { zonedDayKey } from "@/lib/calendar/grid";
import { platformToCalendar, type InterestItem, type PlatformEvent } from "@/lib/platform-calendar/queries";
import { PLATFORM_DEFAULT_TZ } from "@/lib/platform-calendar/vocab";
import { PlatformBadges } from "./PlatformBadges";

/** "25 de dezembro de 2026" / "12 jan – 21 abr 2026" / "5 de nov. 20:00–23:00 (America/Manaus)". */
export function eventWhen(e: Pick<PlatformEvent, "startsAt" | "endsAt" | "allDay" | "timezone">, locale: Locale): string {
  const long: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  if (e.allDay) {
    const first = zonedDayKey(e.startsAt, e.timezone);
    const lastIso = new Date(new Date(e.endsAt).getTime() - 60_000);
    const last = zonedDayKey(lastIso, e.timezone);
    const a = formatDate(e.startsAt, locale, long, e.timezone);
    return last > first ? `${a} – ${formatDate(lastIso, locale, long, e.timezone)}` : a;
  }
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: e.timezone }).format(new Date(iso));
  const tz = e.timezone !== PLATFORM_DEFAULT_TZ ? ` (${e.timezone})` : "";
  return `${formatDate(e.startsAt, locale, long, e.timezone)}, ${time(e.startsAt)}–${time(e.endsAt)}${tz}`;
}

type Props = { event: PlatformEvent; showStatus?: boolean; showSourceNotes?: boolean; children?: ReactNode };

// Detalhe de um evento do Calendário Groscove (0098), igual nos quatro portais: selos, título (riscado se cancelado),
// quando (no fuso do evento), descrição, hashtags e local. `children`: o painel do portal (interesse, interessados…).
export async function PlatformEventView({ event: e, showStatus = false, showSourceNotes = false, children }: Props) {
  const [t, locale] = await Promise.all([getTranslations("groscoveCalendar"), getLocale() as Promise<Locale>]);
  const info = platformToCalendar(e).platform!;
  const cancelled = e.status === "cancelled";
  const note = typeof e.extra.note === "string" ? e.extra.note : "";
  const page = e.extra.source_page;
  return (
    <article className="flex flex-col gap-4" data-testid="platform-event" data-status={e.effective}>
      <div className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
        <PlatformBadges info={info} showStatus={showStatus} size="md" />
        <h1 className={`text-xl font-semibold text-fg ${cancelled ? "line-through decoration-2 opacity-70" : ""}`}>{e.title}</h1>
        <p className="flex items-start gap-2 type-body-sm text-fg">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          <span>{eventWhen(e, locale)}</span>
        </p>
        {e.location ? (
          <p className="flex items-start gap-2 type-body-sm text-fg-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {e.location}
          </p>
        ) : null}
        {e.category ? <p className="type-caption text-fg-muted">{t("detail.category", { category: e.category })}</p> : null}
        {e.tentative ? <p className="type-caption text-warning">{t("detail.tentativeHint")}</p> : null}
        {cancelled ? (
          <p className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 type-body-sm text-fg" data-testid="platform-cancelled">
            <Ban className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            {e.cancelReason ? t("detail.cancelledReason", { reason: e.cancelReason }) : t("detail.cancelled")}
          </p>
        ) : null}
      </div>
      {e.description ? <p className="whitespace-pre-wrap type-body text-fg">{e.description}</p> : null}
      {e.hashtags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t("detail.hashtags")}>
          {e.hashtags.map((h) => (
            <li key={h} className="inline-flex items-center gap-0.5 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-accent-text">
              <Hash className="size-3" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>
      ) : null}
      {showSourceNotes && (note || page !== undefined || e.extra.uncertain) ? (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 type-caption text-fg-muted" data-testid="platform-source-notes">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {[
              page !== undefined ? t("detail.sourcePage", { page: Array.isArray(page) ? page.join(", ") : String(page) }) : null,
              e.extra.uncertain ? t("detail.uncertain") : null,
              note || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
      ) : null}
      {children}
    </article>
  );
}

type ListProps = { items: InterestItem[]; title: string; hint?: string; empty: string };

/** Lista de interessados (Heros e marcas), já filtrada pela RLS para quem vê. */
export async function InterestList({ items, title, hint, empty }: ListProps) {
  const [t, locale] = await Promise.all([getTranslations("groscoveCalendar.interest"), getLocale() as Promise<Locale>]);
  const groups: ["hero" | "brand", InterestItem[]][] = [
    ["hero", items.filter((i) => i.party === "hero")],
    ["brand", items.filter((i) => i.party === "brand")],
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="interest-list">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {hint ? <p className="type-caption text-fg-muted">{hint}</p> : null}
      </div>
      {items.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{empty}</p>
      ) : (
        groups
          .filter(([, list]) => list.length > 0)
          .map(([party, list]) => (
            <div key={party} className="flex flex-col gap-1">
              <h3 className="type-caption font-semibold uppercase tracking-wide text-fg-muted">{party === "hero" ? t("heroes") : t("brands")}</h3>
              <ul className="flex flex-col divide-y divide-border">
                {list.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-state={i.state}>
                    <span className={`text-sm font-medium ${i.state === "withdrawn" ? "text-fg-muted line-through" : "text-fg"}`}>{i.name}</span>
                    <span className="type-caption text-fg-muted">
                      {i.state === "interested" ? t("since", { date: formatDate(i.updatedAt, locale) }) : t("withdrawnOn", { date: formatDate(i.updatedAt, locale) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
      )}
    </section>
  );
}

/** Contagens totais (só números): todos os leitores veem. */
export async function InterestCounts({ counts }: { counts: { heroes: number; brands: number } | null }) {
  if (!counts) return null;
  const t = await getTranslations("groscoveCalendar.interest");
  return (
    <p className="type-caption text-fg-muted" data-testid="interest-counts">
      {t("counts", { heroes: counts.heroes, brands: counts.brands })}
    </p>
  );
}
