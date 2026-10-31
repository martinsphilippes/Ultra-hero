import { AtSign, ExternalLink, Mail, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, Badge } from "@/components/ui";
import { formatBp, formatCount, pickAudience, type ResolvedKit } from "@/lib/talent/media-kit";
import { AudienceBars } from "./AudienceBars";
import { MetricSource } from "./MetricSource";

// Media kit renderizado: a prévia do editor e a página pública /kit usam este mesmo componente com o
// formato de media_kit_resolve. Só aparece o que veio (campo não marcado = chave ausente). Nunca valores.
export function KitView({ kit, headingLevel = 1 }: { kit: ResolvedKit; headingLevel?: 1 | 2 }) {
  const t = useTranslations("mediaKit.view");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale();
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const Sub = headingLevel === 1 ? "h2" : "h3";
  const fields = new Set(kit.fields);
  const audience = fields.has("audience") && kit.networks ? pickAudience(kit.networks) : null;
  const location = [kit.city, kit.state].filter(Boolean).join(" · ");
  const metric = (label: string, value: string | null) => (
    <div className="flex flex-col">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-fg">{value ?? <span className="font-sans font-normal text-fg-muted">{t("notInformed")}</span>}</dd>
    </div>
  );

  return (
    <article className="flex flex-col gap-5" data-testid="kit-view">
      <header className="flex items-center gap-4">
        <Avatar src={fields.has("photo") ? (kit.photo_url ?? null) : null} name={kit.name} size="xl" alt="" />
        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="text-xl font-bold text-fg sm:text-2xl">{kit.name}</Heading>
          {kit.headline ? <p className="text-sm text-fg-muted">{kit.headline}</p> : null}
          {fields.has("location") && location ? (
            <p className="flex items-center gap-1 text-xs text-fg-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {location}
            </p>
          ) : null}
        </div>
      </header>

      {kit.about ? <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{kit.about}</p> : null}

      {kit.segments && kit.segments.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("segments")}>
          {kit.segments.map((s) => (
            <li key={s}>
              <Badge size="sm">{s}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {kit.networks ? (
        <section className="flex flex-col gap-3" aria-labelledby="kit-networks">
          <Sub id="kit-networks" className="text-sm font-semibold text-fg">
            {t("networks")}
          </Sub>
          {kit.networks.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("noNetworks")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {kit.networks.map((n) => (
                <li key={`${n.network}-${n.handle}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-fg">
                      <AtSign className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                      <span className="truncate">{n.handle}</span>
                    </span>
                    <Badge size="sm">{tn(n.network)}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {fields.has("followers") ? metric(t("followers"), formatCount(n.followers, locale)) : null}
                    {fields.has("views") ? metric(t("views"), formatCount(n.avg_views, locale)) : null}
                    {fields.has("reach") ? metric(t("reach"), formatCount(n.avg_reach, locale)) : null}
                    {fields.has("engagement") ? metric(t("engagement"), n.engagement_bp === null || n.engagement_bp === undefined ? null : formatBp(n.engagement_bp, locale)) : null}
                  </dl>
                  <MetricSource asOf={n.as_of} side={n.declared_side} declaredAt={n.declared_at} />
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex w-fit items-center gap-1 text-xs font-medium text-accent-text underline-offset-2 hover:underline">
                      {t("openProfile")}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {fields.has("audience") && kit.networks ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="kit-audience">
          <Sub id="kit-audience" className="text-sm font-semibold text-fg">
            {t("audience")}
          </Sub>
          <AudienceBars audience={audience?.audience ?? null} />
          {audience ? (
            <MetricSource asOf={audience.as_of} side={audience.declared_side} declaredAt={audience.declared_at} />
          ) : null}
        </section>
      ) : null}

      {kit.brands && kit.brands.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="kit-brands">
          <Sub id="kit-brands" className="text-sm font-semibold text-fg">
            {t("brands")}
          </Sub>
          <ul className="flex flex-wrap gap-2">
            {kit.brands.map((b) => (
              <li key={b.name}>
                <Badge size="sm">{b.name}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {kit.agency ? (
        <footer className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-hover p-4 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("contact")}</span>
          <span className="font-medium text-fg">{kit.agency}</span>
          {kit.agency_email ? (
            <a href={`mailto:${kit.agency_email}`} className="inline-flex w-fit items-center gap-1 text-accent-text underline-offset-2 hover:underline">
              <Mail className="size-3.5" aria-hidden="true" />
              {kit.agency_email}
            </a>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
