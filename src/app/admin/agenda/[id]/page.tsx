import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlatformEventAdminActions } from "@/components/platform-calendar/PlatformEventAdminActions";
import { PlatformEventForm } from "@/components/platform-calendar/PlatformEventForm";
import { InterestCounts, InterestList, PlatformEventView } from "@/components/platform-calendar/PlatformEventView";
import { Button, PageHeader } from "@/components/ui";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { CompatibilityPanel, EventCommercialPanel } from "@/components/culture/EventCommerce";
import { PostCard } from "@/components/culture/PostCard";
import { compatFromInterests } from "@/lib/culture/compat";
import { eventCommercial, listVisiblePosts } from "@/lib/culture/queries";
import { platformEventToForm } from "@/lib/platform-calendar/form";
import { getPlatformEvent, interestSummary, listEventInterests } from "@/lib/platform-calendar/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar.admin");
  return { title: t("edit") };
}

// Evento do Calendário Groscove no admin (0098): como os portais veem, interessados (todos), editar, cancelar/excluir.
export default async function AdminAgendaEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getPlatformEvent(id);
  if (!event) notFound();
  const [t, tc, interests, counts, history, posts] = await Promise.all([
    getTranslations("groscoveCalendar"),
    getTranslations("culture"),
    listEventInterests(id),
    interestSummary(id),
    eventCommercial(id),
    listVisiblePosts({ eventId: id, limit: 10 }),
  ]);
  // 0101: compatibilidade (todos os heróis × todas as marcas com interesse), histórico comercial e notícias do evento
  const compat = compatFromInterests(interests);
  const live = event.status !== "draft" && event.publishedAt !== null && new Date(event.publishedAt).getTime() <= Date.now();
  return (
    <div className="flex flex-col gap-5" data-testid="admin-agenda-event">
      <PageHeader title={t("admin.edit")} backHref="/admin/agenda" backLabel={t("admin.back")} actions={<PlatformEventAdminActions id={event.id} title={event.title} canCancel={live && event.status !== "cancelled"} canDelete={!live} />} />
      <PlatformEventView event={event} showStatus showSourceNotes>
        <InterestCounts counts={counts} />
        <CompatibilityPanel eventId={event.id} heroes={compat.heroes.map((h) => ({ ...h, talentId: null }))} brands={compat.brands} mode="admin" canCreate={false} />
        <InterestList items={interests} title={t("interest.adminTitle")} empty={t("interest.adminEmpty")} />
        <EventCommercialPanel items={history} />
        <section className="flex flex-col gap-2" aria-labelledby="event-posts-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="event-posts-title" className="text-sm font-semibold text-fg">
              {tc("posts.eventTitle")}
            </h2>
            <Button asChild size="sm" variant="secondary" leadingIcon={<PenLine />}>
              <Link href={`/admin/agenda/conteudos/novo?evento=${event.id}`} data-testid="event-write-post">
                {tc("editorial.write")}
              </Link>
            </Button>
          </div>
          {posts.items.length > 0 ? (
            <ul className="grid gap-2">
              {posts.items.map((p) => (
                <PostCard key={p.id} post={p} portal="admin" />
              ))}
            </ul>
          ) : null}
        </section>
      </PlatformEventView>
      <h2 className="text-base font-semibold text-fg">{t("admin.editTitle")}</h2>
      <PlatformEventForm initial={platformEventToForm(event)} />
    </div>
  );
}
