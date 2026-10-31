import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TaskList } from "@/components/execution/TaskList";
import { EmptyState } from "@/components/ui";
import { listTeam } from "@/lib/agency/queries";
import { listDealTalents } from "@/lib/deals/queries";
import { getDealExecution } from "@/lib/execution/queries";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealTasks") };
}

type Props = { params: Promise<{ id: string }> };

// Tarefas do negócio: os 12 passos do modelo (gerados na contratação) por creator, mais avulsas da agência.
export default async function DealTasksPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, canEdit } = await loadDeal(id);
  const [t, exec, talents, team] = await Promise.all([getTranslations("agency.tasks"), getDealExecution(deal.id), listDealTalents(deal.id), listTeam(ctx.agency.id)]);
  if (!exec.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ClipboardList />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const tasks = exec.data?.tasks ?? [];
  const open = tasks.filter((x) => !["done", "cancelled"].includes(x.status)).length;
  const active = talents.filter((x) => ["proposed", "contracted"].includes(x.status));
  return (
    <div className="flex flex-col gap-4" data-testid="deal-tasks">
      <p className="type-body-sm text-fg-muted">{deal.stage === "production" || deal.stage === "closed" ? t("intro", { open, total: tasks.length }) : t("introEarly")}</p>
      <TaskList
        portal="agency"
        tasks={tasks}
        dealId={deal.id}
        canEdit={canEdit}
        create={canEdit ? { agencyId: ctx.agency.id, fixedDealId: deal.id, members: team.map((m) => ({ userId: m.userId, name: m.name })), talents: active.map((x) => ({ id: x.talentId, name: x.talent.name, userId: null })) } : undefined}
        emptyText={t("emptyDeal")}
      />
    </div>
  );
}
