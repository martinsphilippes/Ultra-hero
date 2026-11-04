import { ArrowRight, Link2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { InboxItemView } from "@/components/inbox/InboxItemView";
import { ConsentBanner } from "@/components/talent/ConsentBanner";
import { MetricSource } from "@/components/talent/MetricSource";
import { TodayPanel } from "@/components/today/TodayPanel";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { DeliverableStatusBadge } from "@/components/deals/StatusBadges";
import { officeSummaryData } from "@/lib/agency/dashboards";
import { listOpportunities } from "@/lib/deals/queries";
import { formatCents } from "@/lib/deals/schemas";
import type { DeliverableStatus } from "@/lib/deals/vocab";
import { listTasks } from "@/lib/execution/queries";
import { ClientProjectCard } from "@/components/roadmap/ClientProjectCard";
import { getClientProjects } from "@/lib/roadmap/queries";
import { payStep } from "@/lib/finance/earnings";
import { myPayouts } from "@/lib/finance/queries";
import { listInbox } from "@/lib/inbox/queries";
import { formatCount } from "@/lib/talent/media-kit";
import { getKit, listSocial } from "@/lib/talent/queries";
import { consentActive, getTalentContext } from "@/lib/talent/server";
import { TALENT_TODAY_KINDS, buildTalentToday } from "@/lib/today/logic";
import { getTalentToday } from "@/lib/today/queries";
import { MessagesHomeCard } from "@/components/messaging/MessagesHomeCard";

// Início do Portal do Herói para quem está num casting (0065 + 0097): Hoje, oportunidades, tarefas, entregas, ganhos,
// disponibilidade, kit, métricas declaradas com fonte e data e os avisos da agência.
export async function AgencyHome() {
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
  const [tasks, summary, payouts, tc, todayData, te, projects, tr] = await Promise.all([
    listTasks({ talentOnly: true, open: true }),
    officeSummaryData(),
    myPayouts(),
    getTranslations("commercial"),
    getTalentToday(),
    getTranslations("talent.earnings"),
    // 0107: projetos em que o herói é cliente da agência (só as etapas visíveis ao cliente)
    getClientProjects(),
    getTranslations("roadmap.hero"),
  ]);
  const openProjects = projects.items.filter((p) => !p.closed);
  // "Hoje" (0078): o que depende do herói, do mais urgente para o menos, com link direto
  const today = todayData.available ? todayData.data : null;
  const now = new Date();
  const office = summary.available ? summary.data : null;
  const myTasks = tasks.available ? tasks.items.filter((x) => x.talentId === talent.id) : [];
  const overdue = myTasks.filter((x) => x.dueAt && new Date(x.dueAt).getTime() < Date.now()).length;
  const consentOk = consentActive(talent);
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  const focus = "transition-colors hover:border-accent/40 hover:bg-surface-hover active:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  const cardLink = `${card} ${focus}`;
  const tileLink = `flex min-h-11 flex-col gap-1 rounded-xl border border-border p-3 ${focus}`;
  const pendingOpportunities = opportunities.items.filter((o) => ["consulted", "talk_requested"].includes(o.status));

  return (
    <div className="flex flex-col gap-5">
      {!consentOk ? <ConsentBanner /> : null}
      {today ? <TodayPanel portal="talent" items={buildTalentToday(today, now)} kinds={TALENT_TODAY_KINDS} locale={locale} timezone={today.timezone} now={now} /> : null}
      {opportunities.available ? (
        <section className={card} aria-labelledby="office-opportunities" data-testid="office-opportunities">
          <div className="flex items-center justify-between gap-2">
            <h2 id="office-opportunities" className="text-sm font-semibold text-fg">
              {t("opportunitiesTitle")}
            </h2>
            <Link href="/heroi/oportunidades" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              {t("opportunitiesAll")}
            </Link>
          </div>
          <p className="text-sm text-fg">{pendingOpportunities.length > 0 ? t("opportunitiesPending", { count: pendingOpportunities.length }) : t("opportunitiesNone")}</p>
          {pendingOpportunities.slice(0, 3).map((o) => (
            <Link key={o.id} href={`/heroi/oportunidades/${o.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm text-fg hover:bg-surface-hover">
              <span className="min-w-0 truncate">
                {o.brand.name} · {o.deal.title}
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            </Link>
          ))}
        </section>
      ) : null}
      {openProjects.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="office-projects" data-testid="office-projects">
          <div className="flex items-center justify-between gap-2">
            <h2 id="office-projects" className="text-sm font-semibold text-fg">
              {tr("title")}
            </h2>
            <Link href="/heroi/projetos" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              {tr("seeAll")}
            </Link>
          </div>
          {openProjects.slice(0, 2).map((p) => (
            <ClientProjectCard key={p.dealId} project={p} limit={3} />
          ))}
        </section>
      ) : null}
      {tasks.available ? (
        // cartão inteiro clicável (04/11): abre Tarefas (disponibilidade, kit e redes abaixo também; <a> como antes)
        <Link href="/heroi/tarefas" className={cardLink} data-testid="office-tasks-home">
          <div className="flex items-center justify-between gap-2">
            <h2 id="office-tasks-home" className="text-sm font-semibold text-fg">
              {t("tasksTitle")}
            </h2>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-text">
              {t("tasksAll")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </div>
          <span className="text-sm text-fg">{myTasks.length > 0 ? t("tasksPending", { count: myTasks.length }) : t("tasksNone")}</span>
          {overdue > 0 ? <span className="type-caption font-medium text-danger">{t("tasksOverdue", { count: overdue })}</span> : null}
        </Link>
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
                    <Link href={`/heroi/oportunidades/${d.dealTalentId}`} className="flex flex-wrap items-center gap-2 py-2 text-sm text-fg hover:underline">
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
          {/* 0094: o membro da equipe não vê o que o titular recebe */}
          {payouts.available && !talent.isTeamMember ? (
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
                          {tc(`finance.payStep.${payStep(p)}`)}
                          {(p.scheduledOn ?? p.dueOn) ? ` · ${te("expected", { date: formatPlainDate((p.scheduledOn ?? p.dueOn) as string, locale) })}` : ""}
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-fg native:hidden">{formatCents(p.amountCents, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="type-caption text-fg-muted hidden native:block">{t("payoutsAppHint")}</p>
              <Link href="/heroi/financeiro" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                {t("payoutsAll")}
              </Link>
            </section>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <a href="/heroi/disponibilidade" className={cardLink} data-testid="office-availability">
          <h2 id="office-availability" className="text-sm font-semibold text-fg">
            {t("availabilityTitle")}
          </h2>
          <span className="flex flex-wrap items-center gap-2 text-sm text-fg">
            <Badge size="sm" variant={talent.availability === "available" ? "success" : talent.availability === "limited" ? "warning" : "neutral"}>
              {t(`availability.${talent.availability}`)}
            </Badge>
            {talent.availabilityNote ? <span className="text-fg-muted">{talent.availabilityNote}</span> : null}
          </span>
          <span className="type-caption text-fg-muted">{t("availabilityHint")}</span>
          <span className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-accent-text">
            {t("availabilityOpen")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </a>
        <a href="/heroi/media-kit" className={cardLink}>
          <h2 id="office-kit" className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Link2 className="size-4" aria-hidden="true" />
            {t("kitTitle")}
          </h2>
          <span className="text-sm text-fg" data-testid="office-kit-status">
            {kit.shareActive && kit.shareExpiresAt ? t("kitActive", { date: formatDateTime(kit.shareExpiresAt, locale), count: kit.viewCount }) : t("kitInactive")}
          </span>
          <span className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-accent-text">
            {t("kitOpen")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </a>
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
              <li key={n.id}>
                {/* 04/11: cada rede abre o kit de mídia, onde as redes e os números ficam */}
                <a href="/heroi/media-kit" className={tileLink}>
                  <span className="text-sm font-semibold text-fg">
                    {tn(n.network)} · @{n.handle}
                  </span>
                  <span className="text-sm text-fg">{n.followers !== null ? t("followers", { count: formatCount(n.followers, locale) ?? "" }) : t("followersUnknown")}</span>
                  <MetricSource asOf={n.as_of} side={n.declared_side} declaredAt={n.updated_at} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 0115: conversas com a agência e salas dos projetos (aba Mensagens de "Avisos e mensagens") */}
      <MessagesHomeCard portal="hero" basePath="/heroi/avisos" />

      <section className={card} aria-labelledby="office-inbox">
        <div className="flex items-center justify-between gap-2">
          <h2 id="office-inbox" className="text-sm font-semibold text-fg">
            {t("inboxTitle")}
          </h2>
          <a href="/heroi/avisos?aba=avisos" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
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

    </div>
  );
}
