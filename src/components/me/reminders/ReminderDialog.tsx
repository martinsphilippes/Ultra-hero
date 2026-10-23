"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { createReminder, updateReminder } from "@/app/(app)/profile/lembretes/actions";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { REMINDER_NOTE_MAX, REMINDER_TITLE_MAX } from "@/lib/routine/reminders";
import { cn } from "@/lib/utils";

export type ReminderView = {
  id: string;
  title: string;
  note: string | null;
  /** "HH:MM" ou null. */
  time: string | null;
  /** 0 = domingo … 6 = sábado; null = todos os dias. */
  weekdays: number[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lembrete em edição; null = novo. */
  item: ReminderView | null;
};

// Segunda a domingo, como num calendário brasileiro; o valor continua 0 = domingo.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Formulário do lembrete: título, nota, horário e dias da semana (todos marcados por padrão).
// O servidor valida de novo (mesmo esquema) e o banco tem os checks da 0022.
export function ReminderDialog({ open, onOpenChange, item }: Props) {
  const t = useTranslations("me.reminders");
  const tc = useTranslations("common.a11y");
  const { toast } = useToast();
  const legendId = useId();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("");
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Recarrega os campos ao abrir (novo ou edição).
  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setNote(item?.note ?? "");
    setTime(item?.time ?? "");
    setDays(item?.weekdays ?? ALL_DAYS);
    setError(null);
  }, [open, item]);

  const allDays = days.length === 7;

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length === 0 || days.length === 0) {
      setError(t("errors.invalid"));
      return;
    }
    setError(null);
    const input = { title: title.trim(), note: note.trim() || null, timeOfDay: time || null, weekdays: allDays ? null : days };
    startTransition(async () => {
      const result = item ? await updateReminder({ itemId: item.id, ...input }) : await createReminder(input);
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      toast({ title: item ? t("toasts.updated") : t("toasts.created"), variant: "success" });
      onOpenChange(false);
    });
  }

  const formId = `${legendId}-form`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
      title={item ? t("editTitle") : t("addTitle")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("form.cancel")}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {t("form.save")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4 py-1" noValidate data-testid="reminder-form">
        <FormField label={t("form.title")} required error={error ?? undefined}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={REMINDER_TITLE_MAX} placeholder={t("form.titlePlaceholder")} autoComplete="off" disabled={pending} data-autofocus />
        </FormField>
        <FormField label={t("form.note")} optionalLabel={tc("optional")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={REMINDER_NOTE_MAX} placeholder={t("form.notePlaceholder")} autoComplete="off" disabled={pending} />
        </FormField>
        <FormField label={t("form.time")} optionalLabel={tc("optional")} hint={t("form.timeHint")}>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={pending} className="max-w-40" />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend id={legendId} className="flex items-baseline gap-2 text-sm font-semibold text-fg">
            {t("form.weekdays")}
            <span className="type-caption font-normal text-fg-muted">{allDays ? t("form.allDays") : null}</span>
          </legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={legendId}>
            {DAY_ORDER.map((day) => {
              const selected = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected}
                  aria-label={t(`form.dayLong.${day}`)}
                  disabled={pending}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full border font-mono text-sm font-semibold transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-55",
                    selected ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg-muted hover:bg-surface-hover",
                  )}
                >
                  <span aria-hidden="true">{t(`form.dayShort.${day}`)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
