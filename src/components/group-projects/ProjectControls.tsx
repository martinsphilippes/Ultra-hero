"use client";

import { Check, Circle, CircleDot } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Checkbox, FormField, Input, Select, Sheet, Textarea } from "@/components/ui";
import { saveGroupProjectAction, setGroupProjectStepAction } from "@/lib/group-projects/actions";
import { PLAN_FIELDS, PRIORITIES, PROJECT_STATUSES, type Plan, type PlanField, type Priority, type ProjectStatus, type StepStatus, nextStepStatus } from "@/lib/group-projects/format";
import { cn } from "@/lib/utils";

// Plano de projetos (0137): a microetapa avança com um toque (a fazer → em andamento → concluída) e guarda uma
// anotação; o gestor edita a ficha inteira numa folha (responsável, apoio, prioridade, nota, prazo, 5W2H e metas).

const ICON: Record<StepStatus, typeof Circle> = { todo: Circle, doing: CircleDot, done: Check };

export function StepItem({
  projectId,
  number,
  stage,
  position,
  title,
  status,
  note,
  canMark,
}: {
  projectId: string;
  number: number;
  stage: number;
  position: number;
  title: string;
  status: StepStatus;
  note: string;
  canMark: boolean;
}) {
  const t = useTranslations("groupProjects.step");
  const router = useRouter();
  const [value, setValue] = useState<StepStatus>(status);
  const [text, setText] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const Icon = ICON[value];

  function save(next: StepStatus, nextNote: string) {
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      const r = await setGroupProjectStepAction({ projectId, number, stage, position, status: next, note: nextNote });
      if (!r.ok) {
        setValue(prev);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-1 py-2" data-testid={`step-${stage}-${position}`} data-status={value}>
      <div className="flex items-start gap-3">
        {canMark ? (
          <button
            type="button"
            onClick={() => save(nextStepStatus(value), text)}
            disabled={pending}
            aria-label={t("toggle", { title })}
            title={t(value)}
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              value === "done" ? "border-success bg-success text-white" : value === "doing" ? "border-warning text-warning" : "border-border-strong text-fg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2",
              value === "done" ? "border-success bg-success text-white" : value === "doing" ? "border-warning text-warning" : "border-border text-fg-subtle",
            )}
            title={t(value)}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm text-fg", value === "done" && "text-fg-muted line-through")}>
            <span className="mr-1.5 font-mono text-xs text-fg-muted">{`${stage}.${position}`}</span>
            {title}
          </p>
          <p className="type-caption text-fg-muted">{t(value)}</p>
          {note && !canMark ? <p className="type-caption text-fg">{note}</p> : null}
          {canMark ? (
            <details className="pt-1">
              <summary className="cursor-pointer type-caption font-semibold text-accent-text">{text ? text : t("note")}</summary>
              <div className="flex flex-col gap-2 pt-2">
                <Textarea rows={2} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} aria-label={t("note")} />
                <Button size="sm" variant="secondary" loading={pending} disabled={text.trim() === note} onClick={() => save(value, text)} className="w-fit">
                  {t("saveNote")}
                </Button>
              </div>
            </details>
          ) : null}
          {error ? (
            <p role="alert" className="type-caption text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

type EditorProject = {
  id: string;
  number: number;
  name: string;
  category: string;
  score: number;
  priority: Priority;
  status: ProjectStatus;
  objective: string;
  plan: Plan;
  stageGoals: string[];
  ownerId: string | null;
  supportIds: string[];
  dueOn: string | null;
  notes: string;
};

export function ProjectEditor({ project, members }: { project: EditorProject; members: { id: string; name: string }[] }) {
  const t = useTranslations("groupProjects");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    name: project.name,
    category: project.category,
    score: String(project.score),
    priority: project.priority,
    status: project.status,
    objective: project.objective,
    notes: project.notes,
    due_on: project.dueOn ?? "",
    owner_id: project.ownerId ?? "",
    support_ids: project.supportIds,
    plan: Object.fromEntries(PLAN_FIELDS.map((f) => [f, project.plan[f] ?? ""])) as Record<PlanField, string>,
    stage_goals: [0, 1, 2, 3, 4].map((i) => project.stageGoals[i] ?? ""),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const score = Number(v.score.replace(",", "."));
  const valid = v.name.trim().length >= 2 && Number.isFinite(score) && score >= 0 && score <= 5;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="project-edit">
        {t("detail.edit")}
      </Button>
      {msg?.ok ? (
        <p role="status" className="type-caption text-success">
          {msg.text}
        </p>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen} title={t("editor.title")} description={`${String(project.number).padStart(2, "0")} · ${project.name}`}>
        <form
          className="flex flex-col gap-3"
          data-testid="project-editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            start(async () => {
              setMsg(null);
              const r = await saveGroupProjectAction({
                id: project.id,
                number: project.number,
                data: {
                  name: v.name,
                  category: v.category,
                  score,
                  priority: v.priority,
                  status: v.status,
                  objective: v.objective,
                  notes: v.notes,
                  due_on: v.due_on,
                  owner_id: v.owner_id,
                  support_ids: v.support_ids,
                  plan: v.plan,
                  stage_goals: v.stage_goals,
                },
              });
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setOpen(false);
              setMsg({ ok: true, text: t("editor.saved") });
              router.refresh();
            });
          }}
        >
          <FormField label={t("editor.name")} required>
            <Input value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("editor.priority")}>
              <Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priorities.${p}.label`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("editor.score")}>
              <Input inputMode="decimal" value={v.score} onChange={(e) => setV({ ...v, score: e.target.value })} />
            </FormField>
            <FormField label={t("editor.status")}>
              <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("editor.due")}>
              <Input type="date" value={v.due_on} onChange={(e) => setV({ ...v, due_on: e.target.value })} />
            </FormField>
          </div>
          <FormField label={t("editor.category")}>
            <Input value={v.category} maxLength={80} onChange={(e) => setV({ ...v, category: e.target.value })} />
          </FormField>
          <FormField label={t("editor.owner")}>
            <Select value={v.owner_id} onChange={(e) => setV({ ...v, owner_id: e.target.value })}>
              <option value="">{t("editor.none")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </FormField>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-fg">{t("editor.support")}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {members.map((m) => (
                <Checkbox
                  key={m.id}
                  label={m.name}
                  checked={v.support_ids.includes(m.id)}
                  onChange={(e) =>
                    setV({ ...v, support_ids: e.target.checked ? [...v.support_ids, m.id].slice(0, 10) : v.support_ids.filter((x) => x !== m.id) })
                  }
                />
              ))}
            </div>
          </fieldset>
          <FormField label={t("editor.objective")}>
            <Textarea rows={3} value={v.objective} maxLength={1000} onChange={(e) => setV({ ...v, objective: e.target.value })} />
          </FormField>
          {PLAN_FIELDS.map((f) => (
            <FormField key={f} label={t(`plan.${f}`)}>
              <Textarea rows={2} value={v.plan[f]} maxLength={1000} onChange={(e) => setV({ ...v, plan: { ...v.plan, [f]: e.target.value } })} />
            </FormField>
          ))}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-fg">{t("editor.goals")}</legend>
            {v.stage_goals.map((g, i) => (
              <Input
                key={i}
                value={g}
                maxLength={300}
                aria-label={`${t("detail.stageGoal")} ${i + 1}`}
                onChange={(e) => setV({ ...v, stage_goals: v.stage_goals.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            ))}
          </fieldset>
          <FormField label={t("editor.notes")}>
            <Textarea rows={3} value={v.notes} maxLength={2000} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </FormField>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" loading={pending} disabled={!valid}>
              {t("editor.save")}
            </Button>
            {msg && !msg.ok ? (
              <p role="alert" className="type-caption text-danger">
                {msg.text}
              </p>
            ) : null}
          </div>
        </form>
      </Sheet>
    </>
  );
}
