import { ArrowRight, CalendarDays, Handshake, Heart, Megaphone, Send } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { commercialHref, newCallHref, newCampaignHref, newSponsorshipHref } from "@/lib/culture/links";
import type { CommercialItem } from "@/lib/culture/select";
import type { PlatformEvent } from "@/lib/platform-calendar/queries";
import { eventWhen } from "@/components/platform-calendar/PlatformEventView";

const box = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";

/** Aviso no topo dos formulários de proposta abertos a partir de um evento (0101). */
export async function FromEventNotice({ event, href, missing = false }: { event: PlatformEvent | null; href?: string; missing?: boolean }) {
  const [t, locale] = await Promise.all([getTranslations("culture.fromEvent"), getLocale() as Promise<Locale>]);
  if (missing || !event) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg" data-testid="from-event-missing">
        {t("unavailable")}
      </p>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-3" data-testid="from-event">
      <CalendarDays className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-caption font-semibold uppercase tracking-wide text-accent-text">{t("title")}</span>
        {href ? (
          <Link href={href} className="text-sm font-semibold text-fg underline-offset-2 hover:underline">
            {event.title}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-fg">{event.title}</span>
        )}
        <span className="type-caption text-fg-muted">{eventWhen(event, locale)}</span>
        <span className="type-caption text-fg-muted">{t("hint")}</span>
      </div>
    </div>
  );
}

/** Marca no evento (0101): "Sua marca demonstrou interesse" e os atalhos para propor pelos fluxos existentes. */
export async function BrandEventActions({ eventId, interested, canPropose, hasAgency, closed }: { eventId: string; interested: boolean; canPropose: boolean; hasAgency: boolean; closed: boolean }) {
  const t = await getTranslations("culture.brand");
  return (
    <section className={box} aria-labelledby="brand-commerce-title" data-testid="brand-event-actions">
      <h2 id="brand-commerce-title" className="text-sm font-semibold text-fg">
        {t("title")}
      </h2>
      {interested ? (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 type-body-sm font-medium text-fg" data-testid="brand-interested">
          <Heart className="size-4 shrink-0 fill-current text-success" aria-hidden="true" />
          {t("interested")}
        </p>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("notInterested")}</p>
      )}
      {!canPropose ? (
        <p className="type-body-sm text-fg-muted">{t("membersOnly")}</p>
      ) : closed ? null : (
        <div className="flex flex-col gap-2">
          {hasAgency ? (
            <Button asChild size="lg" leadingIcon={<Megaphone />} className="h-auto min-h-12 w-full whitespace-normal py-2.5 text-center sm:w-fit">
              <Link href={newCampaignHref(eventId)} data-testid="event-create-campaign">
                {t("campaign")}
              </Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant="secondary" leadingIcon={<Send />} className="h-auto min-h-12 w-full whitespace-normal py-2.5 text-center sm:w-fit">
            <Link href={newCallHref(eventId)} data-testid="event-open-call">
              {t("call")}
            </Link>
          </Button>
          {!hasAgency ? <p className="type-caption text-fg-muted">{t("needsAgency")}</p> : null}
        </div>
      )}
      <p className="type-caption text-fg-subtle">{t("heroesHidden")}</p>
    </section>
  );
}

/** Agência no evento (0101): atalho para a oportunidade de patrocínio (o herói é escolhido no formulário). */
export async function AgencyEventActions({ eventId, canCreate, closed }: { eventId: string; canCreate: boolean; closed: boolean }) {
  const t = await getTranslations("culture.agency");
  if (closed) return null;
  return (
    <section className={box} data-testid="agency-event-actions">
      {canCreate ? (
        <>
          <Button asChild size="lg" leadingIcon={<Handshake />} className="h-auto min-h-12 w-full whitespace-normal py-2.5 text-center sm:w-fit">
            <Link href={newSponsorshipHref(eventId)} data-testid="event-create-opportunity">
              {t("create")}
            </Link>
          </Button>
          <p className="type-caption text-fg-muted">{t("heroLater")}</p>
        </>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("managersOnly")}</p>
      )}
    </section>
  );
}

export type CompatHero = { id: string; name: string; talentId: string | null };
export type CompatBrand = { id: string; name: string };

