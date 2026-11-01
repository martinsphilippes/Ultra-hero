"use client";

import { Dumbbell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toggleStepAction } from "@/app/(app)/content/block-actions";
import { Checkbox, ProgressBar } from "@/components/ui";

type Props = { contentId: string; description: string; steps: string[]; initialChecked: number[] };

// Passos do treino de um post (0075): cada pessoa marca os seus; a marcação fica no banco e volta
// quando a pessoa reabre o post. Otimista: a caixa muda na hora e volta se o servidor recusar.
export function StepChecklist({ contentId, description, steps, initialChecked }: Props) {
  const t = useTranslations("consume.blocks.workout");
  const [checked, setChecked] = useState<Set<number>>(() => new Set(initialChecked.filter((i) => i >= 0 && i < steps.length)));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(index: number) {
    const done = !checked.has(index);
    setError(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (done) next.add(index);
      else next.delete(index);
      return next;
    });
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof toggleStepAction>>;
      try {
        result = await toggleStepAction({ contentId, step: index, done });
      } catch {
        result = { ok: false, error: "generic" };
      }
      if (!result.ok) {
        setChecked((prev) => {
          const next = new Set(prev);
          if (done) next.delete(index);
          else next.add(index);
          return next;
        });
        setError(t(`errors.${result.error === "unauthenticated" || result.error === "forbidden" ? result.error : "generic"}`));
      }
    });
  }

  const done = checked.size;
  const total = steps.length;
  return (
    <section aria-labelledby="post-workout" className="flex flex-col gap-3" data-testid="post-block-workout">
      <h2 id="post-workout" className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Dumbbell className="size-4 text-accent-text" aria-hidden="true" />
        {t("title")}
      </h2>
      {description ? <p className="type-body-sm whitespace-pre-line text-fg">{description}</p> : null}
      <div className="flex flex-col gap-1">
        <ProgressBar value={total === 0 ? 0 : (done / total) * 100} label={t("progress", { done, total })} />
        <p className="type-caption text-fg-muted" aria-live="polite">
          {done === total && total > 0 ? t("allDone") : t("progress", { done, total })}
        </p>
      </div>
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <li key={index} className="rounded-xl border border-border bg-surface px-3">
            <Checkbox checked={checked.has(index)} onChange={() => toggle(index)} label={<span className={checked.has(index) ? "text-fg-muted line-through" : "text-fg"}>{step}</span>} data-testid="post-step" />
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
