"use client";

import { Dumbbell, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge, Button, Checkbox, ProgressBar } from "@/components/ui";
import type { WorkoutBody as Workout } from "./body-types";

// Treino: equipamento, blocos → exercícios com checkbox local (não persiste; conclusão é manual).
export function WorkoutBody({ workout }: { workout: Workout }) {
  const t = useTranslations("consume.body.workout");
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const total = useMemo(() => workout.blocks.reduce((sum, b) => sum + b.exercises.length, 0), [workout.blocks]);

  function toggle(key: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="workout-equipment" className="flex flex-col gap-2">
        <h2 id="workout-equipment" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Dumbbell className="size-4 text-accent-text" aria-hidden="true" />
          {t("equipment")}
        </h2>
        {workout.equipment.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {workout.equipment.map((e) => (
              <li key={e}>
                <Badge variant="neutral">{e}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-fg-muted">{t("noEquipment")}</p>
        )}
      </section>

      {total > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <ProgressBar value={done.size} max={total} label={t("progress", { done: done.size, total })} tone="training" showValue />
          <div className="flex items-center justify-between gap-3">
            <p className="type-caption text-fg-muted" aria-live="polite">
              {t("progress", { done: done.size, total })}
            </p>
            {done.size > 0 && (
              <Button variant="link" size="sm" onClick={() => setDone(new Set())}>
                {t("resetChecks")}
              </Button>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="workout-blocks" className="flex flex-col gap-5">
        <h2 id="workout-blocks" className="type-h3 text-fg">
          {t("blocks")}
        </h2>
        {workout.blocks.map((block, bi) => (
          <div key={`${block.name}-${bi}`} className="flex flex-col gap-2">
            <h3 className="type-overline text-accent-text">{block.name}</h3>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {block.exercises.map((ex, ei) => {
                const key = `${bi}-${ei}`;
                const checked = done.has(key);
                const details = [
                  ex.sets !== null ? t("sets", { n: ex.sets }) : null,
                  ex.reps ? t("reps", { reps: ex.reps }) : null,
                  ex.restSeconds !== null ? (ex.restSeconds > 0 ? t("rest", { seconds: ex.restSeconds }) : t("noRest")) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={key} className="px-3">
                    <Checkbox
                      id={`exercise-${key}`}
                      checked={checked}
                      onChange={() => toggle(key)}
                      aria-label={t("checkLabel", { name: ex.name })}
                      label={<span className={checked ? "text-fg-muted line-through" : undefined}>{ex.name}</span>}
                      description={details || undefined}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {workout.safetyNote && (
        <aside role="note" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="type-body-sm text-fg">
            <span className="font-semibold">{t("safetyNote")}: </span>
            {workout.safetyNote}
          </p>
        </aside>
      )}
    </div>
  );
}
