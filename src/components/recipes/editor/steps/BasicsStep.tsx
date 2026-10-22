"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Chip, FormField, Input, Select, Textarea } from "@/components/ui";
import { RECIPE_LIMITS } from "@/lib/recipes/codes";
import { effectiveTotal, timesSum } from "@/lib/recipes/draft";
import { fieldIdForPath } from "@/lib/recipes/editor-steps";
import { RECIPE_DIFFICULTIES } from "@/lib/recipes/payload";
import { FieldError, StepSection, type StepProps } from "../shared";

type Props = StepProps & { categories: { code: string; label: string }[] };

const numberProps = { inputMode: "numeric" as const, pattern: "[0-9]*", autoComplete: "off" };

// Etapa 1: título, descrição, história, categorias (até 3), dificuldade, rendimento, porções e
// tempos. O total acompanha preparo + cozimento + descanso até a pessoa digitar outro valor.
export function BasicsStep({ draft, setDraft, errorFor, disabled, categories }: Props) {
  const t = useTranslations("recipes.editor.basics");
  const tcat = useTranslations("catalog");
  const sum = timesSum(draft);
  const total = effectiveTotal(draft);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleCategory = (code: string) =>
    setDraft((d) => {
      if (d.categories.includes(code)) return { ...d, categories: d.categories.filter((c) => c !== code) };
      if (d.categories.length >= RECIPE_LIMITS.categories) return d;
      return { ...d, categories: [...d.categories, code] };
    });
  const catId = fieldIdForPath("categories");

  return (
    <div className="flex flex-col gap-5">
      <StepSection>
        <FormField id={fieldIdForPath("content.title")} label={t("title")} hint={t("titleHint")} error={errorFor("content.title")} required>
          <Input value={draft.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} disabled={disabled} data-testid="recipe-title" />
        </FormField>
        <FormField id={fieldIdForPath("content.summary")} label={t("summary")} hint={t("summaryHint")} error={errorFor("content.summary")}>
          <Textarea rows={2} value={draft.summary} maxLength={600} onChange={(e) => set({ summary: e.target.value })} disabled={disabled} data-testid="recipe-summary" />
        </FormField>
        <FormField id={fieldIdForPath("details.story")} label={t("story")} hint={t("storyHint")} error={errorFor("details.story")}>
          <Textarea rows={4} value={draft.story} maxLength={4000} onChange={(e) => set({ story: e.target.value })} disabled={disabled} />
        </FormField>
      </StepSection>

      <StepSection>
        <div role="group" aria-labelledby={`${catId}-label`} aria-describedby={`${catId}-hint`} className="flex flex-col gap-2">
          <span id={`${catId}-label`} className="text-sm font-semibold text-fg">
            {t("categories")}
          </span>
          <p id={`${catId}-hint`} className="type-caption text-fg-muted">
            {t("categoriesHint")}
          </p>
          <div id={catId} tabIndex={-1} className="flex flex-wrap gap-2 outline-none">
            {categories.map((c) => {
              const selected = draft.categories.includes(c.code);
              return (
                <Chip
                  key={c.code}
                  selected={selected}
                  icon={selected ? <Check /> : undefined}
                  onClick={() => toggleCategory(c.code)}
                  disabled={disabled || (!selected && draft.categories.length >= RECIPE_LIMITS.categories)}
                  className="min-h-11"
                  data-testid={`recipe-category-${c.code}`}
                >
                  {c.label}
                </Chip>
              );
            })}
          </div>
          <FieldError id={catId} message={errorFor("categories")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={fieldIdForPath("content.difficulty")} label={t("difficulty")} error={errorFor("content.difficulty")}>
            <Select value={draft.difficulty} onChange={(e) => set({ difficulty: e.target.value as typeof draft.difficulty })} disabled={disabled}>
              <option value="">{t("difficultyNone")}</option>
              {RECIPE_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {tcat(`difficulty.${d}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id={fieldIdForPath("details.yield_text")} label={t("yield")} hint={t("yieldHint")} error={errorFor("details.yield_text")}>
            <Input value={draft.yieldText} maxLength={60} onChange={(e) => set({ yieldText: e.target.value })} disabled={disabled} />
          </FormField>
        </div>
      </StepSection>

      <StepSection>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField id={fieldIdForPath("details.servings")} label={t("servings")} error={errorFor("details.servings")}>
            <Input {...numberProps} value={draft.servings} maxLength={3} onChange={(e) => set({ servings: e.target.value })} disabled={disabled} data-testid="recipe-servings" />
          </FormField>
          <FormField id={fieldIdForPath("details.prep_minutes")} label={t("prep")} error={errorFor("details.prep_minutes")}>
            <Input {...numberProps} value={draft.prep} maxLength={4} onChange={(e) => set({ prep: e.target.value })} disabled={disabled} data-testid="recipe-prep" />
          </FormField>
          <FormField id={fieldIdForPath("details.cook_minutes")} label={t("cook")} error={errorFor("details.cook_minutes")}>
            <Input {...numberProps} value={draft.cook} maxLength={4} onChange={(e) => set({ cook: e.target.value })} disabled={disabled} data-testid="recipe-cook" />
          </FormField>
          <FormField id={fieldIdForPath("details.rest_minutes")} label={t("rest")} error={errorFor("details.rest_minutes")}>
            <Input {...numberProps} value={draft.rest} maxLength={4} onChange={(e) => set({ rest: e.target.value })} disabled={disabled} />
          </FormField>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField id={fieldIdForPath("details.total_minutes")} label={t("total")} hint={t("totalHint", { sum })} error={errorFor("details.total_minutes")} className="sm:w-64">
            <Input
              {...numberProps}
              value={draft.totalTouched ? draft.total : total === null ? "" : String(total)}
              maxLength={4}
              onChange={(e) => set({ total: e.target.value, totalTouched: true })}
              disabled={disabled}
              data-testid="recipe-total"
            />
          </FormField>
          {draft.totalTouched && (
            <Button type="button" variant="ghost" onClick={() => set({ totalTouched: false, total: "" })} disabled={disabled}>
              {t("totalAuto")}
            </Button>
          )}
        </div>
        {total !== null && !Number.isNaN(total) && total < sum ? (
          <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 type-body-sm text-fg">
            {t("timesWarning", { sum })}
          </p>
        ) : null}
      </StepSection>
    </div>
  );
}
