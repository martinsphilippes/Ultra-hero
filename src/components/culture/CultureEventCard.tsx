import { ChevronRight, Handshake, Megaphone, Pencil } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { InterestButton } from "@/components/platform-calendar/InterestButton";
import { PlatformBadges } from "@/components/platform-calendar/PlatformBadges";
import { eventWhen } from "@/components/platform-calendar/PlatformEventView";
import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { eventHref, newCampaignHref, newSponsorshipHref, type CulturePortal } from "@/lib/culture/links";
import type { EventOpportunities } from "@/lib/culture/select";
import { platformToCalendar, type PlatformEvent } from "@/lib/platform-calendar/queries";
import type { InterestState } from "@/lib/platform-calendar/vocab";

/** O que cada perfil pode fazer direto do cartão (o banco confere de novo em cada ação). */
export type CultureActions =
  | { portal: "hero"; ownerId: string | null; canAct: boolean }
  | { portal: "brand"; ownerId: string; canAct: boolean; canCampaign: boolean }
  | { portal: "agency"; canCreate: boolean }
  | { portal: "admin" };

type Props = {
  event: PlatformEvent;
  actions: CultureActions;
  interest?: InterestState | null;
  opportunities?: EventOpportunities | null;
  /** Temporada: mostra "até <data>" em vez do período inteiro. */
  season?: boolean;
};

// Cartão de evento da Real-Time Culture (0101): selos, título (abre o detalhe do evento na agenda), quando, oportunidades
// abertas (só números) e as ações do perfil: Hero/marca "Tenho interesse", marca "Criar campanha", agência "Criar
// oportunidade", admin "Editar".
export async function CultureEventCard({ event: e, actions, interest = null, opportunities = null, season = false }: Props) {
  const [t, locale] = await Promise.all([getTranslations("culture"), getLocale() as Promise<Locale>]);
  const portal: CulturePortal = actions.portal;
  const href = eventHref(portal, e.id);
  const info = platformToCalendar(e).platform!;
  const closed = new Date(e.endsAt).getTime() < Date.now();
  const when = season ? t("card.until", { date: formatDate(new Date(new Date(e.endsAt).getTime() - 60_000), locale, { day: "numeric", month: "short" }, e.timezone) }) : eventWhen(e, locale);
  return (
    <li className="relative flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-focus" data-testid="culture-card" data-event={e.id}>
      <PlatformBadges info={info} />
      {/* o cartão inteiro abre o evento (link estendido); os botões de ação ficam por cima (relative z-10) */}
      <Link href={href} data-card-link className="group flex items-start justify-between gap-2 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']" aria-label={t("card.open", { title: e.title })}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg group-hover:underline">{e.title}</span>
          <span className="type-caption text-fg-muted">{when}</span>
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      </Link>
      {opportunities ? (
        <p className="relative z-10 flex flex-wrap gap-x-3 type-caption font-medium text-accent-text" data-testid="culture-opportunities">
          {opportunities.sponsorships > 0 ? <span>{t("card.sponsorships", { count: opportunities.sponsorships })}</span> : null}
          {opportunities.calls > 0 ? <span>{t("card.calls", { count: opportunities.calls })}</span> : null}
        </p>
      ) : null}
      <CardActions eventId={e.id} actions={actions} interest={interest} closed={closed} />
    </li>
  );
}

async function CardActions({ eventId, actions, interest, closed }: { eventId: string; actions: CultureActions; interest: InterestState | null; closed: boolean }) {
  const t = await getTranslations("culture.actions");
  if (actions.portal === "hero") {
    if (!actions.canAct || !actions.ownerId) return null;
    return (
      <div className="relative z-10 flex flex-wrap gap-2">
        <InterestButton compact eventId={eventId} party="hero" ownerId={actions.ownerId} state={interest ?? "none"} closed={closed} />
      </div>
    );
  }
  if (actions.portal === "brand") {
    if (!actions.canAct) return null;
    return (
      <div className="relative z-10 flex flex-wrap gap-2">
        <InterestButton compact eventId={eventId} party="brand" ownerId={actions.ownerId} state={interest ?? "none"} closed={closed} />
        {actions.canCampaign && !closed ? (
          <Button asChild size="sm" variant="secondary" leadingIcon={<Megaphone />}>
            <Link href={newCampaignHref(eventId)} data-testid="culture-create-campaign">
              {t("createCampaign")}
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }
  if (actions.portal === "agency") {
    if (!actions.canCreate || closed) return null;
    return (
      <div className="relative z-10 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary" leadingIcon={<Handshake />}>
          <Link href={newSponsorshipHref(eventId)} data-testid="culture-create-opportunity">
            {t("createOpportunity")}
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="relative z-10 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="ghost" leadingIcon={<Pencil />}>
        <Link href={`/admin/agenda/${eventId}`}>{t("edit")}</Link>
      </Button>
    </div>
  );
}
