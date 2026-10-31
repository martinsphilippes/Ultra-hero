import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TaskList } from "@/components/execution/TaskList";
import { EmptyState } from "@/components/ui";
import { listTasks } from "@/lib/execution/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("tasks") };
}

// Tarefas do creator: só as do lado dele (roteiro, gravação, conteúdo, publicação, comprovação, avulsas).
// Concluir roteiro e conteúdo pede o link do arquivo; a aprovação da marca aparece como passo próprio.
export default async function OfficeTasksPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const [t, list] = await Promise.all([getTranslations("talent.tasks"), listTasks({ talentOnly: true })]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ClipboardList />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }
  const mine = list.items.filter((x) => x.talentId === ctx.talent.id);
  const open = mine.filter((x) => !["done", "cancelled"].includes(x.status));
  const done = mine.filter((x) => ["done", "cancelled"].includes(x.status));
  return (
    <div className="flex flex-col gap-5" data-testid="office-tasks">
      <p className="type-body-sm text-fg-muted">{t("intro")}</p>
      <section className="flex flex-col gap-3" aria-labelledby="tasks-open">
        <h3 id="tasks-open" className="text-sm font-semibold text-fg">
          {t("openTitle", { count: open.length })}
        </h3>
        <TaskList portal="office" tasks={open} canEdit showDeal emptyText={t("empty")} />
      </section>
      {done.length > 0 ? (
        <details className="rounded-2xl border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-medium text-fg">{t("doneTitle", { count: done.length })}</summary>
          <div className="mt-3">
            <TaskList portal="office" tasks={done} showDeal emptyText="" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
