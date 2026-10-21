"use client";

import { Check, CircleCheck, Compass, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { completeContent } from "@/app/(app)/content/actions";
import { deleteRoutineItem, toggleRoutineItem } from "@/app/(app)/profile/today-actions";
import { useActionError, useCompletionFeedback } from "@/components/library/useCompletionFeedback";
import { Badge, Button, Dialog, EmptyState, useToast } from "@/components/ui";
import type { ProgramSuggestion } from "@/lib/routine/today";
import { rhythmCounter } from "@/lib/routine/today";
import { cn } from "@/lib/utils";
import { getDeviceTimeZone } from "@/lib/utils/timezone";
import { ItemMenu } from "./ItemMenu";
import { RoutineItemDialog } from "./RoutineItemDialog";

export type RhythmItem = {
  id: string;
  title: string;
  note: string | null;
  /** "HH:MM" ou null. */
  time: string | null;
  weekdays: number[] | null;
  done: boolean;
};

type Props = { suggestions: ProgramSuggestion[]; items: RhythmItem[] };

const PLACEHOLDER_COVER = "/placeholders/cover-routine-1.svg";

// Ritmo de hoje: sugestões dos programas (completeContent) + itens manuais (routine_check).
// O estado "feito" é otimista por id; a revalidação do servidor confirma na sequência.
export function RhythmBlock({ suggestions, items }: Props) {
  const t = useTranslations("me.today.rhythm");
  const { toast } = useToast();
  const announce = useCompletionFeedback();
  const contentError = useActionError();
  const [doneSuggestions, setDoneSuggestions] = useState<Set<string>>(() => new Set());
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<RhythmItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RhythmItem | null>(null);
  const [pendingDelete, startDelete] = useTransition();

  const isDone = (item: RhythmItem) => overrides.get(item.id) ?? item.done;
  const counter = rhythmCounter(suggestions.filter((s) => doneSuggestions.has(s.contentId)).length + items.filter(isDone).length, suggestions.length + items.length);

  const errorMessage = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.failed"));

  async function onCompleteSuggestion(suggestion: ProgramSuggestion) {
    setBusy(suggestion.contentId);
    try {
      const result = await completeContent({ contentId: suggestion.contentId, timezone: getDeviceTimeZone() });
      if (!result.ok) {
        toast({ title: contentError(result.error), variant: "error" });
        return;
      }
      setDoneSuggestions((prev) => new Set(prev).add(suggestion.contentId));
      announce(result.feedback);
    } finally {
      setBusy(null);
    }
  }

  async function onToggleItem(item: RhythmItem) {
    const next = !isDone(item);
    setBusy(item.id);
    try {
      const result = await toggleRoutineItem({ itemId: item.id, done: next, timezone: getDeviceTimeZone() });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      setOverrides((prev) => new Map(prev).set(item.id, result.check.done));
      toast({
        title: result.check.done ? t("toasts.checked") : t("toasts.unchecked"),
        description: t("toasts.streak", { n: result.check.streak }),
        variant: result.check.done ? "success" : "default",
      });
    } finally {
      setBusy(null);
    }
  }

  function onConfirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startDelete(async () => {
      const result = await deleteRoutineItem({ itemId: target.id });
      if (!result.ok) {
        toast({ title: errorMessage(result.error), variant: "error" });
        return;
      }
      setDeleting(null);
      toast({ title: t("toasts.deleted"), variant: "success" });
    });
  }

  const empty = suggestions.length === 0 && items.length === 0;

  return (
    <section aria-labelledby="rhythm-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 id="rhythm-title" className="type-h3 text-fg">
            {t("title")}
          </h3>
          <p className="type-caption text-fg-muted" aria-live="polite" aria-atomic="true">
            <span className="font-mono type-numeric text-sm font-semibold text-fg" aria-hidden="true">
              {counter.label}
            </span>
            <span className="sr-only">{t("counter", { done: counter.done, total: counter.total })}</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
          {t("add")}
        </Button>
      </div>

      {empty ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/60">
          <EmptyState
            size="sm"
            icon={<Compass />}
            title={t("empty")}
            description={t("emptyDescription")}
            action={
              <>
                <Button asChild variant="primary" size="sm">
                  <Link href="/explore?tab=programas">{t("emptyProgramCta")}</Link>
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
                  {t("add")}
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="rhythm-list">
          {suggestions.map((suggestion) => {
            const done = doneSuggestions.has(suggestion.contentId);
            return (
              <li key={suggestion.contentId} className="flex min-h-16 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="relative mt-0.5 h-10 w-14 shrink-0 overflow-hidden rounded-md bg-surface-elevated">
                    <Image src={suggestion.coverUrl ?? PLACEHOLDER_COVER} alt="" fill unoptimized sizes="56px" className="object-cover" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/content/${suggestion.contentSlug}`}
                      aria-label={t("openContent", { title: suggestion.title })}
                      className={cn("line-clamp-2 text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", done ? "text-fg-muted line-through" : "text-fg")}
                    >
                      {suggestion.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-fg-muted">
                      {suggestion.creatorName ? <span>{t("byHero", { name: suggestion.creatorName })}</span> : null}
                      <Badge variant="info" size="sm" className="h-auto whitespace-normal py-0.5 text-left">
                        {t("fromProgram", { name: suggestion.programName })}
                      </Badge>
                    </span>
                  </div>
                </div>
                {done ? (
                  <Badge variant="success" icon={<CircleCheck />} role="status" className="self-start sm:self-auto">
                    {t("done")}
                  </Badge>
                ) : (
                  <Button variant="secondary" size="sm" leadingIcon={<CircleCheck />} loading={busy === suggestion.contentId} onClick={() => onCompleteSuggestion(suggestion)} className="self-end sm:self-auto">
                    {t("markDone")}
                  </Button>
                )}
              </li>
            );
          })}
          {items.map((item) => {
            const done = isDone(item);
            return (
              <li key={item.id} className="flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4">
                <button
                  type="button"
                  aria-pressed={done}
                  aria-label={`${done ? t("markUndone") : t("markDone")}: ${item.title}`}
                  aria-busy={busy === item.id || undefined}
                  disabled={busy === item.id}
                  onClick={() => onToggleItem(item)}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-55",
                    done ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-transparent hover:border-accent",
                  )}
                >
                  <Check className="size-5" strokeWidth={3} aria-hidden="true" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    {item.time ? <span className="font-mono type-numeric text-xs font-medium text-accent-text">{item.time}</span> : null}
                    <span className={cn("line-clamp-1 text-sm font-semibold", done ? "text-fg-muted line-through" : "text-fg")}>{item.title}</span>
                  </span>
                  {item.note ? <span className="line-clamp-2 type-caption text-fg-muted">{item.note}</span> : null}
                </div>
                <ItemMenu label={t("itemMenu", { title: item.title })} editLabel={t("edit")} deleteLabel={t("delete")} onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />
              </li>
            );
          })}
        </ul>
      )}

      <RoutineItemDialog
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
    </section>
  );
}
