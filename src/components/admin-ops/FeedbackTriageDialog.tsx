"use client";

import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { triageFeedback } from "@/app/admin/ops-actions";
import { FEEDBACK_ADMIN_NOTE_MAX, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES, type FeedbackPriority, type FeedbackStatus } from "@/components/feedback/constants";
import type { FeedbackTriagePatch } from "@/components/feedback/schema";
import { Button, Dialog, FormField, Select, Textarea, useToast } from "@/components/ui";

export type AdminOption = { id: string; label: string };

type Props = {
  id: string;
  status: FeedbackStatus;
  priority: FeedbackPriority | null;
  assignee: string | null;
  adminNote: string | null;
  admins: AdminOption[];
};

type Values = { status: FeedbackStatus; priority: FeedbackPriority | ""; assignee: string; adminNote: string };

// Triagem de um feedback: status, prioridade, responsável (só admins) e nota interna.
// Só envia o que mudou; a RPC confere o papel de novo e grava a auditoria (feedback.triage).
export function FeedbackTriageDialog({ id, status, priority, assignee, adminNote, admins }: Props) {
  const t = useTranslations("adminOps.feedback");
  const ts = useTranslations("adminCommon.status");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const { toast } = useToast();
  const formId = useId();
  const initial: Values = { status, priority: priority ?? "", assignee: assignee ?? "", adminNote: adminNote ?? "" };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function buildPatch(): FeedbackTriagePatch {
    const patch: FeedbackTriagePatch = {};
    if (values.status !== initial.status) patch.status = values.status;
    if (values.priority !== initial.priority) patch.priority = values.priority === "" ? null : values.priority;
    if (values.assignee !== initial.assignee) patch.assignee = values.assignee === "" ? null : values.assignee;
    if (values.adminNote.trim() !== initial.adminNote.trim()) patch.admin_note = values.adminNote.trim() === "" ? null : values.adminNote.trim();
    return patch;
  }

  const dirty = Object.keys(buildPatch()).length > 0;

  function close() {
    setOpen(false);
    setValues(initial);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setError(t("triage.unchanged"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await triageFeedback({ id, patch });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: t("triage.saved"), variant: "success" });
      setOpen(false);
      setError(null);
      router.refresh();
    });
  }

  // Responsável antigo que perdeu o papel de admin continua visível na lista para não sumir sem aviso.
  const options = assignee && !admins.some((a) => a.id === assignee) ? [...admins, { id: assignee, label: `${assignee.slice(0, 8)}…` }] : admins;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" leadingIcon={<ClipboardList />} onClick={() => setOpen(true)}>
        {t("triage.button")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          if (next) setOpen(true);
          else close();
        }}
        title={t("triage.title")}
        description={t("triage.description")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form={formId} loading={pending} disabled={!dirty}>
              {t("triage.save")}
            </Button>
          </div>
        }
      >
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("triage.status")}>
              <Select value={values.status} disabled={pending} onChange={(e) => set("status", e.target.value as FeedbackStatus)}>
                {FEEDBACK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ts(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("triage.priority")}>
              <Select value={values.priority} disabled={pending} onChange={(e) => set("priority", e.target.value as FeedbackPriority | "")}>
                <option value="">{t("noPriority")}</option>
                {FEEDBACK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priorities.${p}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label={t("triage.assignee")} hint={t("triage.assigneeHint")}>
            <Select value={values.assignee} disabled={pending} onChange={(e) => set("assignee", e.target.value)}>
              <option value="">{t("unassigned")}</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("triage.note")} hint={t("triage.noteHint")} error={error ?? undefined}>
            <Textarea value={values.adminNote} maxLength={FEEDBACK_ADMIN_NOTE_MAX} rows={3} disabled={pending} onChange={(e) => set("adminNote", e.target.value)} />
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