/**
 * Compatibilidade (0101), visão da agência e do admin: heróis × marcas interessados, lado a lado. A agência recebe da RLS
 * só os heróis do PRÓPRIO casting e as marcas que atende; o admin, todos. Atalhos (agência gestor+): abrir oportunidade
 * com o herói (ficha do casting) ou para a marca (público escolhido). A marca nunca chega aqui.
 */
export async function CompatibilityPanel({ eventId, heroes, brands, mode, canCreate }: { eventId: string; heroes: CompatHero[]; brands: CompatBrand[]; mode: "agency" | "admin"; canCreate: boolean }) {
  const t = await getTranslations("culture.compat");
  const pairs = heroes.length * brands.length;
  const col = "flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-bg p-2";
  return (
    <section className={box} aria-labelledby="compat-title" data-testid="compat-panel">
      <div className="flex flex-col gap-1">
        <h2 id="compat-title" className="text-sm font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{mode === "admin" ? t("hintAdmin") : t("hint")}</p>
        <Badge size="sm" variant={pairs > 0 ? "accent" : "neutral"} className="w-fit">
          {t("pairs", { count: pairs })}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={col} data-testid="compat-heroes">
          <h3 className="type-caption font-semibold uppercase tracking-wide text-fg-muted">
            {t("heroes")} · {heroes.length}
          </h3>
          {heroes.length === 0 ? <p className="type-caption text-fg-muted">{t("noHeroes")}</p> : null}
          <ul className="flex flex-col gap-1">
            {heroes.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-medium text-fg">{h.name}</span>
                {canCreate && h.talentId ? (
                  <Link
                    href={newSponsorshipHref(eventId, { talentId: h.talentId })}
                    aria-label={t("withHero", { name: h.name })}
                    title={t("withHero", { name: h.name })}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-text hover:bg-surface-hover"
                    data-testid="compat-hero-link"
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className={col} data-testid="compat-brands">
          <h3 className="type-caption font-semibold uppercase tracking-wide text-fg-muted">
            {t("brands")} · {brands.length}
          </h3>
          {brands.length === 0 ? <p className="type-caption text-fg-muted">{t("noBrands")}</p> : null}
          <ul className="flex flex-col gap-1">
            {brands.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-medium text-fg">{b.name}</span>
                {canCreate ? (
                  <Link
                    href={newSponsorshipHref(eventId, { brandId: b.id })}
                    aria-label={t("forBrand", { name: b.name })}
                    title={t("forBrand", { name: b.name })}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-text hover:bg-surface-hover"
                    data-testid="compat-brand-link"
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Histórico comercial do evento (0101): o que a pessoa pode ver, sem valores. */
export async function EventCommercialPanel({ items }: { items: CommercialItem[] }) {
  const [t, tc, locale] = await Promise.all([getTranslations("culture.history"), getTranslations("commercial.stages"), getLocale() as Promise<Locale>]);
  return (
    <section className={box} aria-labelledby="event-history-title" data-testid="event-history">
      <h2 id="event-history-title" className="text-sm font-semibold text-fg">
        {t("title")}
      </h2>
      {items.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((i) => {
            const href = commercialHref(i);
            const statusKey = `status.${i.kind}.${i.status}`;
            const content = (
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge size="sm" variant="neutral">
                    {t(`kinds.${i.kind}`)}
                  </Badge>
                  <Badge size="sm" variant={i.status === "open" || i.status === "submitted" ? "info" : i.status === "cancelled" || i.status === "declined" ? "danger" : "neutral"}>
                    {t.has(statusKey) ? t(statusKey) : i.status}
                  </Badge>
                </span>
                <span className="text-sm font-medium text-fg">{i.title}</span>
                <span className="type-caption text-fg-muted">
                  {i.startsOn ? formatPlainDate(i.startsOn, locale) : ""}
                  {i.dealStage ? `${i.startsOn ? " · " : ""}${t("deal", { stage: tc.has(i.dealStage) ? tc(i.dealStage) : i.dealStage })}` : ""}
                </span>
              </span>
            );
            return (
              <li key={`${i.kind}-${i.id}`} className="py-2" data-testid="event-history-item" data-kind={i.kind}>
                {href ? (
                  <Link href={href} className="flex items-center justify-between gap-2">
                    {content}
                    <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
