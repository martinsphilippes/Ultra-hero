import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EventForm } from "@/components/calendar/EventForm";
import { EventList } from "@/components/calendar/EventList";
import { ActivityForm, ConfirmCard, DealForm, MoveForm, TeamPicker } from "@/components/deals/DealForms";
import { RequestSummary } from "@/components/deals/RequestSummary";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { listTeam } from "@/lib/agency/queries";
import { listDealEvents } from "@/lib/calendar/queries";
import { getRequest, getRequestBudget, listActivities, listDealTalents } from "@/lib/deals/queries";
import { loadDeal } from "./_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("deal") };
}

type Props = { params: Promise<{ id: string }> };

// Visão geral: briefing da marca (com o valor oferecido só para o Adm), dados do negócio, etapa,
// confirmação (Adm), equipe e linha do tempo de contatos.
export default async function DealOverviewPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, isOwner, canEdit, isManager, isAdmin } = await loadDeal(id);
  const [t, tc, locale, team, request, budget, activities, talents, events] = await Promise.all([
    getTranslations("agency.deal"),
    getTranslations("commercial"),
    getLocale() as Promise<Locale>,
    listTeam(ctx.agency.id),
    deal.requestId ? getRequest(deal.requestId) : Promise.resolve(null),
    deal.requestId && isAdmin ? getRequestBudget(deal.requestId) : Promise.resolve(null),
    listActivities(deal.id),
    listDealTalents(deal.id),
    listDealEvents(deal.id),
  ]);
  const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const ready = talents.filter((x) => ["interested", "proposed"].includes(x.status));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-5">
        {request && request.origin === "brand" ? (
          <section className={card} aria-labelledby="deal-request">
            <h2 id="deal-request" className="text-base font-semibold text-fg">
              {t("sections.request")}
            </h2>
            <RequestSummary request={request} budget={budget} />
          </section>
        ) : null}
        <section className={card} aria-labelledby="deal-data">
          <h2 id="deal-data" className="text-base font-semibold text-fg">
            {t("sections.data")}
          </h2>
          <DealForm
            initial={{ brandId: deal.brand.id, title: deal.title, talentBrief: deal.talentBrief, expectedStart: deal.expectedStart ?? "", expectedEnd: deal.expectedEnd ?? "", ownerId: deal.ownerId ?? "", notes: "" }}
            dealId={deal.id}
            brands={[]}
            members={team.map((m) => ({ userId: m.userId, name: m.name }))}
            canEdit={canEdit}
            canSetOwner={isManager}
          />
        </section>
        <section className={card} aria-labelledby="deal-activities">
          <h2 id="deal-activities" className="text-base font-semibold text-fg">
            {t("sections.activities")}
          </h2>
          {canEdit ? <ActivityForm dealId={deal.id} /> : null}
          {activities.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("noActivities")}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border" data-testid="deal-activities">
              {activities.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-2">
                  <span className="type-caption text-fg-muted">
                    {formatDateTime(a.occurredAt, locale)} · {tc(`activityKinds.${a.kind}`)} · {a.authorLabel}
                  </span>
                  <span className="text-sm text-fg">{a.kind === "system" ? t(`system.${a.body}`) : a.body || t("noNote")}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <div className="flex flex-col gap-5">
        {isAdmin && canEdit ? <ConfirmCard dealId={deal.id} stage={deal.stage} readyCount={ready.length} missingFee={ready.filter((x) => !x.termsReady).length} /> : null}
        {canEdit || (deal.stage === "closed" && isAdmin) ? (
          <section className={card} aria-labelledby="deal-stage">
            <h2 id="deal-stage" className="text-base font-semibold text-fg">
              {t("sections.stage")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("stageHint")}</p>
            <MoveForm dealId={deal.id} stage={deal.stage} role={ctx.platformAdmin ? "admin" : ctx.role} isOwner={isOwner} canClose={isManager} />
          </section>
        ) : null}
        <section className={card} aria-labelledby="deal-events">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="deal-events" className="text-base font-semibold text-fg">
              {t("sections.events")}
            </h2>
            {canEdit ? <EventForm fixedDealId={deal.id} talents={talents.filter((x) => !["declined", "removed"].includes(x.status)).map((x) => ({ id: x.talentId, name: x.talent.name }))} canPublishCommercialDate={false} /> : null}
          </div>
          <EventList events={events} timeZone={ctx.agency.timezone || "America/Sao_Paulo"} portal="agency" canDelete={canEdit} emptyTitle={t("noEvents")} />
        </section>
        {isManager ? (
          <section className={card} aria-labelledby="deal-team">
            <h2 id="deal-team" className="text-base font-semibold text-fg">
              {t("sections.team")}
            </h2>
            <TeamPicker dealId={deal.id} members={team.map((m) => ({ userId: m.userId, name: m.name }))} selected={deal.team} ownerId={deal.ownerId} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
