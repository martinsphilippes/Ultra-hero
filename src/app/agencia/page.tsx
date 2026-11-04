import type { Metadata } from "next";
import { BriefcaseBusiness, ClipboardList, Contact, Plus, UserPlus, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { AgencySwitcher } from "@/components/agency/AgencySwitcher";
import { SelfForm } from "@/components/agency/SettingsForms";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { Button, PageHeader } from "@/components/ui";
import { agencyDashboardData } from "@/lib/agency/dashboards";
import { agencyDashboard } from "@/lib/agency/queries";
import { castingCounts } from "@/lib/talent/queries";
import { agencyCan } from "@/lib/agency/roles";
import { getAgencyContext } from "@/lib/agency/server";
import { getUser } from "@/lib/auth/session";
import { upcomingCount } from "@/lib/calendar/queries";
import { dealCounts } from "@/lib/deals/queries";
import { taskCounts } from "@/lib/execution/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dashboard") };
}

// Início da agência: casting, equipe, marcas atendidas, convites pendentes e avisos; os próximos
// módulos aparecem como "em breve" (pipeline, agenda e, só para o Adm, financeiro).
export default async function AgencyDashboardPage() {
  const ctx = await getAgencyContext();
  if (ctx.state !== "ok") return null;
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const user = await getUser();
  const [t, data, casting, deals, upcoming, tasks, panel] = await Promise.all([
    getTranslations("agency.dashboard"),
    agencyDashboard(ctx.agency.id, isAdmin),
    castingCounts(ctx.agency.id),
    dealCounts(ctx.agency.id),
    upcomingCount(14, { agencyId: ctx.agency.id }),
    taskCounts(ctx.agency.id, user?.id ?? null),
    agencyDashboardData(ctx.agency.id),
  ]);
  // painel executivo (0069): entregas atrasadas, aprovações da marca, creators sem contato, ganhos/perdidos; finanças só Adm
  const exec = panel.available ? panel.data : null;
  const finance = exec?.finance ?? null;
  const upcomingModules = [...(isAdmin && !finance && panel.available ? [{ key: "finance", icon: Wallet }] : [])] as const;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={ctx.agency.name}
        description={ctx.memberName ? t("greeting", { name: ctx.memberName }) : t("adminView")}
        actions={ctx.role ? <RoleBadge role={ctx.role} /> : null}
      />
      {ctx.platformAdmin && ctx.agencies.length > 1 ? (
        <AgencySwitcher agencies={ctx.agencies.map((a) => ({ id: a.id, name: a.name, isDemo: a.isDemo }))} currentId={ctx.agency.id} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="agency-kpis">
        {deals ? <KpiCard label={t("kpi.deals")} value={deals.open} hint={t("kpi.dealsHint", { agency: deals.awaitingAgency, creator: deals.awaitingCreator })} tone={deals.awaitingAgency > 0 ? "danger" : "default"} /> : null}
        {deals ? <KpiCard label={t("kpi.confirmed")} value={deals.confirmed} /> : null}
        {tasks ? <KpiCard label={t("kpi.tasks")} value={tasks.open} hint={t("kpi.tasksHint", { mine: tasks.mine, overdue: tasks.overdue })} tone={tasks.overdue > 0 ? "danger" : "default"} /> : null}
        {upcoming !== null ? <KpiCard label={t("kpi.upcoming")} value={upcoming} hint={t("kpi.upcomingHint")} /> : null}
        {exec ? <KpiCard label={t("kpi.deliverablesOverdue")} value={exec.deliverablesOverdue} hint={t("kpi.approvalsPending", { count: exec.approvalsPending })} tone={exec.deliverablesOverdue > 0 ? "danger" : "default"} /> : null}
        {casting ? <KpiCard label={t("kpi.casting")} value={casting.total} hint={exec ? t("kpi.noContact", { count: exec.talentsNoContact }) : t("kpi.castingActive", { count: casting.active })} tone={exec && exec.talentsNoContact > 0 ? "danger" : "default"} /> : null}
        {exec ? <KpiCard label={t("kpi.won90")} value={exec.won90d} hint={t("kpi.lost90", { count: exec.lost90d })} /> : null}
        <KpiCard label={t("kpi.team")} value={data.members} />
        <KpiCard label={t("kpi.brands")} value={data.brands} />
        {isAdmin ? <KpiCard label={t("kpi.invites")} value={data.pendingInvites} /> : null}
        <KpiCard label={t("kpi.unread")} value={data.unread} />
      </div>
      {finance ? (
        <section aria-labelledby="agency-finance-home" className="flex flex-col gap-3" data-testid="agency-finance-home">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="agency-finance-home" className="text-sm font-semibold text-fg">
              {t("financeTitle")}
            </h2>
            <Link href="/agencia/financeiro" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              {t("seeFinance")}
            </Link>
          </div>
          <FinanceKpis summary={finance} />
        </section>
      ) : null}

      <section aria-labelledby="agency-quick" className="flex flex-col gap-3">
        <h2 id="agency-quick" className="text-sm font-semibold text-fg">
          {t("quickTitle")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" leadingIcon={<BriefcaseBusiness />}>
            <Link href="/agencia/pipeline">{t("seePipeline")}</Link>
          </Button>
          {tasks ? (
            <Button asChild size="sm" variant="secondary" leadingIcon={<ClipboardList />}>
              <Link href="/agencia/tarefas">{t("seeTasks")}</Link>
            </Button>
          ) : null}
          {isManager ? (
            <Button asChild size="sm" variant="secondary" leadingIcon={<Contact />}>
              <Link href="/agencia/casting/novo">{t("newTalent")}</Link>
            </Button>
          ) : null}
          {isManager ? (
            <Button asChild size="sm" variant="secondary" leadingIcon={<Plus />}>
              <Link href="/agencia/marcas/nova">{t("newBrand")}</Link>
            </Button>
          ) : null}
          {isAdmin && !ctx.agency.isDemo ? (
            <Button asChild size="sm" variant="secondary" leadingIcon={<UserPlus />}>
              <Link href="/agencia/equipe">{t("inviteTeam")}</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="secondary">
            <Link href="/agencia/casting">{t("seeCasting")}</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/agencia/marcas">{t("seeBrands")}</Link>
          </Button>
        </div>
      </section>

      {upcomingModules.length > 0 ? (
        <section aria-labelledby="agency-upcoming" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1">
            <h2 id="agency-upcoming" className="text-sm font-semibold text-fg">
              {t("upcomingTitle")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("upcomingHint")}</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {upcomingModules.map(({ key, icon: Icon }) => (
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
      ) : null}

      {ctx.role && ctx.memberName ? (
        <section aria-labelledby="agency-self" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1">
            <h2 id="agency-self" className="text-sm font-semibold text-fg">
              {t("selfTitle")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("selfHint")}</p>
          </div>
          <SelfForm initialName={ctx.memberName} initialTitle={ctx.memberTitle ?? ""} />
        </section>
      ) : null}
    </div>
  );
}
