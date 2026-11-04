import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EventEditorProvider, EventNewButton } from "@/components/calendar/EventEditor";
import { EventList } from "@/components/calendar/EventList";
import { ActivityForm, ConfirmCard, DealForm, MoveForm, TeamPicker } from "@/components/deals/DealForms";
import { BriefView } from "@/components/brief/BriefView";
import { DealBriefCard } from "@/components/brief/DealBriefCard";
import { DealOffer } from "@/components/deals/DealOffer";
import { RequestSummary } from "@/components/deals/RequestSummary";
import { AgencyBudgetChange } from "@/components/finance/AgencyBudgetChange";
import { DealFinanceCard } from "@/components/finance/DealFinanceCard";
import { DealPaymentPlanCard } from "@/components/finance/PaymentPlan";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { listTeam } from "@/lib/agency/queries";
import { zonedDayKey } from "@/lib/calendar/grid";
import { listDealEvents } from "@/lib/calendar/queries";
import { getDealOffer, getRequest, getRequestBudget, listActivities, listDealFees, listDealTalents } from "@/lib/deals/queries";
import { splitSystemBody } from "@/lib/deals/vocab";
import { agencyBudgetChanges, agencyRates, dealEntries, dealPaymentPlan } from "@/lib/finance/queries";
import { requestDeliverablesSchema } from "@/lib/deals/schemas";
import { loadDeal } from "./_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("deal") };
}

type Props = { params: Promise<{ id: string }> };

