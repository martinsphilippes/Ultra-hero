"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Chip, FormField, IconButton, Input, Select, Textarea } from "@/components/ui";
import { RECIPE_LIMITS } from "@/lib/recipes/codes";
import { effectiveTotal, timesSum } from "@/lib/recipes/draft";
import { fieldIdForPath } from "@/lib/recipes/editor-steps";
import { RECIPE_DIFFICULTIES } from "@/lib/recipes/payload";
import { FieldError, StepSection, type StepProps } from "../shared";
import { YieldField } from "../YieldField";

type Props = StepProps & { categories: { code: string; label: string }[] };

const minutesProps = {
  inputMode: "numeric" as const,
  pattern: "[0-9]*",
  autoComplete: "off",
  placeholder: "0",
  trailingIcon: <span aria-hidden="true" className="type-caption">min</span>,
};
const digits = (v: string) => v.replace(/\D/g, "");
const SERVINGS_MAX = 100;

type StepperProps = { value: string; onChange: (v: string) => void; disabled?: boolean; lessLabel: string; moreLabel: string } & Record<string, unknown>;

// Porções com − e +: toque grande no celular; a caixa do meio aceita digitar (1–100).
function ServingsStepper({ value, onChange, disabled, lessLabel, moreLabel, ...field }: StepperProps) {
  const n = Number(value) || 0;
  const setN = (next: number) => onChange(String(Math.min(SERVINGS_MAX, Math.max(1, next))));
  return (
    <div className="flex items-center gap-2">
      <IconButton label={lessLabel} icon={<Minus />} variant="secondary" onClick={() => setN(n - 1)} disabled={disabled || n <= 1} data-testid="recipe-servings-less" />
      <Input
        {...field}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="2"
        className="w-20 text-center"
        value={value}
        maxLength={3}
        onChange={(e) => {
          const d = digits(e.target.value);
          onChange(d === "" ? "" : String(Math.min(SERVINGS_MAX, Number(d))));
        }}
        disabled={disabled}
        data-testid="recipe-servings"
      />
      <IconButton label={moreLabel} icon={<Plus />} variant="secondary" onClick={() => setN(n + 1)} disabled={disabled || n >= SERVINGS_MAX} data-testid="recipe-servings-more" />
    </div>
  );
}

// Etapa 1: título, descrição, história, categorias (até 3), dificuldade, rendimento, porções e
// tempos. O total acompanha preparo + cozimento + descanso até a pessoa digitar outro valor.
export function BasicsStep({ draft, setDraft, errorFor, disabled, categories }: Props) {
  const t = useTranslations("recipes.editor.basics");
  const tcat = useTranslations("catalog");
  const sum = timesSum(draft);
  const total = effectiveTotal(draft);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const duration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h === 0 ? t("minutes", { m }) : m === 0 ? t("hours", { h }) : t("hoursMinutes", { h, m });
  };
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
          <YieldField id={fieldIdForPath("details.yield_text")} value={draft.yieldText} onChange={(yieldText) => set({ yieldText })} error={errorFor("details.yield_text")} disabled={disabled} />
        </div>
      </StepSection>

      <StepSection>
        <FormField id={fieldIdForPath("details.servings")} label={t("servings")} hint={t("servingsHint")} error={errorFor("details.servings")} required>
          <ServingsStepper value={draft.servings} onChange={(servings) => set({ servings })} disabled={disabled} lessLabel={t("servingsLess")} moreLabel={t("servingsMore")} />
        </FormField>
      </StepSection>

      <StepSection title={t("timesTitle")}>
        <p className="-mt-2 type-caption text-fg-muted">{t("timesHint")}</p>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
          <FormField id={fieldIdForPath("details.prep_minutes")} label={t("prep")} hint={t("prepHint")} error={errorFor("details.prep_minutes")}>
            <Input {...minutesProps} value={draft.prep} maxLength={4} onChange={(e) => set({ prep: digits(e.target.value) })} disabled={disabled} data-testid="recipe-prep" />
          </FormField>
          <FormField id={fieldIdForPath("details.cook_minutes")} label={t("cook")} hint={t("cookHint")} error={errorFor("details.cook_minutes")}>
            <Input {...minutesProps} value={draft.cook} maxLength={4} onChange={(e) => set({ cook: digits(e.target.value) })} disabled={disabled} data-testid="recipe-cook" />
          </FormField>
          <FormField id={fieldIdForPath("details.rest_minutes")} label={t("rest")} hint={t("restHint")} error={errorFor("details.rest_minutes")}>
            <Input {...minutesProps} value={draft.rest} maxLength={4} onChange={(e) => set({ rest: digits(e.target.value) })} disabled={disabled} />
          </FormField>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField
            id={fieldIdForPath("details.total_minutes")}
            label={t("total")}
            hint={sum > 0 ? t("totalHint", { sum: duration(sum) }) : t("totalHintEmpty")}
            error={errorFor("details.total_minutes")}
            className="sm:w-80"
          >
            <Input
              {...minutesProps}
              value={draft.totalTouched ? draft.total : total === null ? "" : String(total)}
              maxLength={4}
              onChange={(e) => set({ total: digits(e.target.value), totalTouched: true })}
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
