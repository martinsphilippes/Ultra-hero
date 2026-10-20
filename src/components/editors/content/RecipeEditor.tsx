"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button, FormField, IconButton, Input, Textarea } from "@/components/ui";
import { ChipInput, ListEditor, NumberField, useValidationMessage } from "./fields";
import type { FieldErrors, RecipeBody } from "./schema";

type Props = { value: RecipeBody; onChange: (value: RecipeBody) => void; errors: FieldErrors };

const COMMON_ALLERGENS = ["glúten", "leite", "ovo", "amendoim", "castanhas", "soja", "peixe", "frutos do mar"];

// Corpo de receita: porções, tempos, ingredientes (item + quantidade), passos, alérgenos e observação.
export function RecipeEditor({ value, onChange, errors }: Props) {
  const t = useTranslations("editors.body.recipe");
  const tv = useValidationMessage();
  const baseId = useId();

  function setIngredient(index: number, patch: Partial<RecipeBody["ingredients"][number]>) {
    onChange({ ...value, ingredients: value.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

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
    </div>
  );
}
