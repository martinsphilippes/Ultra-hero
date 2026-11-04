import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { AgencySwitcher } from "@/components/agency/AgencySwitcher";
import { SelfForm } from "@/components/agency/SettingsForms";
import { RoleBadge } from "@/components/agency/RoleBadge";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { InsightsPendingCard } from "@/components/media/InsightsPendingCard";
import { FeedbackIndicatorCard } from "@/components/project-room/FeedbackIndicatorCard";
import { GrowthIndicatorsCard } from "@/components/roadmap/GrowthIndicatorsCard";
import { RoadmapIndicatorsCard } from "@/components/roadmap/RoadmapIndicatorsCard";
import { SectorTodayPanel } from "@/components/roadmap/SectorTodayPanel";
import { PageHeader } from "@/components/ui";
import { agencyDashboardData } from "@/lib/agency/dashboards";
import { agencyDashboard } from "@/lib/agency/queries";
import { castingCounts } from "@/lib/talent/queries";
import { agencyCan } from "@/lib/agency/roles";
import { getAgencyContext } from "@/lib/agency/server";
import { getUser } from "@/lib/auth/session";
import { upcomingCount } from "@/lib/calendar/queries";
import { dealCounts } from "@/lib/deals/queries";
import { taskCounts } from "@/lib/execution/queries";
import { getFeedbackIndicator } from "@/lib/project-room/queries";
import { getAgencyInsights, getGrowthIndicators } from "@/lib/roadmap/phase3-queries";
import { getRoadmapIndicators, getSectorToday } from "@/lib/roadmap/queries";
import { isTodayScope } from "@/lib/roadmap/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dashboard") };
}

// Início da agência (os atalhos ficam na Agenda, pedido do responsável 04/11): casting, equipe, marcas atendidas, convites pendentes e avisos; os próximos
// módulos aparecem como "em breve" (pipeline, agenda e, só para o Adm, financeiro).
// 0107: "Hoje no meu setor" (etapas dos roteiros atrasadas / vencendo, ?setor=sector|mine|all) e, para gestor+, os
// indicadores dos roteiros (% no prazo, tempo médio por etapa, setor com mais atraso).
type Props = { searchParams: Promise<{ setor?: string }> };

export default async function AgencyDashboardPage({ searchParams }: Props) {
  const ctx = await getAgencyContext();
  if (ctx.state !== "ok") return null;
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const [user, sp] = await Promise.all([getUser(), searchParams]);
  const asked = isTodayScope(sp.setor) ? sp.setor : null;
  const [t, data, casting, deals, upcoming, tasks, panel, firstToday, indicators, satisfaction, growth, insights] = await Promise.all([
    getTranslations("agency.dashboard"),
    agencyDashboard(ctx.agency.id, isAdmin),
    castingCounts(ctx.agency.id),
    dealCounts(ctx.agency.id),
    upcomingCount(14, { agencyId: ctx.agency.id }),
    taskCounts(ctx.agency.id, user?.id ?? null),
    agencyDashboardData(ctx.agency.id),
    getSectorToday(ctx.agency.id, asked ?? "sector"),
    isManager ? getRoadmapIndicators(ctx.agency.id) : Promise.resolve(null),
    // 0110: satisfação dos clientes (feedback 0–10 depois da produção e no fechamento)
    isManager ? getFeedbackIndicator(ctx.agency.id) : Promise.resolve(null),
    // 0111: nova venda (próximo negócio depois do fechamento) e insights do publipost pendentes
    isManager ? getGrowthIndicators(ctx.agency.id) : Promise.resolve(null),
    getAgencyInsights(ctx.agency.id),
  ]);
  // sem setor e sem filtro escolhido: o gestor vê todos os setores; o colaborador, as etapas dele
  const sectorToday =
    !asked && firstToday.data && firstToday.data.sectors.length === 0
      ? (await getSectorToday(ctx.agency.id, isManager ? "all" : "mine")).data
      : firstToday.data;
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

      {/* Cartões clicáveis (pedido do responsável 04/11): cada um abre onde a informação está, já filtrado quando a tela
          aceita filtro. Entregas atrasadas não têm lista própria da agência: vão ao pipeline (cada negócio tem Entregas).
          Equipe só é link para o Adm (/agencia/equipe é do Adm); convites idem. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="agency-kpis">
        {deals ? <KpiCard href="/agencia/pipeline" label={t("kpi.deals")} value={deals.open} hint={t("kpi.dealsHint", { agency: deals.awaitingAgency, creator: deals.awaitingCreator })} tone={deals.awaitingAgency > 0 ? "danger" : "default"} /> : null}
        {deals ? <KpiCard href="/agencia/pipeline" label={t("kpi.confirmed")} value={deals.confirmed} /> : null}
        {tasks ? <KpiCard href={`/agencia/tarefas?f=${tasks.overdue > 0 ? "overdue" : "team"}`} label={t("kpi.tasks")} value={tasks.open} hint={t("kpi.tasksHint", { mine: tasks.mine, overdue: tasks.overdue })} tone={tasks.overdue > 0 ? "danger" : "default"} /> : null}
        {upcoming !== null ? <KpiCard href="/agencia/agenda" label={t("kpi.upcoming")} value={upcoming} hint={t("kpi.upcomingHint")} /> : null}
        {exec ? <KpiCard href="/agencia/pipeline" label={t("kpi.deliverablesOverdue")} value={exec.deliverablesOverdue} hint={t("kpi.approvalsPending", { count: exec.approvalsPending })} tone={exec.deliverablesOverdue > 0 ? "danger" : "default"} /> : null}
        {casting ? <KpiCard href="/agencia/casting" label={t("kpi.casting")} value={casting.total} hint={exec ? t("kpi.noContact", { count: exec.talentsNoContact }) : t("kpi.castingActive", { count: casting.active })} tone={exec && exec.talentsNoContact > 0 ? "danger" : "default"} /> : null}
        {exec ? <KpiCard href="/agencia/pipeline?status=encerrados" label={t("kpi.won90")} value={exec.won90d} hint={t("kpi.lost90", { count: exec.lost90d })} /> : null}
        <KpiCard href={isAdmin ? "/agencia/equipe" : undefined} label={t("kpi.team")} value={data.members} />
        <KpiCard href="/agencia/marcas" label={t("kpi.brands")} value={data.brands} />
        {isAdmin ? <KpiCard href="/agencia/equipe#convites" label={t("kpi.invites")} value={data.pendingInvites} /> : null}
        <KpiCard href="/agencia/notificacoes?filtro=nao-lidas" label={t("kpi.unread")} value={data.unread} />
      </div>
      {sectorToday ? <SectorTodayPanel data={sectorToday} indicatorsHref={indicators?.data ? "#roadmap-indicators" : undefined} /> : null}
      <InsightsPendingCard items={insights.items} side="agency" />
      {indicators?.data ? <RoadmapIndicatorsCard data={indicators.data} /> : null}
      {satisfaction?.data ? <FeedbackIndicatorCard data={satisfaction.data} /> : null}
      {growth?.data ? <GrowthIndicatorsCard data={growth.data} /> : null}
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