// Visão geral: proposta da marca (aceitar/contrapropor, 0106), briefing da marca (com o valor oferecido só para o Adm), briefing estruturado (0080; editável por
// quem mexe no negócio), dados do negócio, etapa,
// confirmação (Adm), equipe e linha do tempo de contatos.
export default async function DealOverviewPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, isOwner, canEdit, isManager, isAdmin } = await loadDeal(id);
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const [t, tc, tb, locale, team, request, budget, activities, talents, events, changes, tpay, offer] = await Promise.all([
    getTranslations("agency.deal"),
    getTranslations("brief"),
    getTranslations("commercial"),
    getLocale() as Promise<Locale>,
    listTeam(ctx.agency.id),
    deal.requestId ? getRequest(deal.requestId) : Promise.resolve(null),
    deal.requestId && isAdmin ? getRequestBudget(deal.requestId) : Promise.resolve(null),
    listActivities(deal.id),
    listDealTalents(deal.id),
    listDealEvents(deal.id),
    // 0090: pedido de alteração de verba (Adm com valores; gestor e equipe do negócio só a situação)
    agencyBudgetChanges(deal.id),
    getTranslations("payments.change"),
    // 0106: proposta da marca (Adm aceita/contrapropõe; gestor e equipe só a situação)
    getDealOffer(deal.id),
  ]);
  // 0108: condições de pagamento (Adm edita antes da contratação; os demais veem o resumo sem valores)
  const plan = deal.brand ? await dealPaymentPlan(deal.id) : null;
  // financeiro simulado (0069), só para o Adm: taxa, prévia e lançamentos; sem a migração, a seção some
  const [fees, rates, entries] = isAdmin
    ? await Promise.all([listDealFees(deal.id), agencyRates(ctx.agency.id, deal.id), dealEntries(deal.id)])
    : [{} as Record<string, number>, null, { available: false, items: [] }];
  const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const ready = talents.filter((x) => ["interested", "proposed"].includes(x.status));
  const financeTalents = talents.filter((x) => ["interested", "proposed", "contracted"].includes(x.status));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      {offer && offer.enabled && (offer.open || offer.rounds.length > 0) ? (
        <div className="lg:col-span-2">
          <DealOffer portal="agency" dealId={deal.id} requestId={deal.requestId} view={offer} />
        </div>
      ) : null}
      <div className="flex flex-col gap-5">
        {request && request.origin === "brand" ? (
          <section className={card} aria-labelledby="deal-request">
            <h2 id="deal-request" className="text-base font-semibold text-fg">
              {t("sections.request")}
            </h2>
            <RequestSummary request={request} budget={budget} />
          </section>
        ) : null}
        {changes && changes.items.length > 0 ? (
          <section id="budget-change" className={`${card} scroll-mt-20`} aria-labelledby="deal-budget-change">
            <h2 id="deal-budget-change" className="text-base font-semibold text-fg">
              {tpay("title")}
            </h2>
            <AgencyBudgetChange
              dealId={deal.id}
              canDecide={changes.canDecide}
              items={changes.items}
              talents={talents.filter((x) => ["proposed", "contracted"].includes(x.status)).map((x) => ({ dealTalentId: x.id, name: x.talent.name }))}
              deliverables={requestDeliverablesSchema.safeParse(request?.deliverables ?? []).data ?? []}
              periodStart={request?.periodStart ?? deal.expectedStart ?? null}
              periodEnd={request?.periodEnd ?? deal.expectedEnd ?? null}
            />
          </section>
        ) : null}
        {request ? (
          <section className={card} aria-labelledby="deal-brief" data-testid="deal-brief">
            <h2 id="deal-brief" className="text-base font-semibold text-fg">
              {tb("title")}
            </h2>
            {canEdit ? <DealBriefCard dealId={deal.id} brief={request.brief} /> : <BriefView brief={request.brief} showEmpty />}
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
            members={team.map((m) => ({ userId: m.userId, name: m.name, role: m.role, jobTitle: m.jobTitle }))}
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
                  <span className="text-sm text-fg">{a.kind === "system" ? t(`system.${splitSystemBody(a.body).code}`, { param: splitSystemBody(a.body).param }) : a.body || t("noNote")}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <div className="flex flex-col gap-5">
        {plan && plan.enabled && (plan.hasPlan || plan.agreed || plan.canEdit) ? <DealPaymentPlanCard dealId={deal.id} view={plan} today={zonedDayKey(new Date(), tz)} /> : null}
        {isAdmin && canEdit ? <ConfirmCard dealId={deal.id} stage={deal.stage} readyCount={ready.length} missingFee={ready.filter((x) => !x.termsReady).length} /> : null}
        {isAdmin && rates && entries.available ? (
          <DealFinanceCard
            dealId={deal.id}
            agencyRateBp={rates.agencyRateBp}
            dealRateBp={rates.dealRateBp}
            contracted={rates.contracted}
            fees={financeTalents.map((x) => ({ name: x.talent.name, feeCents: Object.hasOwn(fees, x.id) ? fees[x.id] : null }))}
            entries={entries.items}
            hasPlan={plan?.hasPlan ?? false}
          />
        ) : null}
        {canEdit || (deal.stage === "closed" && isAdmin) ? (
          <section className={card} aria-labelledby="deal-stage">
            <h2 id="deal-stage" className="text-base font-semibold text-fg">
              {t("sections.stage")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("stageHint")}</p>
            <MoveForm dealId={deal.id} stage={deal.stage} role={ctx.platformAdmin ? "admin" : ctx.role} isOwner={isOwner} canClose={isManager} />
          </section>
        ) : null}
        {/* 0086: criar (hoje, 09:00–10:00) e editar/remover os compromissos manuais deste negócio, para quem pode mexer nele */}
        <EventEditorProvider
          options={{ fixedDealId: deal.id, talents: talents.filter((x) => !["declined", "removed"].includes(x.status)).map((x) => ({ id: x.talentId, name: x.talent.name, city: x.talent.city, state: x.talent.state, hasLogin: x.talent.hasLogin, avatarUrl: x.talent.avatarUrl })), canPublishCommercialDate: false }}
          timeZone={tz}
          today={zonedDayKey(new Date(), tz)}
          permissions={{ isManager, dealIds: canEdit ? [deal.id] : [] }}
          canCreate={canEdit}
        >
          <section className={card} aria-labelledby="deal-events">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="deal-events" className="text-base font-semibold text-fg">
                {t("sections.events")}
              </h2>
              <EventNewButton />
            </div>
            <EventList events={events} timeZone={tz} portal="agency" emptyTitle={t("noEvents")} />
          </section>
        </EventEditorProvider>
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
