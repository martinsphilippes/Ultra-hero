import { CalendarClock, CalendarDays, Gift, MapPin, Megaphone, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import type { BrandSponsorshipStatus, SponsorshipCore, SponsorshipStatus } from "@/lib/sponsorship/vocab";

// Oportunidade de patrocínio (0085): selo da situação e o resumo (quando, onde, alcance, redes, contrapartidas e
// prazo). Serve à agência, à marca e ao creator. Nunca valores.

type AnyStatus = SponsorshipStatus | BrandSponsorshipStatus | "closedDeadline";

const STATUS_VARIANT: Record<AnyStatus, BadgeVariant> = {
  draft: "info",
  open: "success",
  expired: "warning",
  closedDeadline: "warning",
  won: "accent",
  sponsored: "accent",
  closed: "neutral",
  cancelled: "danger",
};

export function SponsorshipStatusBadge({ status, closedReason = null }: { status: AnyStatus; closedReason?: "deadline" | "decision" | null }) {
  const t = useTranslations("sponsorship.status");
  const key: AnyStatus = status === "closed" && closedReason === "deadline" ? "closedDeadline" : status;
  return (
    <Badge size="sm" variant={STATUS_VARIANT[key]} data-testid="sponsorship-status" data-status={key}>
      {t(key)}
    </Badge>
  );
}

/** "20/11/2026 08:00–13:00", "20/11/2026" (dia inteiro) ou "20/11/2026 – 22/11/2026". */
export function sponsorshipWhen(o: Pick<SponsorshipCore, "startsAt" | "endsAt" | "allDay">, locale: Locale, timeZone: string): string {
  const start = new Date(o.startsAt);
  const end = new Date(o.endsAt);
  const day = (d: Date) => formatDate(d, locale, undefined, timeZone);
  if (o.allDay) {
    const last = new Date(Math.max(start.getTime(), end.getTime() - 60_000));
    return day(start) === day(last) ? day(start) : `${day(start)} – ${day(last)}`;
  }
  const time = (d: Date) => new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);
  if (day(start) === day(end)) return end.getTime() > start.getTime() ? `${day(start)} ${time(start)}–${time(end)}` : `${day(start)} ${time(start)}`;
  return `${formatDateTime(start, locale, timeZone)} – ${formatDateTime(end, locale, timeZone)}`;
}

type FactsProps = { o: SponsorshipCore; timeZone: string; /** nome do Hero */ talentName?: string | null; showDeadline?: boolean; hidePerks?: boolean };

export function SponsorshipFacts({ o, timeZone, talentName = null, showDeadline = true, hidePerks = false }: FactsProps) {
  const t = useTranslations("sponsorship.facts");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const row = "flex items-start gap-2 type-body-sm text-fg";
  const icon = "mt-0.5 size-4 shrink-0 text-accent-text";
  return (
    <div className="flex flex-col gap-3" data-testid="sponsorship-facts">
      <ul className="flex flex-col gap-2">
        {talentName ? (
          <li className={row}>
            <Users className={icon} aria-hidden="true" />
            <span>
              <span className="text-fg-muted">{t("hero")}: </span>
              {talentName}
            </span>
          </li>
        ) : null}
        <li className={row}>
          <CalendarDays className={icon} aria-hidden="true" />
          <span>
            <span className="text-fg-muted">{t("when")}: </span>
            {sponsorshipWhen(o, locale, timeZone)}
            {o.allDay ? ` · ${t("allDay")}` : ""}
          </span>
        </li>
        {o.location ? (
          <li className={row}>
            <MapPin className={icon} aria-hidden="true" />
            <span>
              <span className="text-fg-muted">{t("where")}: </span>
              {o.location}
            </span>
          </li>
        ) : null}
        {o.expectedReach ? (
          <li className={row}>
            <Megaphone className={icon} aria-hidden="true" />
            <span>
              <span className="text-fg-muted">{t("reach")}: </span>
              {/^\d{1,3}(\.\d{3})*$/.test(o.expectedReach) ? t("reachValue", { value: o.expectedReach }) : o.expectedReach}
            </span>
          </li>
        ) : null}
        {showDeadline ? (
          <li className={row}>
            <CalendarClock className={icon} aria-hidden="true" />
            <span>{t("respondBy", { date: formatDateTime(o.respondBy, locale, timeZone) })}</span>
          </li>
        ) : null}
      </ul>
      {o.networks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-caption text-fg-muted">{t("networks")}:</span>
          {o.networks.map((n) => (
            <Badge key={n} size="sm" variant="neutral">
              {tn(n)}
            </Badge>
          ))}
        </div>
      ) : null}
      {o.perks.length > 0 && !hidePerks ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Gift className="size-4 text-accent-text" aria-hidden="true" />
            {t("perks")}
          </span>
          <ul className="flex list-disc flex-col gap-1 pl-6 type-body-sm text-fg">
            {o.perks.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {o.description ? <p className="whitespace-pre-wrap type-body-sm text-fg-muted">{o.description}</p> : null}
    </div>
  );
}
