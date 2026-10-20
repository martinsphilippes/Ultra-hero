"use client";

import { Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Button, FormField, IconButton, Input, Switch, Textarea } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { ChipInput, ListEditor, NumberField, useValidationMessage } from "./fields";
import { NUTRIENT_KEYS, emptyNutrition, nutritionHasValues, type FieldErrors, type NutrientKey, type RecipeBody, type RecipeNutrition } from "./schema";

type Props = {
  value: RecipeBody;
  onChange: (value: RecipeBody) => void;
  errors: FieldErrors;
  /** Só o admin marca a nutrição como validada (a action da personalidade zera a marcação). */
  canValidate?: boolean;
};

const COMMON_ALLERGENS = ["glúten", "leite", "ovo", "amendoim", "castanhas", "soja", "peixe", "frutos do mar"];
const NUTRIENT_STEP: Record<NutrientKey, number> = { kcal: 1, protein_g: 0.1, carbs_g: 0.1, fat_g: 0.1, fiber_g: 0.1, sodium_mg: 1 };

// Corpo de receita: porções, tempos, ingredientes (item + quantidade), passos, alérgenos, observação
// e informação nutricional por porção (RF-006): números livres; validação só pelo admin (RB-08).
export function RecipeEditor({ value, onChange, errors, canValidate = false }: Props) {
  const t = useTranslations("editors.body.recipe");
  const tv = useValidationMessage();
  const locale = useLocale() as Locale;
  const baseId = useId();
  const nutrition = value.nutrition ?? emptyNutrition();

  function setIngredient(index: number, patch: Partial<RecipeBody["ingredients"][number]>) {
    onChange({ ...value, ingredients: value.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }
  function setNutrition(patch: Partial<RecipeNutrition>) {
    onChange({ ...value, nutrition: { ...nutrition, ...patch } });
  }
  function setNutrient(key: NutrientKey, n: number | null) {
    setNutrition({ per_serving: { ...nutrition.per_serving, [key]: n } });
  }

  const validatedLabel =
    nutrition.validated && nutrition.validated_by && nutrition.validated_at
      ? t("nutrition.validatedBadge", { by: nutrition.validated_by, date: formatPlainDate(nutrition.validated_at, locale) })
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField label={t("servings")} value={value.servings} onChange={(servings) => onChange({ ...value, servings })} min={1} max={100} error={tv(errors["body.servings"])} />
        <NumberField label={t("prepMinutes")} value={value.prep_minutes} onChange={(prep_minutes) => onChange({ ...value, prep_minutes })} min={0} max={1440} error={tv(errors["body.prep_minutes"])} />
        <NumberField label={t("cookMinutes")} value={value.cook_minutes} onChange={(cook_minutes) => onChange({ ...value, cook_minutes })} min={0} max={1440} error={tv(errors["body.cook_minutes"])} />
      </div>

      <div className="flex flex-col gap-2" role="group" aria-labelledby={`${baseId}-ingredients`}>
        <span id={`${baseId}-ingredients`} className="text-sm font-semibold text-fg">
          {t("ingredients")}
        </span>
        <p className="type-caption text-fg-muted">{t("ingredientsHint")}</p>
        {value.ingredients.length === 0 && <p className="type-caption text-fg-subtle">{t("ingredientsEmpty")}</p>}
        <ul className="flex flex-col gap-2">
          {value.ingredients.map((row, index) => {
            const itemError = tv(errors[`body.ingredients.${index}.item`]);
            const qtyError = tv(errors[`body.ingredients.${index}.qty`]);
            const id = `${baseId}-ing-${index}`;
            return (
              <li key={index} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Input aria-label={t("ingredientItem", { n: index + 1 })} aria-invalid={itemError ? true : undefined} aria-describedby={itemError ? `${id}-ierr` : undefined} maxLength={120} placeholder={t("ingredientPlaceholder")} value={row.item} onChange={(e) => setIngredient(index, { item: e.target.value })} />
                  {itemError && (
                    <p id={`${id}-ierr`} role="alert" className="type-caption font-medium text-danger">
                      {itemError}
                    </p>
                  )}
                </div>
                <div className="flex w-28 shrink-0 flex-col gap-1 sm:w-36">
                  <Input aria-label={t("ingredientQty", { n: index + 1 })} aria-invalid={qtyError ? true : undefined} maxLength={60} placeholder={t("qtyPlaceholder")} value={row.qty} onChange={(e) => setIngredient(index, { qty: e.target.value })} />
                  {qtyError && (
                    <p role="alert" className="type-caption font-medium text-danger">
                      {qtyError}
                    </p>
                  )}
                </div>
                <IconButton label={t("removeIngredient", { n: index + 1 })} icon={<X />} onClick={() => onChange({ ...value, ingredients: value.ingredients.filter((_, i) => i !== index) })} />
              </li>
            );
          })}
        </ul>
        {tv(errors["body.ingredients"]) && (
          <p role="alert" className="type-caption font-medium text-danger">
            {tv(errors["body.ingredients"])}
          </p>
        )}
        <div>
          <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} disabled={value.ingredients.length >= 60} onClick={() => onChange({ ...value, ingredients: [...value.ingredients, { item: "", qty: "" }] })}>
            {t("addIngredient")}
          </Button>
        </div>
      </div>

      <ListEditor
        label={t("steps")}
        hint={t("stepsHint")}
        items={value.steps}
        onChange={(steps) => onChange({ ...value, steps })}
        errorPrefix="body.steps"
        errors={errors}
        multiline
        max={40}
        itemLabel={(n) => t("step", { n })}
      />

      <ChipInput label={t("allergens")} hint={t("allergensHint")} values={value.allergens} onChange={(allergens) => onChange({ ...value, allergens })} error={tv(errors["body.allergens"])} max={20} maxLength={40} suggestions={COMMON_ALLERGENS} />

      <FormField label={t("note")} hint={t("noteHint")} error={tv(errors["body.note"])}>
        <Textarea rows={3} maxLength={600} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />
      </FormField>

      {/* Informação nutricional por porção: só vai ao público depois de validada pelo admin (RB-08). */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4" role="group" aria-labelledby={`${baseId}-nutrition`}>
        <div className="flex flex-col gap-1">
          <span id={`${baseId}-nutrition`} className="text-sm font-semibold text-fg">
            {t("nutrition.title")}
          </span>
          <p className="type-caption text-fg-muted">{t("nutrition.hint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {NUTRIENT_KEYS.map((key) => (
            <NumberField
              key={key}
              label={t(`nutrition.fields.${key}`)}
              value={nutrition.per_serving[key]}
              onChange={(n) => setNutrient(key, n)}
              min={0}
              max={100_000}
              step={NUTRIENT_STEP[key]}
              error={tv(errors[`body.nutrition.per_serving.${key}`])}
            />
          ))}
        </div>
        <FormField label={t("nutrition.note")} hint={t("nutrition.noteHint")} error={tv(errors["body.nutrition.note"])}>
          <Textarea rows={2} maxLength={600} value={nutrition.note} onChange={(e) => setNutrition({ note: e.target.value })} />
        </FormField>
        {canValidate ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <Switch
              id={`${baseId}-validated`}
              checked={nutrition.validated}
              onCheckedChange={(validated) => setNutrition({ validated })}
              label={t("nutrition.validated")}
              description={t("nutrition.validatedHint")}
              disabled={!nutritionHasValues(nutrition) && !nutrition.validated}
            />
            {nutrition.validated && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t("nutrition.validatedBy")} hint={t("nutrition.validatedByHint")} error={tv(errors["body.nutrition.validated_by"])} required>
                  <Input value={nutrition.validated_by ?? ""} maxLength={120} onChange={(e) => setNutrition({ validated_by: e.target.value || null })} />
                </FormField>
                <FormField label={t("nutrition.validatedAt")} error={tv(errors["body.nutrition.validated_at"])} required>
                  <Input type="date" value={nutrition.validated_at ?? ""} onChange={(e) => setNutrition({ validated_at: e.target.value || null })} />
                </FormField>
              </div>
            )}
          </div>
        ) : (
          <p className="border-t border-border pt-3 type-caption text-fg-muted">{validatedLabel ? `${validatedLabel} ${t("nutrition.resetOnSave")}` : t("nutrition.adminOnly")}</p>
        )}
      </div>
    </div>
  );
}
