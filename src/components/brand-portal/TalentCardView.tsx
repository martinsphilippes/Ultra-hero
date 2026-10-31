import { AtSign, CalendarCheck, CalendarX, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { AudienceBars } from "@/components/talent/AudienceBars";
import { MetricSource } from "@/components/talent/MetricSource";
import { Avatar, Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { TalentCard } from "@/lib/deals/queries";
import { formatBp, formatCount, pickAudience, type KitNetwork } from "@/lib/talent/media-kit";

// Cartão autorizado do creator para a marca: só os campos que o kit libera, métricas sempre com fonte e
// data (declaradas), disponibilidade comercial por período. Nunca valores, contatos ou notas internas.

export function TalentCardCompact({ card, href }: { card: TalentCard; href: string }) {
  const t = useTranslations("brandPortal.creators");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const top = (card.networks ?? []).find((n) => typeof n.followers === "number");
  return (
    <Link href={href} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="catalog-card">
      <span className="flex items-center gap-3">
        <Avatar src={card.photoUrl ?? null} name={card.name} size="md" alt="" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-fg">{card.name}</span>
          <span className="truncate type-caption text-fg-muted">{card.headline || [card.city, card.state].filter(Boolean).join(" · ") || t("noHeadline")}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        <Badge size="sm" variant={card.availability === "available" ? "success" : "warning"}>
          {t(`availability.${card.availability}`)}
        </Badge>
        {card.insufficientData ? (
          <Badge size="sm" variant="neutral">
            {t("insufficientData")}
          </Badge>
        ) : null}
        {(card.matched ?? []).map((m) => (
          <Badge key={m} size="sm" variant="info">
            {t(`matched.${m}`)}
          </Badge>
        ))}
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-1 type-caption text-fg-muted">
        <span>{(card.segments ?? []).map((s) => s.name).join(", ") || t("noSegments")}</span>
        {top ? <span>{t("followers", { network: tn(top.network), count: formatCount(top.followers, locale) ?? "" })}</span> : <span>{t("noMetrics")}</span>}
      </span>
    </Link>
  );
}

export function TalentCardFull({ card }: { card: TalentCard }) {
  const t = useTranslations("brandPortal.creators");
  const tk = useTranslations("mediaKit.view");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const networks = (card.networks ?? []) as KitNetwork[];
  const audience = pickAudience(networks);
  const card2 = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const metric = (label: string, value: string | null) => (
    <div className="flex flex-col">
      <dt className="type-caption text-fg-muted">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-fg">{value ?? <span className="font-sans font-normal text-fg-muted">{tk("notInformed")}</span>}</dd>
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]" data-testid="catalog-detail">
      <div className="flex flex-col gap-5">
        <section className={card2}>
          <div className="flex items-start gap-4">
            <Avatar src={card.photoUrl ?? null} name={card.name} size="lg" alt="" />
            <div className="flex min-w-0 flex-col gap-1">
              {card.headline ? <p className="text-sm font-medium text-fg">{card.headline}</p> : null}
              {card.city || card.state ? (
                <p className="flex items-center gap-1 type-caption text-fg-muted">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {[card.city, card.state].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <span className="flex flex-wrap gap-1.5">
                <Badge size="sm" variant={card.availability === "available" ? "success" : "warning"}>
                  {t(`availability.${card.availability}`)}
                </Badge>
                {(card.segments ?? []).map((s) => (
                  <Badge key={s.id} size="sm">
                    {s.name}
                  </Badge>
                ))}
              </span>
            </div>
          </div>
          {card.about ? <p className="whitespace-pre-wrap text-sm text-fg">{card.about}</p> : null}
        </section>
        <section className={card2} aria-labelledby="creator-networks">
          <h2 id="creator-networks" className="text-base font-semibold text-fg">
            {t("networksTitle")}
          </h2>
          {networks.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("noMetrics")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {networks.map((n) => (
                <li key={`${n.network}-${n.handle}`} className="flex flex-col gap-2 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <AtSign className="size-4 text-fg-subtle" aria-hidden="true" />
                    {tn(n.network)} · @{n.handle}
                  </span>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {metric(tk("followers"), formatCount(n.followers, locale))}
                    {metric(tk("views"), formatCount(n.avg_views, locale))}
                    {metric(tk("reach"), formatCount(n.avg_reach, locale))}
                    {metric(tk("engagement"), typeof n.engagement_bp === "number" ? formatBp(n.engagement_bp, locale) : null)}
                  </dl>
                  <MetricSource asOf={n.as_of} side={n.declared_side} declaredAt={n.declared_at ?? null} />
                </li>
              ))}
            </ul>
          )}
          {audience ? <AudienceBars audience={audience.audience} /> : null}
        </section>
        {card.brands && card.brands.length > 0 ? (
          <section className={card2} aria-labelledby="creator-brands">
            <h2 id="creator-brands" className="text-base font-semibold text-fg">
              {t("brandsTitle")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {card.brands.map((b) => (
                <li key={b.name}>
                  <Badge>{b.name}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div className="flex flex-col gap-5">
        <section className={card2} aria-labelledby="creator-availability" data-testid="catalog-availability">
          <h2 id="creator-availability" className="text-base font-semibold text-fg">
            {t("availabilityTitle")}
          </h2>
          <p className="type-caption text-fg-muted">{t("availabilityHint")}</p>
          {(card.availabilityPeriods ?? []).length === 0 && (card.blockedPeriods ?? []).length === 0 ? <p className="type-body-sm text-fg-muted">{t("noPeriods")}</p> : null}
          <ul className="flex flex-col gap-1.5">
            {(card.availabilityPeriods ?? []).map((p) => (
              <li key={`a-${p.startsOn}`} className="flex items-center gap-2 text-sm text-fg">
                <CalendarCheck className="size-4 text-success" aria-hidden="true" />
                {formatPlainDate(p.startsOn, locale)} – {formatPlainDate(p.endsOn, locale)}
                {p.note ? <span className="type-caption text-fg-muted">· {p.note}</span> : null}
              </li>
            ))}
            {(card.blockedPeriods ?? []).map((p) => (
              <li key={`b-${p.startsOn}`} className="flex items-center gap-2 text-sm text-fg-muted">
                <CalendarX className="size-4" aria-hidden="true" />
                {formatPlainDate(p.startsOn, locale)} – {formatPlainDate(p.endsOn, locale)} · {t("blocked")}
              </li>
            ))}
          </ul>
        </section>
        {card.agency ? <p className="type-caption text-fg-muted">{t("representedBy", { agency: card.agency.name })}</p> : null}
      </div>
    </div>
  );
}
