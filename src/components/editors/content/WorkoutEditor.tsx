"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button, FormField, IconButton, Input, Textarea } from "@/components/ui";
import { ChipInput, useValidationMessage } from "./fields";
import type { FieldErrors, WorkoutBody } from "./schema";

type Props = { value: WorkoutBody; onChange: (value: WorkoutBody) => void; errors: FieldErrors };
type Block = WorkoutBody["blocks"][number];
type Exercise = Block["exercises"][number];

const COMMON_EQUIPMENT = ["peso do corpo", "halteres", "elástico", "colchonete", "barra", "kettlebell"];

// Corpo de treino: equipamento, blocos → exercícios (séries, repetições, descanso) e nota de segurança.
export function WorkoutEditor({ value, onChange, errors }: Props) {
  const t = useTranslations("editors.body.workout");
  const tv = useValidationMessage();
  const baseId = useId();

  function setBlock(index: number, patch: Partial<Block>) {
    onChange({ ...value, blocks: value.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  }
  function setExercise(blockIndex: number, exIndex: number, patch: Partial<Exercise>) {
    const block = value.blocks[blockIndex];
    setBlock(blockIndex, { exercises: block.exercises.map((ex, i) => (i === exIndex ? { ...ex, ...patch } : ex)) });
  }
  function toInt(raw: string): number | null {
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }

  return (
    <div className="flex flex-col gap-5">
      <ChipInput label={t("equipment")} hint={t("equipmentHint")} values={value.equipment} onChange={(equipment) => onChange({ ...value, equipment })} error={tv(errors["body.equipment"])} max={20} maxLength={40} suggestions={COMMON_EQUIPMENT} />

      <div className="flex flex-col gap-3" role="group" aria-labelledby={`${baseId}-blocks`}>
        <span id={`${baseId}-blocks`} className="text-sm font-semibold text-fg">
          {t("blocks")}
        </span>
        <p className="type-caption text-fg-muted">{t("blocksHint")}</p>
        {tv(errors["body.blocks"]) && (
          <p role="alert" className="type-caption font-medium text-danger">
            {tv(errors["body.blocks"])}
          </p>
        )}
        {value.blocks.map((block, bi) => {
          const nameError = tv(errors[`body.blocks.${bi}.name`]);
          const id = `${baseId}-block-${bi}`;
          return (
            <section key={bi} aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h4 id={`${id}-title`} className="sr-only">
                    {t("blockN", { n: bi + 1 })}
                  </h4>
                  <Input aria-label={t("blockName", { n: bi + 1 })} aria-invalid={nameError ? true : undefined} maxLength={80} placeholder={t("blockPlaceholder")} value={block.name} onChange={(e) => setBlock(bi, { name: e.target.value })} />
                  {nameError && (
                    <p role="alert" className="type-caption font-medium text-danger">
                      {nameError}
                    </p>
                  )}
                </div>
                <IconButton label={t("removeBlock", { n: bi + 1 })} icon={<Trash2 />} onClick={() => onChange({ ...value, blocks: value.blocks.filter((_, i) => i !== bi) })} />
              </div>

              {block.exercises.length === 0 && <p className="type-caption text-fg-subtle">{t("exercisesEmpty")}</p>}
              <ul className="flex flex-col gap-2">
                {block.exercises.map((ex, ei) => {
                  const p = `body.blocks.${bi}.exercises.${ei}`;
                  const exError = tv(errors[`${p}.name`]) ?? tv(errors[`${p}.sets`]) ?? tv(errors[`${p}.reps`]) ?? tv(errors[`${p}.rest_seconds`]);
                  return (
                    <li key={ei} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_80px_110px_110px_auto]">
                        <Input className="col-span-1" aria-label={t("exerciseName", { n: ei + 1 })} aria-invalid={errors[`${p}.name`] ? true : undefined} maxLength={120} placeholder={t("exercisePlaceholder")} value={ex.name} onChange={(e) => setExercise(bi, ei, { name: e.target.value })} />
                        <IconButton label={t("removeExercise", { n: ei + 1 })} icon={<X />} className="sm:order-last" onClick={() => setBlock(bi, { exercises: block.exercises.filter((_, i) => i !== ei) })} />
                        <Input type="number" inputMode="numeric" min={1} max={20} aria-label={t("sets", { n: ei + 1 })} aria-invalid={errors[`${p}.sets`] ? true : undefined} placeholder={t("setsShort")} value={ex.sets ?? ""} onChange={(e) => setExercise(bi, ei, { sets: toInt(e.target.value) })} />
                        <Input aria-label={t("reps", { n: ei + 1 })} aria-invalid={errors[`${p}.reps`] ? true : undefined} maxLength={40} placeholder={t("repsShort")} value={ex.reps} onChange={(e) => setExercise(bi, ei, { reps: e.target.value })} />
                        <Input type="number" inputMode="numeric" min={0} max={600} aria-label={t("rest", { n: ei + 1 })} aria-invalid={errors[`${p}.rest_seconds`] ? true : undefined} placeholder={t("restShort")} value={ex.rest_seconds ?? ""} onChange={(e) => setExercise(bi, ei, { rest_seconds: toInt(e.target.value) })} />
                      </div>
                      {exError && (
                        <p role="alert" className="type-caption font-medium text-danger">
                          {exError}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div>
                <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} disabled={block.exercises.length >= 30} onClick={() => setBlock(bi, { exercises: [...block.exercises, { name: "", sets: 3, reps: "", rest_seconds: 45 }] })}>
                  {t("addExercise")}
                </Button>
              </div>
            </section>
          );
        })}
        <div>
          <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} disabled={value.blocks.length >= 12} onClick={() => onChange({ ...value, blocks: [...value.blocks, { name: "", exercises: [] }] })}>
            {t("addBlock")}
          </Button>
        </div>
      </div>

      <FormField label={t("safetyNote")} hint={t("safetyNoteHint")} error={tv(errors["body.safety_note"])}>
        <Textarea rows={3} maxLength={600} value={value.safety_note} onChange={(e) => onChange({ ...value, safety_note: e.target.value })} />
      </FormField>
    </div>
  );
}
