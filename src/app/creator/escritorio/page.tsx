import type { Metadata } from "next";
import { ArrowRight, Link2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { InboxItemView } from "@/components/inbox/InboxItemView";
import { ConsentBanner } from "@/components/talent/ConsentBanner";
import { MetricSource } from "@/components/talent/MetricSource";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { DeliverableStatusBadge } from "@/components/deals/StatusBadges";
import { officeSummaryData } from "@/lib/agency/dashboards";
import { listOpportunities } from "@/lib/deals/queries";
import { formatCents } from "@/lib/deals/schemas";
import type { DeliverableStatus } from "@/lib/deals/vocab";
import { listTasks } from "@/lib/execution/queries";
import { myPayouts } from "@/lib/finance/queries";
import { listInbox } from "@/lib/inbox/queries";
import { formatCount } from "@/lib/talent/media-kit";
import { getKit, listSocial } from "@/lib/talent/queries";
import { consentActive, getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("home") };
}

// Início do escritório (etapa B): disponibilidade, consentimento, kit e métricas declaradas com fonte
// e data; avisos da agência. Oportunidades, tarefas e agenda chegam nas próximas etapas.
export default async function OfficeHomePage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const talent = ctx.talent;
  const [t, tn, locale, kit, networks, inbox, opportunities] = await Promise.all([
    getTranslations("talent.home"),
    getTranslations("mediaKit.networks"),
    getLocale() as Promise<Locale>,
    getKit(talent.id),
    listSocial(talent.id),
    listInbox({ limit: 5 }),
    listOpportunities(),
  ]);
  const [tasks, summary, payouts, tc] = await Promise.all([listTasks({ talentOnly: true, open: true }), officeSummaryData(), myPayouts(), getTranslations("commercial")]);
  const office = summary.available ? summary.data : null;
  const myTasks = tasks.available ? tasks.items.filter((x) => x.talentId === talent.id) : [];
  const overdue = myTasks.filter((x) => x.dueAt && new Date(x.dueAt).getTime() < Date.now()).length;
  const consentOk = consentActive(talent);
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  const pendingOpportunities = opportunities.items.filter((o) => ["consulted", "talk_requested"].includes(o.status));

  return (
    <div className="flex flex-col gap-5">
      {!consentOk ? <ConsentBanner /> : null}
      {opportunities.available ? (
        <section className={card} aria-labelledby="office-opportunities" data-testid="office-opportunities">
          <div className="flex items-center justify-between gap-2">
            <h2 id="office-opportunities" className="text-sm font-semibold text-fg">
              {t("opportunitiesTitle")}
            </h2>
            <Link href="/creator/escritorio/oportunidades" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              {t("opportunitiesAll")}
            </Link>
          </div>
          <p className="text-sm text-fg">{pendingOpportunities.length > 0 ? t("opportunitiesPending", { count: pendingOpportunities.length }) : t("opportunitiesNone")}</p>
          {pendingOpportunities.slice(0, 3).map((o) => (
            <Link key={o.id} href={`/creator/escritorio/oportunidades/${o.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm text-fg hover:bg-surface-hover">
              <span className="min-w-0 truncate">
                {o.brand.name} · {o.deal.title}
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            </Link>
          ))}
        </section>
      ) : null}
      {tasks.available ? (
        <section className={card} aria-labelledby="office-tasks-home" data-testid="office-tasks-home">
          <div className="flex items-center justify-between gap-2">
            <h2 id="office-tasks-home" className="text-sm font-semibold text-fg">
              {t("tasksTitle")}
            </h2>
            <Link href="/creator/escritorio/tarefas" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              {t("tasksAll")}
            </Link>
          </div>
          <p className="text-sm text-fg">{myTasks.length > 0 ? t("tasksPending", { count: myTasks.length }) : t("tasksNone")}</p>
          {overdue > 0 ? <p className="type-caption font-medium text-danger">{t("tasksOverdue", { count: overdue })}</p> : null}
        </section>
      ) : null}
      {office ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className={card} aria-labelledby="office-next-deliveries" data-testid="office-next-deliveries">
            <h2 id="office-next-deliveries" className="text-sm font-semibold text-fg">
              {t("nextDeliveriesTitle")}
            </h2>
            <p className="type-caption text-fg-muted">{office.campaignsActive > 0 ? t("campaignsActive", { count: office.campaignsActive }) : t("campaignsNone")}</p>
            {office.deliverablesNext.length === 0 ? (
              <p className="type-body-sm text-fg-muted">{t("nextDeliveriesNone")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {office.deliverablesNext.map((d) => (
                  <li key={d.id}>
                    <Link href={`/creator/escritorio/oportunidades/${d.dealTalentId}`} className="flex flex-wrap items-center gap-2 py-2 text-sm text-fg hover:underline">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">
                          {d.title || tc(`deliverableKinds.${d.kind}`)} · {d.dealTitle}
                        </span>
                        <span className="type-caption text-fg-muted">{d.dueAt ? t("dueAt", { date: formatDateTime(d.dueAt, locale) }) : d.publishAt ? t("publishAt", { date: formatDateTime(d.publishAt, locale) }) : ""}</span>
                      </span>
                      <DeliverableStatusBadge status={d.status as DeliverableStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {office.eventsToday > 0 ? <p className="type-caption text-fg">{t("eventsToday", { count: office.eventsToday })}</p> : null}
          </section>
          {payouts.available ? (
            <section className={card} aria-labelledby="office-payouts" data-testid="office-payouts">
              <h2 id="office-payouts" className="text-sm font-semibold text-fg">
                {t("payoutsTitle")}
              </h2>
              <p className="type-caption text-fg-muted">{t("payoutsHint")}</p>
              {payouts.items.length === 0 ? (
                <p className="type-body-sm text-fg-muted">{t("payoutsNone")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {payouts.items.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-testid="office-payout">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium text-fg">{p.dealTitle}</span>
                        <span className="type-caption text-fg-muted">
                          {tc(`finance.status.${p.status}`)}
                          {p.dueOn ? ` · ${t("dueAt", { date: formatPlainDate(p.dueOn, locale) })}` : ""}
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-fg native:hidden">{formatCents(p.amountCents, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="type-caption text-fg-muted hidden native:block">{t("payoutsAppHint")}</p>
            </section>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="office-availability">
          <h2 id="office-availability" className="text-sm font-semibold text-fg">
            {t("availabilityTitle")}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
            <Badge size="sm" variant={talent.availability === "available" ? "success" : talent.availability === "limited" ? "warning" : "neutral"}>
              {t(`availability.${talent.availability}`)}
            </Badge>
            {talent.availabilityNote ? <span className="text-fg-muted">{talent.availabilityNote}</span> : null}
          </p>
          <p className="type-caption text-fg-muted">{t("availabilityHint")}</p>
          <a href="/creator/escritorio/disponibilidade" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
            {t("availabilityOpen")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </section>
        <section className={card} aria-labelledby="office-kit">
          <h2 id="office-kit" className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Link2 className="size-4" aria-hidden="true" />
            {t("kitTitle")}
          </h2>
          <p className="text-sm text-fg" data-testid="office-kit-status">
            {kit.shareActive && kit.shareExpiresAt ? t("kitActive", { date: formatDateTime(kit.shareExpiresAt, locale), count: kit.viewCount }) : t("kitInactive")}
          </p>
          <a href="/creator/escritorio/media-kit" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-accent-text underline-offset-2 hover:underline">
            {t("kitOpen")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </section>
      </div>

      <section className={card} aria-labelledby="office-metrics">
        <h2 id="office-metrics" className="text-sm font-semibold text-fg">
          {t("metricsTitle")}
        </h2>
        {networks.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("metricsEmpty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="office-metrics">
            {networks.slice(0, 4).map((n) => (
              <li key={n.id} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                <span className="text-sm font-semibold text-fg">
                  {tn(n.network)} · @{n.handle}
                </span>
                <span className="text-sm text-fg">{n.followers !== null ? t("followers", { count: formatCount(n.followers, locale) ?? "" }) : t("followersUnknown")}</span>
                <MetricSource asOf={n.as_of} side={n.declared_side} declaredAt={n.updated_at} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="office-inbox">
        <div className="flex items-center justify-between gap-2">
          <h2 id="office-inbox" className="text-sm font-semibold text-fg">
            {t("inboxTitle")}
          </h2>
          <a href="/creator/escritorio/notificacoes" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
            {t("inboxAll")}
          </a>
        </div>
        {inbox.items.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("inboxEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {inbox.items.map((item) => (
              <li key={item.id}>
                <InboxItemView item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">{t("upcoming")}</p>
    </div>
  );
}
