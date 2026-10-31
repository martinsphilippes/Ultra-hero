import type { Metadata } from "next";
import { Bell, FileSignature, Megaphone, Search, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { BrandSwitcher } from "@/components/agency/BrandSwitcher";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { TalentCardCompact } from "@/components/brand-portal/TalentCardView";
import { Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { brandDashboardData } from "@/lib/agency/dashboards";
import { listBrandMembers } from "@/lib/agency/queries";
import { getBrandContext } from "@/lib/brand-portal/server";
import { listBrandCampaigns } from "@/lib/deals/queries";
import { listTasks } from "@/lib/execution/queries";
import { unreadInboxCount } from "@/lib/inbox/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("dashboard") };
}

// Início da marca (Etapa A): equipe, agência que atende e avisos; campanhas, busca de creators e
// calendário comercial chegam nas próximas etapas ("em breve").
export default async function BrandDashboardPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const [t, tc, locale, members, unread, campaigns, approvals, panel] = await Promise.all([
    getTranslations("brandPortal.dashboard"),
    getTranslations("commercial"),
    getLocale() as Promise<Locale>,
    listBrandMembers(ctx.brand.id),
    unreadInboxCount(),
    listBrandCampaigns(ctx.brand.id),
    listTasks({ open: true }),
    brandDashboardData(ctx.brand.id),
  ]);
  // aprovações pendentes: roteiros e entregas aguardando a marca (painel 0069; antes dele, só os roteiros pela RLS)
  const dash = panel.available ? panel.data : null;
  const pendingApprovals = dash ? dash.approvalsPending : approvals.available ? approvals.items.filter((x) => x.side === "brand" && x.attachmentUrl !== null).length : null;
  const inProgress = campaigns.items.filter((c) => ["received", "building", "proposal", "contracting", "running"].includes(c.status));
  const drafts = campaigns.items.filter((c) => c.status === "draft");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={ctx.brand.name}
        description={ctx.agency ? t("servedBy", { agency: ctx.agency.name }) : undefined}
        actions={ctx.role ? <RoleBadge role={ctx.role === "owner" ? "owner" : "brandStaff"} /> : null}
      />
      {ctx.brands.length > 1 ? <BrandSwitcher brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))} currentId={ctx.brand.id} /> : null}
      <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 type-body-sm text-fg-muted" data-testid="brand-inbox-note">
        <Bell className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        {t("inboxNote")}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="brand-kpis">
        {campaigns.available ? <KpiCard label={t("kpi.campaigns")} value={inProgress.length} hint={drafts.length > 0 ? t("kpi.drafts", { count: drafts.length }) : undefined} /> : null}
        {pendingApprovals !== null ? <KpiCard label={t("kpi.approvals")} value={pendingApprovals} hint={t("kpi.approvalsHint")} tone={pendingApprovals > 0 ? "danger" : "default"} /> : null}
        <KpiCard label={t("kpi.team")} value={members.length} />
        <KpiCard label={t("kpi.unread")} value={unread ?? 0} />
      </div>
      <div className="flex flex-wrap gap-2">
        {ctx.role && ctx.agency ? (
          <Button asChild size="sm" leadingIcon={<Megaphone />}>
            <Link href="/marca/campanhas/nova">{t("newCampaign")}</Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="secondary" leadingIcon={<Search />}>
          <Link href="/marca/creators">{t("seeCreators")}</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href="/marca/campanhas">{t("seeCampaigns")}</Link>
        </Button>
        <Button asChild size="sm" variant="secondary" leadingIcon={<Users />}>
          <Link href="/marca/equipe">{t("seeTeam")}</Link>
        </Button>
      </div>
      {dash ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="brand-suggested" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="brand-suggested">
            <div className="flex flex-col gap-1">
              <h2 id="brand-suggested" className="text-sm font-semibold text-fg">
                {t("suggestedTitle")}
              </h2>
              <p className="type-body-sm text-fg-muted">{t("suggestedHint")}</p>
            </div>
            {dash.suggested.length === 0 ? (
              <p className="type-body-sm text-fg-muted">{t("suggestedNone")}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {dash.suggested.map((card) => (
                  <li key={card.dealTalentId} className="flex flex-col gap-1">
                    <span className="type-caption text-fg-muted">{card.dealTitle}</span>
                    <TalentCardCompact card={card} href={`/marca/creators/${card.id}`} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="brand-next-events" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="brand-next-events">
            <h2 id="brand-next-events" className="text-sm font-semibold text-fg">
              {t("nextEventsTitle")}
            </h2>
            {dash.nextEvents.length === 0 ? (
              <p className="type-body-sm text-fg-muted">{t("nextEventsNone")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {dash.nextEvents.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 py-2">
                    <span className="text-sm font-medium text-fg">{e.title}</span>
                    <span className="type-caption text-fg-muted">
                      {e.allDay ? formatPlainDate(e.startsAt.slice(0, 10), locale) : formatDateTime(e.startsAt, locale)} · {tc(`eventKinds.${e.kind}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/marca/agenda" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              {t("seeAgenda")}
            </Link>
          </section>
        </div>
      ) : null}
      <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">
        <FileSignature className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        {t("approvalsNote")}
      </p>
    </div>
  );
}
