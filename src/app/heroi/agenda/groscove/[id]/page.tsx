import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InterestButton } from "@/components/platform-calendar/InterestButton";
import { InterestCounts, PlatformEventView } from "@/components/platform-calendar/PlatformEventView";
import { BackLink } from "@/components/ui/back-link";
import { EventCommercialPanel } from "@/components/culture/EventCommerce";
import { EventPosts } from "@/components/culture/EventPosts";
import { eventCommercial, listVisiblePosts } from "@/lib/culture/queries";
import { agendaBackHref } from "@/lib/platform-calendar/links";
import { getPlatformEvent, interestSummary, listEventInterests } from "@/lib/platform-calendar/queries";
import { findHeroWorkspace } from "@/lib/hero-work/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar");
  return { title: t("badge") };
}

// Evento do Calendário Groscove no Portal do Herói (0098): detalhe e "Tenho interesse". Só o TITULAR de herói ativo
// manifesta; a equipe vê o estado. Interesse é um sinal para a agência/Groscove, não um contrato.
export default async function HeroGroscoveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getPlatformEvent(id);
  if (!event || event.effective === "draft" || event.effective === "scheduled") notFound();
  const [t, ws, counts, history, posts] = await Promise.all([
    getTranslations("groscoveCalendar"),
    findHeroWorkspace(),
    interestSummary(id),
    eventCommercial(id),
    listVisiblePosts({ eventId: id, limit: 10 }),
  ]);
  const mine = ws ? (await listEventInterests(id)).find((i) => i.party === "hero" && i.ownerId === ws.hero.id) : undefined;
  const canAct = ws !== null && ws.hero.role === "owner" && ws.hero.status === "active";
  const closed = event.status === "cancelled" || new Date(event.endsAt).getTime() < Date.now();
  return (
    <div className="flex flex-col gap-4" data-testid="hero-groscove-event">
      <BackLink href={agendaBackHref("/heroi/agenda", event.startsAt, event.timezone)}>{t("detail.back")}</BackLink>
      <PlatformEventView event={event}>
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="interest-title">
          <h2 id="interest-title" className="text-sm font-semibold text-fg">
            {ws ? t("interest.titleHero", { name: ws.hero.name }) : t("interest.title")}
          </h2>
          {canAct && ws ? (
            <InterestButton eventId={event.id} party="hero" ownerId={ws.hero.id} state={mine?.state ?? "none"} closed={closed} />
          ) : (
            <p className="type-body-sm text-fg-muted" data-testid="interest-readonly">
              {mine?.state === "interested" ? t("interest.stateInterestedHero") : ws ? t("interest.ownerOnly") : t("interest.noHero")}
            </p>
          )}
          <InterestCounts counts={counts} />
          <p className="type-caption text-fg-subtle">{t("interest.notContract")}</p>
        </section>
        {/* 0101: notícias/dicas do evento e o que envolve o herói (negócio em que foi consultado, patrocínio dele) */}
        <EventPosts posts={posts.items} portal="hero" />
        {history.length > 0 ? <EventCommercialPanel items={history} /> : null}
      </PlatformEventView>
    </div>
  );
}
