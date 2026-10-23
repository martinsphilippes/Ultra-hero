"use client";

import { BellRing, Check, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteReminder, toggleReminder } from "@/app/(app)/profile/lembretes/actions";
import { Button, Dialog, EmptyState, useToast } from "@/components/ui";
import { rhythmCounter } from "@/lib/routine/today";
import { weekdaysLabel } from "@/lib/routine/reminders";
import { cn } from "@/lib/utils";
import { getDeviceTimeZone } from "@/lib/utils/timezone";
import { ItemMenu } from "./ItemMenu";
import { ReminderDialog, type ReminderView } from "./ReminderDialog";

export type ReminderListItem = ReminderView & { doneToday: boolean };

type Props = {
  /** Lembretes que valem hoje (dia da semana local), já ordenados. */
  today: ReminderListItem[];
  /** Lembretes de outros dias, já ordenados. */
  other: ReminderListItem[];
  /** Limite de lembretes ativos do banco (gatilho routine_limit). */
  max: number;
};

// Lista de lembretes (Q5): adicionar, editar, excluir com confirmação e marcar "feito hoje".
// O "feito" é otimista por id; a revalidação do servidor confirma. Nenhuma resposta fala de sequência (Q10).
export function RemindersList({ today, other, max }: Props) {
  const t = useTranslations("me.reminders");
  const locale = useLocale();
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReminderView | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ReminderView | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  const total = today.length + other.length;
  const atLimit = total >= max;
  const isDone = (item: ReminderListItem) => overrides.get(item.id) ?? item.doneToday;
  const counter = rhythmCounter(today.filter(isDone).length, today.length);

  async function onToggle(item: ReminderListItem) {
    const next = !isDone(item);
    setBusy(item.id);
    try {
      const result = await toggleReminder({ itemId: item.id, done: next, timezone: getDeviceTimeZone() });
      if (!result.ok) {
        toast({ title: t(`errors.${result.error}`), variant: "error" });
        return;
      }
      setOverrides((prev) => new Map(prev).set(item.id, result.done));
      toast({ title: result.done ? t("toasts.checked") : t("toasts.unchecked"), variant: result.done ? "success" : "default" });
    } finally {
      setBusy(null);
    }
  }

  function onConfirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startDelete(async () => {
      const result = await deleteReminder({ itemId: target.id });
      if (!result.ok) {
        toast({ title: t(`errors.${result.error}`), variant: "error" });
        return;
      }
      setDeleting(null);
      toast({ title: t("toasts.deleted"), variant: "success" });
    });
  }

  const addButton = (
    <Button variant="primary" size="sm" leadingIcon={<Plus />} onClick={() => setCreating(true)} disabled={atLimit} data-testid="reminder-add">
      {t("add")}
    </Button>
  );

  const meta = (item: ReminderView) => {
    const days = weekdaysLabel(item.weekdays, locale) ?? t("allDays");
    return item.time ? `${item.time} · ${days}` : days;
  };

  const row = (item: ReminderListItem, checkable: boolean) => {
    const done = checkable && isDone(item);
    return (
      <li key={item.id} className="flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4" data-testid="reminder-item" data-reminder-title={item.title}>
        {checkable ? (
          <button
            type="button"
            aria-pressed={done}
            aria-label={`${done ? t("markUndone") : t("markDone")}: ${item.title}`}
            aria-busy={busy === item.id || undefined}
            disabled={busy === item.id}
            onClick={() => onToggle(item)}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-55",
              done ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-transparent hover:border-accent",
            )}
          >
            <Check className="size-5" strokeWidth={3} aria-hidden="true" />
          </button>
        ) : (
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-fg-muted">
            <BellRing className="size-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("line-clamp-2 text-sm font-semibold", done ? "text-fg-muted line-through" : "text-fg")}>{item.title}</span>
          <span className="type-caption text-fg-muted">
            <span className="font-mono type-numeric">{meta(item)}</span>
            {done ? <span className="sr-only"> · {t("doneToday")}</span> : null}
          </span>
          {item.note ? <span className="line-clamp-2 type-caption text-fg-muted">{item.note}</span> : null}
        </div>
        <ItemMenu label={t("itemMenu", { title: item.title })} editLabel={t("edit")} deleteLabel={t("delete")} onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6" data-testid="reminders">
      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60" data-testid="reminders-empty">
          <EmptyState
            icon={<BellRing />}
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <Button variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)} data-testid="reminder-add">
                {t("empty.cta")}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="type-caption text-fg-muted">{atLimit ? t("limitReached", { max }) : t("count", { n: total, max })}</p>
            {addButton}
          </div>

          <section aria-labelledby="reminders-today-title" className="flex flex-col gap-3" data-testid="reminders-today">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="reminders-today-title" className="type-h3 text-fg">
                {t("todayTitle")}
              </h2>
              {today.length > 0 ? (
                <p className="type-caption text-fg-muted" aria-live="polite" aria-atomic="true">
                  <span className="font-mono type-numeric text-sm font-semibold text-fg" aria-hidden="true">
                    {counter.label}
                  </span>
                  <span className="sr-only">{t("counter", { done: counter.done, total: counter.total })}</span>
                </p>
              ) : null}
            </div>
            {today.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-4 type-body-sm text-fg-muted">{t("noneToday")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">{today.map((item) => row(item, true))}</ul>
            )}
          </section>

          {other.length > 0 ? (
            <section aria-labelledby="reminders-other-title" className="flex flex-col gap-3" data-testid="reminders-other">
              <div className="flex flex-col gap-0.5">
                <h2 id="reminders-other-title" className="type-h3 text-fg">
                  {t("otherTitle")}
                </h2>
                <p className="type-caption text-fg-muted">{t("otherDescription")}</p>
              </div>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">{other.map((item) => row(item, false))}</ul>
            </section>
          ) : null}
        </>
      )}

      <ReminderDialog
        open={creating || editing !== null}
        item={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !pendingDelete) setDeleting(null);
        }}
        title={t("deleteTitle")}
        description={deleting ? t("deleteDescription", { title: deleting.title }) : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={pendingDelete}>
              {t("form.cancel")}
            </Button>
            <Button variant="danger" onClick={onConfirmDelete} loading={pendingDelete}>
              {t("deleteConfirm")}
            </Button>
          </>
        }
      />
    </div>
  );
}
