import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InterestButton } from "@/components/platform-calendar/InterestButton";
import { InterestCounts, PlatformEventView } from "@/components/platform-calendar/PlatformEventView";
import { BackLink } from "@/components/ui/back-link";
import { getBrandContext } from "@/lib/brand-portal/server";
import { agendaBackHref } from "@/lib/platform-calendar/links";
import { getPlatformEvent, interestSummary, listEventInterests } from "@/lib/platform-calendar/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groscoveCalendar");
  return { title: t("badge") };
}

// Evento do Calendário Groscove na marca (0098): detalhe e "Tenho interesse" (dono ou equipe). A marca vê só o
// próprio interesse e as contagens totais — nunca a lista de heróis interessados (regra M4).
export default async function BrandGroscoveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const event = await getPlatformEvent(id);
  if (!event || event.effective === "draft" || event.effective === "scheduled") notFound();
  const [t, counts, interests] = await Promise.all([getTranslations("groscoveCalendar"), interestSummary(id), listEventInterests(id)]);
  const mine = interests.find((i) => i.party === "brand" && i.ownerId === ctx.brand.id);
  const closed = event.status === "cancelled" || new Date(event.endsAt).getTime() < Date.now();
  return (
    <div className="flex flex-col gap-4" data-testid="brand-groscove-event">
      <BackLink href={agendaBackHref("/marca/agenda", event.startsAt, event.timezone)}>{t("detail.back")}</BackLink>
      <PlatformEventView event={event}>
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="interest-title">
          <h2 id="interest-title" className="text-sm font-semibold text-fg">
            {t("interest.titleBrand", { name: ctx.brand.name })}
          </h2>
          {ctx.role ? (
            <InterestButton eventId={event.id} party="brand" ownerId={ctx.brand.id} state={mine?.state ?? "none"} closed={closed} />
          ) : (
            <p className="type-body-sm text-fg-muted">{t("interest.brandMembersOnly")}</p>
          )}
          <InterestCounts counts={counts} />
          <p className="type-caption text-fg-subtle">{t("interest.notContractBrand")}</p>
        </section>
      </PlatformEventView>
    </div>
  );
}
