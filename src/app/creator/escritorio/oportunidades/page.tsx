import type { Metadata } from "next";
import { Inbox, Megaphone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CallSummary, TalentInterestButton } from "@/components/brand-call/CallSummary";
import { TalentStatusBadge } from "@/components/deals/StatusBadges";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { networksMatch, talentCallStatus } from "@/lib/brand-call/logic";
import { listTalentBrandCalls } from "@/lib/brand-call/queries";
import { listOpportunities } from "@/lib/deals/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("opportunities") };
}

// Oportunidades do creator (web e app): só as consultas feitas a ele, com prazo para responder. Nunca
// os critérios internos, os outros creators nem valores (o cachê fica no detalhe, só na web).
export default async function OpportunitiesPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const [t, tbc, locale, list, calls] = await Promise.all([
    getTranslations("talent.opportunities"),
    getTranslations("brandCall.talent"),
    getLocale() as Promise<Locale>,
    listOpportunities(),
    listTalentBrandCalls(),
  ]);
  // 0089: pedidos de marcas visíveis à agência do creator (sem valor); "Tenho interesse" avisa a agência
  const callsSection =
    calls.available && calls.items.length > 0 ? (
      <section className="flex flex-col gap-3" aria-labelledby="opp-calls" data-testid="talent-brand-calls">
        <div className="flex flex-col gap-0.5">
          <h2 id="opp-calls" className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Megaphone className="size-4 text-accent-text" aria-hidden="true" />
            {tbc("title")}
          </h2>
          <p className="type-caption text-fg-muted">{tbc("hint")}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {calls.items.map((c) => {
            const status = talentCallStatus(c);
            return (
              <li key={c.id} className="flex flex-col gap-2" data-testid="talent-brand-call">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" variant={status === "open" ? "success" : status === "chosen" ? "accent" : "neutral"}>
                    {tbc(`status.${status}`)}
                  </Badge>
                  {status === "open" && networksMatch(c.networks, c.myNetworks) ? (
                    <Badge size="sm" variant="info">
                      {tbc("match")}
                    </Badge>
                  ) : null}
                  {c.myInterest ? (
                    <Badge size="sm" variant="accent">
                      {tbc("interestSentBadge")}
                    </Badge>
                  ) : null}
                  <span className="text-sm font-semibold text-fg">{c.title}</span>
                </div>
                <CallSummary call={c} budget="none" showBrand />
                {status === "open" ? <TalentInterestButton callId={c.id} current={c.myInterest ? c.myInterest.message : null} /> : null}
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Inbox />} title={t("unavailable")} />
      </div>
    );
  }
  const pending = list.items.filter((o) => ["consulted", "talk_requested"].includes(o.status));
  const rest = list.items.filter((o) => !pending.includes(o));
  const item = (o: (typeof list.items)[number]) => (
    <li key={o.id}>
      <Link href={`/creator/escritorio/oportunidades/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="opportunity-card">
        <Avatar src={o.brand.logoUrl} name={o.brand.name} size="md" alt="" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold text-fg">{o.deal.title}</span>
          <span className="type-caption text-fg-muted">
            {o.brand.name}
            {o.deal.expectedStart ? ` · ${t("startsOn", { date: formatPlainDate(o.deal.expectedStart, locale) })}` : ""}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <TalentStatusBadge status={o.status} />
            {o.deal.status !== "open" ? (
              <Badge size="sm" variant={o.deal.status === "confirmed" || o.deal.status === "running" || o.deal.status === "won" ? "success" : "neutral"}>
                {t(`dealStatus.${o.deal.status}`)}
              </Badge>
            ) : null}
          </span>
          {o.respondBy && !o.respondedAt ? <span className="type-caption text-warning">{t("respondBy", { date: formatDateTime(o.respondBy, locale) })}</span> : null}
        </span>
      </Link>
    </li>
  );
  return (
    <div className="flex flex-col gap-5" data-testid="opportunities">
      <p className="type-body-sm text-fg-muted">{t("intro")}</p>
      {callsSection}
      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Inbox />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <>
          {pending.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="opp-pending">
              <h2 id="opp-pending" className="text-sm font-semibold text-fg">
                {t("pendingTitle", { count: pending.length })}
              </h2>
              <ul className="flex flex-col gap-2">{pending.map(item)}</ul>
            </section>
          ) : null}
          {rest.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="opp-rest">
              <h2 id="opp-rest" className="text-sm font-semibold text-fg">
                {t("restTitle")}
              </h2>
              <ul className="flex flex-col gap-2">{rest.map(item)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
