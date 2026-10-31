import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/deals/MessageThread";
import { DeliverableStatusBadge, TalentStatusBadge } from "@/components/deals/StatusBadges";
import { DeliverablesBoard } from "@/components/execution/DeliverablesBoard";
import { TaskList } from "@/components/execution/TaskList";
import { TermsPanel } from "@/components/execution/TermsPanel";
import { OpportunityRespond } from "@/components/talent/OpportunityRespond";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatDuration, formatPlainDate } from "@/i18n/format";
import { listMessages, listOpportunities, myFee } from "@/lib/deals/queries";
import { formatCents } from "@/lib/deals/schemas";
import type { DeliverableStatus } from "@/lib/deals/vocab";
import { getDealExecution } from "@/lib/execution/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("opportunity") };
}

type Props = { params: Promise<{ id: string }> };

// Detalhe da oportunidade: marca, briefing (sem critérios internos), entregas previstas, cachê (só na web,
// e só depois de consultado), resposta e conversa com a agência.
export default async function OpportunityPage({ params }: Props) {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t, tc, tn, locale, list] = await Promise.all([getTranslations("talent.opportunities"), getTranslations("commercial"), getTranslations("mediaKit.networks"), getLocale() as Promise<Locale>, listOpportunities(id)]);
  const o = list.items[0];
  if (!o) notFound();
  const contracted = ["proposed", "contracted"].includes(o.status);
  const [fee, messages, exec, tx] = await Promise.all([myFee(o.id), listMessages(o.deal.id, "talent_agency", ctx.talent.id), contracted ? getDealExecution(o.deal.id) : Promise.resolve({ available: true, data: null }), getTranslations("talent.execution")]);
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
      {!closed ? <OpportunityRespond dealTalentId={o.id} status={o.status} /> : null}
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
              {row(t("fields.period"), o.deal.expectedStart ? `${formatPlainDate(o.deal.expectedStart, locale)}${o.deal.expectedEnd && o.deal.expectedEnd !== o.deal.expectedStart ? ` – ${formatPlainDate(o.deal.expectedEnd, locale)}` : ""}` : null)}
              {row(t("fields.respondBy"), o.respondBy && !o.respondedAt ? formatDateTime(o.respondBy, locale) : null)}
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
          {!(execution && myDeliverables.length > 0) ? (
            <section className={card} aria-labelledby="opp-deliverables">
              <h3 id="opp-deliverables" className="text-base font-semibold text-fg">
                {t("deliverablesTitle")}
              </h3>
              {o.deliverables.length === 0 ? (
                <p className="type-body-sm text-fg-muted">{t("deliverablesNone")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {o.deliverables.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium text-fg">
                          {tc(`deliverableKinds.${d.kind}`)}
                          {d.network ? ` · ${tn(d.network)}` : ""}
                          {d.title ? ` · ${d.title}` : ""}
                        </span>
                        <span className="type-caption text-fg-muted">
                          {d.dueAt ? t("dueAt", { date: formatPlainDate(d.dueAt.slice(0, 10), locale) }) : ""}
                          {d.brief ? ` · ${d.brief}` : ""}
                        </span>
                      </span>
                      <DeliverableStatusBadge status={d.status as DeliverableStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          {fee !== null ? (
            <section className={`${card} native:hidden`} aria-labelledby="opp-fee" data-testid="opportunity-fee">
              <h3 id="opp-fee" className="text-base font-semibold text-fg">
                {t("feeTitle")}
              </h3>
              <p className="font-mono text-xl font-semibold text-fg">{formatCents(fee, locale)}</p>
              <p className="type-caption text-fg-muted">{t("feeHint")}</p>
            </section>
          ) : null}
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
