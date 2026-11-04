"use client";

import { CheckCircle2, Circle, Eye, EyeOff, Repeat, UserRound, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, Button, Dialog, EntitySelect, FormField, Select, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { assignRoadmapTaskAction, setRoadmapTaskAction } from "@/lib/roadmap/actions";
import type { RoadmapTask } from "@/lib/roadmap/queries";
import { SECTORS, type Sector } from "@/lib/roadmap/vocab";
import { memberOption } from "@/lib/ui/entity";
import { cn } from "@/lib/utils";

export type SectorMember = { userId: string; name: string; role?: string | null; jobTitle?: string | null; sectors: Sector[] };

type Props = {
  dealId: string;
  tasks: RoadmapTask[];
  today: string;
  members: SectorMember[];
  /** Reatribuir: gestor+ ou responsável/equipe do negócio (o banco confere de novo). */
  canAssign: boolean;
};

// Etapas do roteiro em ordem, com filtro por setor: prazo, responsável, visível ao cliente/interna, a etapa de agora
// em destaque, marcar feita (quem trabalha a etapa) e reatribuir (responsável e setor).
export function RoadmapSteps({ dealId, tasks, today, members, canAssign }: Props) {
  const t = useTranslations("roadmap.deal");
  const ts = useTranslations("roadmap.sectors");
  const tr = useTranslations("roadmap.recurrences");
  const tm = useTranslations("roadmap.milestones");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [filter, setFilter] = useState<Sector | "all">("all");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoadmapTask | null>(null);
  const current = tasks.find((k) => k.status !== "done")?.id ?? null;
  const visible = filter === "all" ? tasks : tasks.filter((k) => k.sector === filter || k.sectorExtra === filter);
  const counts = Object.fromEntries(SECTORS.map((s) => [s, tasks.filter((k) => k.status !== "done" && (k.sector === s || k.sectorExtra === s)).length])) as Record<Sector, number>;

  function toggle(task: RoadmapTask) {
    setBusy(task.id);
    start(async () => {
      const result = await setRoadmapTaskAction({ taskId: task.id, done: task.status !== "done", dealId });
      setBusy(null);
      toast(result.ok ? { title: result.message, variant: "success" } : { title: result.error, variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("filtersLabel")} className="flex flex-wrap gap-2" data-testid="roadmap-filters">
        {(["all", ...SECTORS] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              filter === key ? "border-fg bg-fg text-bg" : "border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg",
            )}
          >
            {key === "all" ? t("filterAll") : `${ts(key)}${counts[key] > 0 ? ` · ${counts[key]}` : ""}`}
          </button>
        ))}
      </div>
      <ol className="flex flex-col gap-2" data-testid="roadmap-steps">
        {visible.map((k) => {
          const done = k.status === "done";
          const dueToday = !done && k.dueOn === today;
          const isCurrent = k.id === current;
          return (
            <li
              key={k.id}
              className={cn(
                "flex gap-3 rounded-xl border p-3",
                k.late ? "border-danger/40 bg-danger-soft/40" : dueToday || isCurrent ? "border-accent/40 bg-accent-soft/40" : "border-border bg-surface",
              )}
              data-testid="roadmap-step"
              data-status={k.status}
            >
              <button
                type="button"
                onClick={() => toggle(k)}
                disabled={!k.canWork || pending || k.automatic}
                aria-label={done ? t("reopen") : t("markDone")}
                aria-pressed={done}
                className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="roadmap-step-toggle"
              >
                {done ? <CheckCircle2 className="size-6 text-success" aria-hidden="true" /> : <Circle className={cn("size-6", busy === k.id && "animate-pulse")} aria-hidden="true" />}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className={cn("text-sm font-medium text-fg", done && "text-fg-muted line-through")}>
                    <span className="type-numeric text-fg-muted">{k.position}. </span>
                    {k.title}
                  </span>
                  <span className={cn("type-caption whitespace-nowrap", k.late ? "font-semibold text-danger" : "text-fg-muted")}>
                    {done && k.completedOn
                      ? t("doneOn", { date: formatPlainDate(k.completedOn, locale) })
                      : k.dueOn
                        ? t("due", { date: formatPlainDate(k.dueOn, locale) })
                        : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="accent" size="sm">
                    {k.sectorExtra ? `${ts(k.sector)} + ${ts(k.sectorExtra)}` : ts(k.sector)}
                  </Badge>
                  {isCurrent && !k.late ? (
                    <Badge variant="info" size="sm">
                      {t("current")}
                    </Badge>
                  ) : null}
                  {k.late ? (
                    <Badge variant="danger" size="sm">
                      {t("late")}
                    </Badge>
                  ) : dueToday ? (
                    <Badge variant="warning" size="sm">
                      {t("today")}
                    </Badge>
                  ) : null}
                  <Badge variant="neutral" size="sm" icon={k.clientVisible ? <Eye /> : <EyeOff />}>
                    {k.clientVisible ? t("clientVisible") : t("internal")}
                  </Badge>
                  {k.automatic ? (
                    <Badge variant="neutral" size="sm" icon={<Zap />}>
                      {t("automatic")}
                    </Badge>
                  ) : null}
                  {k.recurrence ? (
                    <Badge variant="neutral" size="sm" icon={<Repeat />}>
                      {tr(k.recurrence)}
                    </Badge>
                  ) : null}
                  {k.milestone ? (
                    <Badge variant="neutral" size="sm">
                      {tm(k.milestone)}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 type-caption text-fg-muted">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    {k.assigneeName ?? t("noAssignee")}
                  </span>
                  {canAssign && !done ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(k)} data-testid="roadmap-step-assign">
                      {t("reassign")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {editing ? <AssignDialog dealId={dealId} task={editing} members={members} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function AssignDialog({ dealId, task, members, onClose }: { dealId: string; task: RoadmapTask; members: SectorMember[]; onClose: () => void }) {
  const t = useTranslations("roadmap.deal");
  const ts = useTranslations("roadmap.sectors");
  const tp = useTranslations("pickers");
  const { toast } = useToast();
  const [sector, setSector] = useState<Sector>(task.sector);
  const [assignee, setAssignee] = useState(task.assigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // quem é do setor escolhido aparece primeiro
  const sorted = [...members].sort((a, b) => Number(b.sectors.includes(sector)) - Number(a.sectors.includes(sector)) || a.name.localeCompare(b.name));

  function save() {
    setError(null);
    start(async () => {
      const result = await assignRoadmapTaskAction({ taskId: task.id, assigneeId: assignee, sector, dealId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={t("reassignTitle")}
      description={task.title}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={save} loading={pending} data-testid="roadmap-assign-save">
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label={t("sector")}>
          <Select value={sector} onChange={(e) => setSector(e.target.value as Sector)} disabled={pending}>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("assignee")}>
          <EntitySelect
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            disabled={pending}
            emptyLabel={t("noAssignee")}
            options={sorted.map((m) => ({ ...memberOption(tp, m), detail: m.sectors.length > 0 ? m.sectors.map((s) => ts(s)).join(", ") : (m.jobTitle ?? null) }))}
          />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
