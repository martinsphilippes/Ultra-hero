import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/deals/MessageThread";
import { DeliverableStatusBadge, TalentStatusBadge } from "@/components/deals/StatusBadges";
import { DeliverablesBoard } from "@/components/execution/DeliverablesBoard";
import { TaskList } from "@/components/execution/TaskList";
import { TermsPanel } from "@/components/execution/TermsPanel";
import { ConflictAlert } from "@/components/offer/ConflictAlert";
import { CounterofferPanel } from "@/components/offer/CounterofferPanel";
import { RightsView } from "@/components/offer/RightsView";
import { OpportunityRespond } from "@/components/talent/OpportunityRespond";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatDuration, formatPlainDate } from "@/i18n/format";
import { listMessages, listOpportunities, myFee } from "@/lib/deals/queries";
import { formatCents } from "@/lib/deals/schemas";
import type { DeliverableStatus } from "@/lib/deals/vocab";
import { getDealExecution } from "@/lib/execution/queries";
import { proposedDateRange } from "@/lib/offer/counteroffer";
import { getTalentOfferState } from "@/lib/offer/queries";
import { localDay } from "@/lib/today/logic";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("opportunity") };
}

type Props = { params: Promise<{ id: string }> };

// Detalhe da oportunidade: a oferta numa tela só (o quê, quando, quanto — só na web —, direitos e prazo de
// resposta), alerta de exclusividade, resposta (aceitar, recusar, conversar), contraproposta de data ou valor,
// briefing, termos, execução e conversa com a agência.
export default async function OpportunityPage({ params }: Props) {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t, tc, tn, locale, list] = await Promise.all([getTranslations("talent.opportunities"), getTranslations("commercial"), getTranslations("mediaKit.networks"), getLocale() as Promise<Locale>, listOpportunities(id)]);
  const o = list.items[0];
  if (!o) notFound();
  const contracted = ["proposed", "contracted"].includes(o.status);
  const [fee, messages, exec, tx, to, offerRes] = await Promise.all([
    myFee(o.id),
    listMessages(o.deal.id, "talent_agency", ctx.talent.id),
    contracted ? getDealExecution(o.deal.id) : Promise.resolve({ available: true, data: null }),
    getTranslations("talent.execution"),
    getTranslations("offer"),
    getTalentOfferState(o.id),
  ]);
  const offer = offerRes.data;
  const execution = exec.available ? exec.data : null;
  const myTasks = (execution?.tasks ?? []).filter((x) => x.side === "talent" && x.talentId === ctx.talent.id);
  const myDeliverables = (execution?.deliverables ?? []).filter((d) => d.dealTalentId === o.id);
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex flex-col">
        <dt className="type-caption text-fg-muted">{label}</dt>
        <dd className="text-sm text-fg">{value}</dd>
      </div>
    ) : null;
  const r = o.request;
  const closed = ["won", "lost", "cancelled"].includes(o.deal.status) || o.status === "removed";
  const liveTerms = execution?.terms.find((x) => x.status === "sent" || x.status === "accepted") ?? null;
  const tz = offer?.timezone ?? "America/Sao_Paulo";
  const now = new Date();
  const range = proposedDateRange(now, tz);
  const plannedDeliverables = o.deliverables.filter((d) => ["planned", "in_production"].includes(d.status));
  const deliverableLabel = (d: (typeof o.deliverables)[number]) => [tc(`deliverableKinds.${d.kind}`), d.network ? tn(d.network) : null, d.title || null].filter(Boolean).join(" · ");
  const refDate = (d: (typeof o.deliverables)[number]) => {
    const at = d.publishAt ?? d.dueAt;
    return at ? localDay(new Date(at), tz) : null;
  };
  const dates = o.deliverables.map((d) => d.publishAt ?? d.dueAt).filter((x): x is string => Boolean(x)).sort();
  const period = o.deal.expectedStart ? `${formatPlainDate(o.deal.expectedStart, locale)}${o.deal.expectedEnd && o.deal.expectedEnd !== o.deal.expectedStart ? ` – ${formatPlainDate(o.deal.expectedEnd, locale)}` : ""}` : null;

  return (
    <div className="flex flex-col gap-5" data-testid="opportunity-detail">
      <PageHeader
        as="h2"
        title={o.deal.title}
        backHref="/creator/escritorio/oportunidades"
        backLabel={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Avatar src={o.brand.logoUrl} name={o.brand.name} size="sm" alt="" />
            <span className="text-fg">{o.brand.name}</span>
            <TalentStatusBadge status={o.status} size="md" />
            {o.deal.status !== "open" ? <Badge size="md">{t(`dealStatus.${o.deal.status}`)}</Badge> : null}
          </span>
        }
      />
      {offer && offer.conflicts.length > 0 && !closed ? <ConflictAlert conflicts={offer.conflicts} side="talent" /> : null}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="opp-offer" data-testid="offer-card">
        <h2 id="opp-offer" className="text-base font-semibold text-fg">
          {to("card.title")}
        </h2>
        {o.respondBy && !o.respondedAt && !closed ? (
          <p className="w-fit rounded-full bg-warning-soft/50 px-3 py-1 text-sm font-medium text-fg">{to("card.respondBy", { date: formatDateTime(o.respondBy, locale) })}</p>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="type-caption text-fg-muted">{to("card.what")}</dt>
            <dd className="text-sm text-fg">
              {o.deliverables.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {o.deliverables.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>
                        {deliverableLabel(d)}
                        {d.publishAt ?? d.dueAt ? <span className="text-fg-muted"> · {formatPlainDate(localDay(new Date((d.publishAt ?? d.dueAt) as string), tz), locale)}</span> : null}
                      </span>
                      {d.status !== "planned" ? <DeliverableStatusBadge status={d.status as DeliverableStatus} /> : null}
                    </li>
                  ))}
                </ul>
              ) : r && r.deliverables.length > 0 ? (
                r.deliverables.map((d) => `${d.quantity}× ${tc(`deliverableKinds.${d.kind}`)}${d.network ? ` (${tn(d.network)})` : ""}`).join(", ")
              ) : (
                <span className="text-fg-muted">{to("card.noDeliverables")}</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="type-caption text-fg-muted">{to("card.when")}</dt>
            <dd className="text-sm text-fg">
              {period ?? (dates.length > 0 ? `${formatPlainDate(localDay(new Date(dates[0] as string), tz), locale)}${dates.length > 1 ? ` – ${formatPlainDate(localDay(new Date(dates[dates.length - 1] as string), tz), locale)}` : ""}` : <span className="text-fg-muted">{to("card.noDates")}</span>)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="type-caption text-fg-muted">{to("card.howMuch")}</dt>
            <dd className="text-sm text-fg" data-testid="opportunity-fee">
              <span className="font-mono text-lg font-semibold native:hidden">{fee !== null ? formatCents(fee, locale) : <span className="font-sans text-sm font-normal text-fg-muted">{to("card.noFee")}</span>}</span>
              <span className="hidden type-caption text-fg-muted native:inline">{to("card.feeOnWeb")}</span>
              {fee !== null ? <span className="block type-caption text-fg-muted native:hidden">{t("feeHint")}</span> : null}
            </dd>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <dt className="type-caption text-fg-muted">{to("card.rights")}</dt>
            <dd>{liveTerms ? <RightsView rights={liveTerms.rights} /> : <span className="type-caption text-fg-muted">{to("card.rightsPending")}</span>}</dd>
          </div>
        </dl>
      </section>
      {!closed ? <OpportunityRespond dealTalentId={o.id} status={o.status} /> : null}
      {offer && !closed ? (
        <CounterofferPanel
          dealTalentId={o.id}
          counteroffers={offer.counteroffers}
          canFee={offer.canFee}
          canDate={offer.canDate}
          currentFeeCents={fee}
          deliverables={plannedDeliverables.map((d) => ({ id: d.id, label: deliverableLabel(d), refDate: refDate(d) }))}
          expectedStart={o.deal.expectedStart}
          dateMin={range.min}
          dateMax={range.max}
        />
      ) : null}
      {execution && execution.terms.length > 0 ? (
        <section className={card} aria-labelledby="opp-terms" data-testid="opportunity-terms">
          <h3 id="opp-terms" className="text-base font-semibold text-fg">
            {tx("termsTitle")}
          </h3>
          <TermsPanel portal="office" dealId={o.deal.id} dealTalentId={o.id} stage={execution.stage} terms={execution.terms} />
        </section>
      ) : null}
      {o.respondedAt ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 type-body-sm text-fg" data-testid="opportunity-answer">
          {t("youAnswered", { date: formatDateTime(o.respondedAt, locale), answer: tc(`responses.${o.status === "interested" || o.status === "declined" || o.status === "talk_requested" ? o.status : "interested"}`) })}
          {o.responseNote ? <span className="text-fg-muted"> — “{o.responseNote}”</span> : null}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className={card} aria-labelledby="opp-brief">
            <h3 id="opp-brief" className="text-base font-semibold text-fg">
              {t("briefTitle")}
            </h3>
            {o.deal.talentBrief ? <p className="whitespace-pre-wrap text-sm text-fg">{o.deal.talentBrief}</p> : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              {r ? (
                <>
                  {row(t("fields.objective"), r.objective ? tc(`objectives.${r.objective}`) : null)}
                  {row(t("fields.product"), r.product)}
                  {row(t("fields.desiredAt"), r.desiredAt ? formatDateTime(r.desiredAt, locale) : null)}
                  {row(t("fields.duration"), r.durationMinutes ? formatDuration(r.durationMinutes) : null)}
                  {row(t("fields.format"), r.format ? tc(`formats.${r.format}`) : null)}
                  {row(t("fields.location"), r.location)}
                  {row(t("fields.networks"), r.networks.length > 0 ? r.networks.map((n) => tn(n)).join(", ") : null)}
                  {row(t("fields.deliverables"), r.deliverables.length > 0 ? r.deliverables.map((d) => `${d.quantity}× ${tc(`deliverableKinds.${d.kind}`)}${d.network ? ` (${tn(d.network)})` : ""}`).join(", ") : null)}
                </>
              ) : null}
            </dl>
            {r?.notes ? <p className="whitespace-pre-wrap type-body-sm text-fg-muted">{r.notes}</p> : null}
          </section>
          {execution && (execution.stage === "production" || execution.stage === "closed") ? (
            <>
              <section className={card} aria-labelledby="opp-tasks" data-testid="opportunity-tasks">
                <h3 id="opp-tasks" className="text-base font-semibold text-fg">
                  {tx("tasksTitle")}
                </h3>
                <TaskList portal="office" tasks={myTasks} dealId={o.deal.id} dealTalentId={o.id} canEdit={!closed} emptyText={tx("tasksEmpty")} />
              </section>
              <section className={card} aria-labelledby="opp-execution" data-testid="opportunity-execution">
                <h3 id="opp-execution" className="text-base font-semibold text-fg">
                  {tx("deliverablesTitle")}
                </h3>
                <p className="type-caption text-fg-muted">{tx("deliverablesHint")}</p>
                <DeliverablesBoard portal="office" dealId={o.deal.id} dealTalentId={o.id} deliverables={myDeliverables} canAct={!closed} emptyText={t("deliverablesNone")} />
              </section>
            </>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <section className={card} aria-labelledby="opp-messages">
            <h3 id="opp-messages" className="text-base font-semibold text-fg">
              {t("messagesTitle")}
            </h3>
            <MessageThread portal="office" dealId={o.deal.id} channel="talent_agency" talentId={ctx.talent.id} messages={messages} mySide="talent" canPost={!closed} revalidate={`/creator/escritorio/oportunidades/${o.id}`} />
          </section>
        </div>
      </div>
    </div>
  );
}
