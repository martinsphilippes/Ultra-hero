"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { createRoutineItem, updateRoutineItem } from "@/app/(app)/profile/today-actions";
import { Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { RhythmItem } from "./RhythmBlock";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Item em edição; null = novo. */
  item: RhythmItem | null;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// Formulário de item manual: título, nota, horário e dias da semana (todos marcados por padrão).
export function RoutineItemDialog({ open, onOpenChange, item }: Props) {
  const t = useTranslations("me.today.rhythm");
  const tc = useTranslations("common.a11y");
  const { toast } = useToast();
  const legendId = useId();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("");
  const [days, setDays] = useState<number[]>([...ALL_DAYS]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Recarrega os campos ao abrir (novo ou edição).
  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setNote(item?.note ?? "");
    setTime(item?.time ?? "");
    setDays(item?.weekdays ?? [...ALL_DAYS]);
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
      const result = item ? await updateRoutineItem({ itemId: item.id, ...input }) : await createRoutineItem(input);
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.failed"));
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
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4 py-1" noValidate>
        <FormField label={t("form.title")} required error={error ?? undefined}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t("form.titlePlaceholder")} autoComplete="off" disabled={pending} data-autofocus />
        </FormField>
        <FormField label={t("form.note")} optionalLabel={tc("optional")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={t("form.notePlaceholder")} autoComplete="off" disabled={pending} />
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
            {ALL_DAYS.map((day) => {
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
