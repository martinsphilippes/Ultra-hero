import type { Metadata } from "next";
import { Bell, CalendarDays, FileSignature, Megaphone, Search, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { BrandSwitcher } from "@/components/agency/BrandSwitcher";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { Button, PageHeader } from "@/components/ui";
import { listBrandMembers } from "@/lib/agency/queries";
import { getBrandContext } from "@/lib/brand-portal/server";
import { listBrandCampaigns } from "@/lib/deals/queries";
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
  const [t, members, unread, campaigns] = await Promise.all([getTranslations("brandPortal.dashboard"), listBrandMembers(ctx.brand.id), unreadInboxCount(), listBrandCampaigns(ctx.brand.id)]);
  const upcoming = [
    { key: "approvals", icon: FileSignature },
    { key: "calendar", icon: CalendarDays },
  ] as const;
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
      <section aria-labelledby="brand-upcoming" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-1">
          <h2 id="brand-upcoming" className="text-sm font-semibold text-fg">
            {t("upcomingTitle")}
          </h2>
          <p className="type-body-sm text-fg-muted">{t("upcomingHint")}</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {upcoming.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 rounded-xl border border-border bg-bg p-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{t(`upcoming.${key}.title`)}</span>
                <span className="type-caption text-fg-muted">{t(`upcoming.${key}.body`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
