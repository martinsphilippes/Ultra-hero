"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { RegisteredMedia } from "@/app/creator/recipes/actions";
import { Button, Checkbox, FormField, Input, Textarea } from "@/components/ui";
import { RECIPE_LIMITS } from "@/lib/recipes/codes";
import { emptyStep, isBlankIngredient, moveItem, type DraftStep } from "@/lib/recipes/draft";
import { fieldIdForPath } from "@/lib/recipes/editor-steps";
import { recipeMediaUrl } from "@/lib/recipes/media";
import { RecipeImageUploader } from "../RecipeImageUploader";
import { ItemControls, StepSection, type StepProps } from "../shared";

type Props = StepProps & {
  contentId: string;
  creatorId: string;
  uploadsEnabled: boolean;
  onMediaUploaded: (media: RegisteredMedia) => void;
  onDeleteMedia: (mediaId: string) => Promise<boolean>;
};

const numberProps = { inputMode: "numeric" as const, pattern: "[0-9-]*", autoComplete: "off" };

// Etapa 3: etapas numeradas com instrução, duração (min:s), temperatura, dica, foto da etapa (só
// para quem pode abrir a receita) e os ingredientes usados naquela etapa (Modo Cozinha).
export function PreparationStep({ draft, setDraft, errorFor, disabled, announce, contentId, creatorId, uploadsEnabled, onMediaUploaded, onDeleteMedia }: Props) {
  const t = useTranslations("recipes.editor.prep");
  const ti = useTranslations("recipes.editor.ingredients");
  const [focusId, setFocusId] = useState<string | null>(null);
  const ingredients = draft.ingredients.filter((i) => !isBlankIngredient(i));

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (index: number, patch: Partial<DraftStep>) => setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const label = (index: number) => t("step", { n: index + 1 });

  function move(from: number, to: number) {
    setDraft((d) => ({ ...d, steps: moveItem(d.steps, from, to) }));
    announce(ti("moved", { label: label(from), n: to + 1, total: draft.steps.length }));
    setFocusId(fieldIdForPath(`steps.${to}.instruction`));
  }

  function add() {
    const index = draft.steps.length;
    setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep()] }));
    setFocusId(fieldIdForPath(`steps.${index}.instruction`));
  }

  return (
    <div className="flex flex-col gap-4">
      {draft.steps.length === 0 && <p className="type-body-sm text-fg-muted">{t("empty")}</p>}
      <ol className="flex flex-col gap-4" aria-label={t("listLabel")} data-testid="step-list">
        {draft.steps.map((step, index) => {
          const base = `steps.${index}`;
          const image = step.imageMediaId ? draft.media.find((m) => m.id === step.imageMediaId) : undefined;
          return (
            <li key={step.id} data-testid="step-item">
              <StepSection title={label(index)}>
                <div className="flex items-start justify-between gap-2">
                  <FormField id={fieldIdForPath(`${base}.instruction`)} label={t("instruction")} error={errorFor(`${base}.instruction`)} className="min-w-0 flex-1" required>
                    <Textarea rows={3} value={step.instruction} maxLength={1200} onChange={(e) => update(index, { instruction: e.target.value })} disabled={disabled} data-testid="step-instruction" />
                  </FormField>
                  <div className="pt-7">
                    <ItemControls
                      index={index}
                      total={draft.steps.length}
                      label={label(index)}
                      onMove={(to) => move(index, to)}
                      onRemove={() => setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }))}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-semibold text-fg">{t("duration")}</legend>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField id={fieldIdForPath(`${base}.duration_seconds`)} label={t("minutes")} error={errorFor(`${base}.duration_seconds`)}>
                      <Input {...numberProps} value={step.minutes} maxLength={4} onChange={(e) => update(index, { minutes: e.target.value })} disabled={disabled} data-testid="step-minutes" />
                    </FormField>
                    <FormField id={fieldIdForPath(`${base}.seconds`)} label={t("seconds")}>
                      <Input {...numberProps} value={step.seconds} maxLength={2} onChange={(e) => update(index, { seconds: e.target.value })} disabled={disabled} />
                    </FormField>
                    <FormField id={fieldIdForPath(`${base}.temperature_c`)} label={t("temperature")} error={errorFor(`${base}.temperature_c`)}>
                      <Input {...numberProps} value={step.temperature} maxLength={4} onChange={(e) => update(index, { temperature: e.target.value })} disabled={disabled} />
                    </FormField>
                  </div>
                </fieldset>
                <FormField id={fieldIdForPath(`${base}.tip`)} label={t("tip")} error={errorFor(`${base}.tip`)}>
                  <Textarea rows={2} value={step.tip} maxLength={400} onChange={(e) => update(index, { tip: e.target.value })} disabled={disabled} />
                </FormField>

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-semibold text-fg">{t("stepIngredients")}</legend>
                  {ingredients.length === 0 ? (
                    <p className="type-caption text-fg-muted">{t("stepIngredientsEmpty")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4">
                      {ingredients.map((ing) => (
                        <Checkbox
                          key={ing.id}
                          id={`${step.id}-${ing.id}`}
                          checked={step.ingredientIds.includes(ing.id)}
                          onChange={(e) =>
                            update(index, { ingredientIds: e.target.checked ? [...step.ingredientIds, ing.id] : step.ingredientIds.filter((x) => x !== ing.id) })
                          }
                          label={ing.name || "—"}
                          disabled={disabled}
                        />
                      ))}
                    </div>
                  )}
                </fieldset>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-fg">{t("image")}</span>
                  {image ? (
                    <div className="flex items-center gap-3">
                      <div className="relative size-20 overflow-hidden rounded-lg border border-border">
                        <Image src={recipeMediaUrl(image.id)} alt={image.alt} fill unoptimized sizes="80px" className="object-cover" />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        leadingIcon={<Trash2 />}
                        disabled={disabled}
                        onClick={async () => {
                          if (await onDeleteMedia(image.id)) update(index, { imageMediaId: null });
                        }}
                      >
                        {t("imageNone")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="type-caption text-fg-muted">{t("imageHint")}</p>
                      <RecipeImageUploader
                        contentId={contentId}
                        creatorId={creatorId}
                        role="step"
                        askAlt
                        disabled={disabled || !uploadsEnabled || draft.media.length >= RECIPE_LIMITS.media}
                        onUploaded={(media) => {
                          onMediaUploaded(media);
                          update(index, { imageMediaId: media.id });
                        }}
                      />
                    </>
                  )}
                </div>
              </StepSection>
            </li>
          );
        })}
      </ol>
      <div>
        <Button type="button" variant="secondary" leadingIcon={<Plus />} onClick={add} disabled={disabled || draft.steps.length >= RECIPE_LIMITS.steps} data-testid="add-step">
          {t("add")}
        </Button>
      </div>
    </div>
  );
}
