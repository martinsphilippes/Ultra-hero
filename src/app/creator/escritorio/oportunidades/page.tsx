import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { TalentStatusBadge } from "@/components/deals/StatusBadges";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
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
  const [t, locale, list] = await Promise.all([getTranslations("talent.opportunities"), getLocale() as Promise<Locale>, listOpportunities()]);
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
