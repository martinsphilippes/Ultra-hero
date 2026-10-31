import type { Metadata } from "next";
import { Bell, FileSignature, Megaphone, Search, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { BrandSwitcher } from "@/components/agency/BrandSwitcher";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { Button, PageHeader } from "@/components/ui";
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
  const [t, members, unread, campaigns, approvals] = await Promise.all([getTranslations("brandPortal.dashboard"), listBrandMembers(ctx.brand.id), unreadInboxCount(), listBrandCampaigns(ctx.brand.id), listTasks({ open: true })]);
  // aprovações pendentes: roteiros (passo 5) já enviados pelo creator e ainda sem decisão da marca
  const pendingApprovals = approvals.available ? approvals.items.filter((x) => x.side === "brand" && x.attachmentUrl !== null).length : null;
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
      <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">
        <FileSignature className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        {t("approvalsNote")}
      </p>
    </div>
  );
}
