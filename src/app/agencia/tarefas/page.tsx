import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { TaskList } from "@/components/execution/TaskList";
import { EmptyState, PageHeader } from "@/components/ui";
import { listTeam } from "@/lib/agency/queries";
import { requireAgency } from "@/lib/agency/server";
import { getUser } from "@/lib/auth/session";
import { listDeals } from "@/lib/deals/queries";
import { listTasks, taskCounts } from "@/lib/execution/queries";
import { listTalents } from "@/lib/talent/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("tasks") };
}

type Props = { searchParams: Promise<{ f?: string }> };

// Tarefas da agência: as minhas, as da equipe e as atrasadas (a RLS limita o colaborador aos negócios dele).
export default async function AgencyTasksPage({ searchParams }: Props) {
  const [ctx, user, sp] = await Promise.all([requireAgency("staff"), getUser(), searchParams]);
  const filter = sp.f === "team" || sp.f === "overdue" || sp.f === "done" ? sp.f : "mine";
  const [t, list, counts, team, talents, deals] = await Promise.all([
    getTranslations("agency.tasks"),
    listTasks({ agencyId: ctx.agency.id, mine: filter === "mine" ? (user?.id ?? "") : undefined, overdue: filter === "overdue", open: filter !== "done" }),
    taskCounts(ctx.agency.id, user?.id ?? null),
    listTeam(ctx.agency.id),
    listTalents(ctx.agency.id),
    listDeals(ctx.agency.id),
  ]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ClipboardList />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const items = filter === "done" ? list.items.filter((x) => x.status === "done").slice(0, 100) : list.items;
  const filters = [
    { key: "mine", count: counts?.mine },
    { key: "team", count: counts?.open },
    { key: "overdue", count: counts?.overdue },
    { key: "done", count: undefined },
  ] as const;
  return (
    <div className="flex flex-col gap-5" data-testid="agency-tasks">
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-2" data-testid="task-filters">
        {filters.map((f) => (
          <FilterAnchor key={f.key} href={`/agencia/tarefas?f=${f.key}`} active={filter === f.key} label={`${t(`filters.${f.key}`)}${f.count !== undefined ? ` · ${f.count}` : ""}`} />
        ))}
      </nav>
      <TaskList
        portal="agency"
        tasks={items}
        canEdit
        showDeal
        create={{
          agencyId: ctx.agency.id,
          members: team.map((m) => ({ userId: m.userId, name: m.name })),
          talents: talents.items.map((x) => ({ id: x.id, name: x.name, userId: null })),
          deals: deals.items.map((d) => ({ id: d.id, name: `${d.title} · ${d.brand.name}` })),
        }}
        emptyText={t(`empty.${filter}`)}
      />
    </div>
  );
}
