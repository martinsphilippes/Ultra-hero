"use client";

import { CheckSquare, ExternalLink, Plus, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Dialog, FormField, Input, Select, Textarea, useToast, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { decideTaskAction, saveTaskAction, setTaskStatusAction } from "@/lib/execution/actions";
import type { Task } from "@/lib/execution/queries";
import { ATTACHMENT_STEPS, DECISION_STEPS, TASK_STATUSES, type TaskStatus } from "@/lib/execution/vocab";

type Portal = "agency" | "brand" | "office";
type Props = {
  portal: Portal;
  tasks: Task[];
  /** Negócio da lista (ficha); na lista geral cada tarefa traz o próprio dealId. */
  dealId?: string | null;
  requestId?: string | null;
  dealTalentId?: string | null;
  canEdit?: boolean;
  /** Agência: formulário de tarefa avulsa (precisa da agência e das opções). */
  create?: { agencyId: string; members: { userId: string; name: string }[]; talents: { id: string; name: string; userId: string | null }[]; deals?: { id: string; name: string }[]; fixedDealId?: string | null };
  showDeal?: boolean;
  emptyText: string;
};

const STATUS_VARIANT: Record<TaskStatus, BadgeVariant> = { todo: "neutral", doing: "info", blocked: "warning", done: "success", cancelled: "neutral" };
const SIDE_VARIANT = { agency: "accent", talent: "info", brand: "warning" } as const;

// Tarefas da campanha (modelo de 12 passos + avulsas). A agência muda a situação e cria avulsas; o creator conclui
// as dele (roteiro e conteúdo com anexo); a marca decide o roteiro (passo 5). Passos 5 e 8 só por decisão.
export function TaskList({ portal, tasks, dealId = null, requestId, dealTalentId, canEdit = false, create, showDeal = false, emptyText }: Props) {
  const t = useTranslations("commercial.tasks");
  const ts = useTranslations("commercial.taskSteps");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [attachFor, setAttachFor] = useState<Task | null>(null);
  const [decideFor, setDecideFor] = useState<Task | null>(null);
  const now = Date.now();

  function setStatus(task: Task, status: TaskStatus) {
    if (status === "done" && task.step && ATTACHMENT_STEPS.includes(task.step) && !task.attachmentUrl && !task.attachmentDocumentId) return setAttachFor(task);
    start(async () => {
      const result = await setTaskStatusAction(portal === "office" ? "office" : "agency", { taskId: task.id, status, url: "", documentId: "", dealId: task.dealId ?? dealId, dealTalentId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  const title = (task: Task) => (task.step ? ts(String(task.step)) : task.title);

  return (
    <div className="flex flex-col gap-3" data-testid="task-list">
      {create && canEdit ? <TaskForm create={create} /> : null}
      {tasks.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{emptyText}</p> : null}
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
        {tasks.map((task) => {
          const overdue = task.dueAt && !["done", "cancelled"].includes(task.status) && new Date(task.dueAt).getTime() < now;
          const decision = task.step !== null && DECISION_STEPS.includes(task.step);
          const mine = portal === "office" ? task.side === "talent" : portal === "brand" ? task.side === "brand" : true;
          const canChange = canEdit && mine && !decision && task.status !== "cancelled";
          return (
            <li key={task.id} className="flex flex-wrap items-start gap-3 p-3" data-testid="task-item" data-step={task.step ?? ""} data-status={task.status}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  {task.step ? <span className="font-mono type-caption text-fg-muted">{String(task.step).padStart(2, "0")}</span> : null}
                  <span className={`text-sm font-semibold ${task.status === "done" ? "text-fg-muted line-through" : "text-fg"}`}>{title(task)}</span>
                  <Badge size="sm" variant={STATUS_VARIANT[task.status]}>
                    {t(`status.${task.status}`)}
                  </Badge>
                  {portal === "agency" ? (
                    <Badge size="sm" variant={SIDE_VARIANT[task.side]}>
                      {t(`side.${task.side}`)}
                    </Badge>
                  ) : null}
                </span>
                <span className="type-caption text-fg-muted">
                  {task.talentName ? `${task.talentName} · ` : ""}
                  {showDeal && task.dealTitle ? (
                    <>
                      {task.dealId && portal === "agency" ? (
                        <Link href={`/agencia/negocios/${task.dealId}/tarefas`} className="underline-offset-2 hover:underline">
                          {task.dealTitle}
                        </Link>
                      ) : (
                        task.dealTitle
                      )}
                      {" · "}
                    </>
                  ) : null}
                  {task.dueAt ? <span className={overdue ? "font-medium text-danger" : ""}>{t("dueAt", { date: formatDateTime(task.dueAt, locale) })}</span> : t("noDue")}
                  {task.completedAt ? ` · ${t("doneAt", { date: formatDateTime(task.completedAt, locale) })}` : ""}
                </span>
                {task.description ? <span className="type-body-sm text-fg-muted">{task.description}</span> : null}
                {task.feedback ? <span className="type-body-sm text-warning">{t("feedback", { text: task.feedback })}</span> : null}
                {task.attachmentUrl ? (
                  <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    {t("openAttachment")}
                  </a>
                ) : null}
                {task.attachmentDocumentId && !task.attachmentUrl ? <span className="type-caption text-fg-muted">{t("attachmentDocument")}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {canChange && portal === "agency" ? (
                  <Select value={task.status} selectSize="sm" onChange={(e) => setStatus(task, e.target.value as TaskStatus)} disabled={pending} aria-label={t("changeStatus")}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {canChange && portal === "office" && task.status !== "done" ? (
                  <Button type="button" size="sm" leadingIcon={<CheckSquare />} onClick={() => setStatus(task, "done")} disabled={pending} data-testid="task-done">
                    {task.step && ATTACHMENT_STEPS.includes(task.step) ? t("sendAndDone") : t("markDone")}
                  </Button>
                ) : null}
                {canEdit && decision && task.step === 5 && task.status !== "done" && (portal === "brand" || portal === "agency") && task.attachmentUrl !== null ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDecideFor(task)} disabled={pending} data-testid="task-decide">
                    {t("decideScript")}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {attachFor ? <AttachDialog portal={portal === "office" ? "office" : "agency"} task={attachFor} dealId={attachFor.dealId ?? dealId} dealTalentId={dealTalentId} onClose={() => setAttachFor(null)} /> : null}
      {decideFor ? <DecideDialog portal={portal === "brand" ? "brand" : "agency"} task={decideFor} dealId={decideFor.dealId ?? dealId ?? ""} requestId={requestId} onClose={() => setDecideFor(null)} /> : null}
    </div>
  );
}

function AttachDialog({ portal, task, dealId, dealTalentId, onClose }: { portal: "agency" | "office"; task: Task; dealId: string | null; dealTalentId?: string | null; onClose: () => void }) {
  const t = useTranslations("commercial.tasks");
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^https:\/\//.test(url.trim())) return setError(t("urlRequired"));
    start(async () => {
      const result = await setTaskStatusAction(portal, { taskId: task.id, status: "done", url: url.trim(), documentId: "", dealId, dealTalentId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("attachTitle")} description={t("attachHint")} size="sm">
      <form onSubmit={run} className="flex flex-col gap-3" noValidate>
        <FormField label={t("url")} hint={t("urlHint")} required error={error}>
          <Input type="url" inputMode="url" value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} disabled={pending} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="submit" loading={pending} data-testid="task-attach-send">
            {t("sendAndDone")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DecideDialog({ portal, task, dealId, requestId, onClose }: { portal: "agency" | "brand"; task: Task; dealId: string; requestId?: string | null; onClose: () => void }) {
  const t = useTranslations("commercial.tasks");
  const { toast } = useToast();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function run(decision: "approve" | "changes") {
    setError(null);
    if ((decision === "changes" || portal === "agency") && feedback.trim().length < 5) return setError(t("feedbackRequired"));
    start(async () => {
      const result = await decideTaskAction(portal, { taskId: task.id, decision, feedback: feedback.trim(), dealId, requestId });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("decideScriptTitle")} description={portal === "agency" ? t("decideScriptAgencyHint") : t("decideScriptHint")}>
      <div className="flex flex-col gap-3">
        {task.attachmentUrl ? (
          <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
            <ExternalLink className="size-4" aria-hidden="true" />
            {t("openScript")}
          </a>
        ) : null}
        <FormField label={t("feedbackLabel")} hint={t("feedbackHint")} error={error}>
          <Textarea value={feedback} maxLength={1000} rows={3} onChange={(e) => setFeedback(e.target.value)} disabled={pending} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" leadingIcon={<ThumbsDown />} onClick={() => run("changes")} disabled={pending}>
            {t("requestChanges")}
          </Button>
          <Button type="button" leadingIcon={<ThumbsUp />} onClick={() => run("approve")} loading={pending} data-testid="task-approve">
            {t("approve")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TaskForm({ create }: { create: NonNullable<Props["create"]> }) {
  const t = useTranslations("agency.tasks.form");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: "", description: "", side: "agency" as "agency" | "talent", dealId: create.fixedDealId ?? "", talentId: "", assigneeId: "", dueDate: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (v.title.trim().length < 3) return setError(t("titleRequired"));
    const talent = create.talents.find((x) => x.id === v.talentId);
    start(async () => {
      const result = await saveTaskAction({ id: null, agencyId: create.agencyId, dealId: v.dealId, talentId: v.talentId, title: v.title, description: v.description, side: v.side, assigneeId: v.side === "talent" ? (talent?.userId ?? "") : v.assigneeId, dueDate: v.dueDate });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(false);
      setV({ ...v, title: "", description: "", dueDate: "" });
    });
  }
  return (
    <>
      <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => setOpen(true)} className="w-fit" data-testid="task-new">
        {t("new")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("title")} description={t("hint")}>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="task-form">
          <FormField label={t("taskTitle")} required>
            <Input value={v.title} maxLength={160} onChange={(e) => setV({ ...v, title: e.target.value })} disabled={pending} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("side")}>
              <Select value={v.side} onChange={(e) => setV({ ...v, side: e.target.value as "agency" | "talent" })} disabled={pending}>
                <option value="agency">{t("sideAgency")}</option>
                <option value="talent">{t("sideTalent")}</option>
              </Select>
            </FormField>
            {v.side === "talent" ? (
              <FormField label={t("talent")} required>
                <Select value={v.talentId} onChange={(e) => setV({ ...v, talentId: e.target.value })} disabled={pending}>
                  <option value="">—</option>
                  {create.talents.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label={t("assignee")}>
                <Select value={v.assigneeId} onChange={(e) => setV({ ...v, assigneeId: e.target.value })} disabled={pending}>
                  <option value="">—</option>
                  {create.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            {!create.fixedDealId && create.deals ? (
              <FormField label={t("deal")}>
                <Select value={v.dealId} onChange={(e) => setV({ ...v, dealId: e.target.value })} disabled={pending}>
                  <option value="">—</option>
                  {create.deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            <FormField label={t("dueDate")}>
              <Input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} disabled={pending} />
            </FormField>
          </div>
          <FormField label={t("description")}>
            <Textarea value={v.description} maxLength={2000} rows={2} onChange={(e) => setV({ ...v, description: e.target.value })} disabled={pending} />
          </FormField>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="submit" loading={pending} data-testid="task-save">
              {t("save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
