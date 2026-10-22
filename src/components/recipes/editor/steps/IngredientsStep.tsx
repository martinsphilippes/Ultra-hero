"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, Checkbox, FormField, IconButton, Input, Select } from "@/components/ui";
import { RECIPE_LIMITS, RECIPE_UNITS, type RecipeUnit } from "@/lib/recipes/codes";
import { emptyIngredient, focusIndexAfterRemove, moveItem, type DraftIngredient, type DraftSubstitution } from "@/lib/recipes/draft";
import { fieldIdForPath } from "@/lib/recipes/editor-steps";
import { parseQuantity } from "@/lib/recipes/quantity";
import { ItemControls, StepSection, type StepProps } from "../shared";

const ADD_ID = "recipe-add-ingredient";
// Quantidade aceita "1/2", "2 1/2" e texto livre ("1 média"): teclado de texto, não o decimal (que no
// celular não tem "/" nem letras).
const amountInputProps = { enterKeyHint: "next", autoComplete: "off" } as const;

// Etapa 2: ingredientes com quantidade numérica ("1/2", "1,5", "2 1/2"), unidade dos códigos do
// banco, "a gosto", opcional, observação e até 5 substituições. Reordenar com ↑/↓ (sem arrastar),
// com anúncio da nova posição.
export function IngredientsStep({ draft, setDraft, errorFor, disabled, announce }: StepProps) {
  const t = useTranslations("recipes.editor.ingredients");
  const tu = useTranslations("recipes.structured.units");
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (index: number, patch: Partial<DraftIngredient>) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)) }));
  const updateSub = (index: number, sIndex: number, patch: Partial<DraftSubstitution>) =>
    update(index, { substitutions: draft.ingredients[index].substitutions.map((s, i) => (i === sIndex ? { ...s, ...patch } : s)) });
  const label = (index: number) => {
    const name = draft.ingredients[index]?.name.trim();
    return name ? `${t("item", { n: index + 1 })}: ${name}` : t("item", { n: index + 1 });
  };

  function move(from: number, to: number) {
    const itemLabel = label(from);
    setDraft((d) => ({ ...d, ingredients: moveItem(d.ingredients, from, to) }));
    announce(t("moved", { label: itemLabel, n: to + 1, total: draft.ingredients.length }));
    setFocusId(fieldIdForPath(`ingredients.${to}.name`));
  }

  function remove(index: number) {
    const id = draft.ingredients[index].id;
    const itemLabel = label(index);
    // a etapa que usava o ingrediente perde só o vínculo
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== index), steps: d.steps.map((s) => ({ ...s, ingredientIds: s.ingredientIds.filter((x) => x !== id) })) }));
    announce(t("removed", { label: itemLabel }));
    const next = focusIndexAfterRemove(index, draft.ingredients.length);
    setFocusId(next === null ? ADD_ID : fieldIdForPath(`ingredients.${next}.name`));
  }

  function add() {
    const index = draft.ingredients.length;
    setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }));
    setFocusId(fieldIdForPath(`ingredients.${index}.name`));
  }

  const unitOptions = (
    <>
      <option value="">{t("unitNone")}</option>
      {RECIPE_UNITS.map((u) => (
        <option key={u} value={u}>
          {tu(`${u}.other`)}
        </option>
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {draft.ingredients.length === 0 && <p className="type-body-sm text-fg-muted">{t("empty")}</p>}
      <ol className="flex flex-col gap-4" aria-label={t("listLabel")} data-testid="ingredient-list">
        {draft.ingredients.map((ing, index) => {
          const base = `ingredients.${index}`;
          const parsed = parseQuantity(ing.amount);
          return (
            <li key={ing.id} data-testid="ingredient-item">
              <StepSection title={label(index)}>
                <div className="flex items-start justify-between gap-2">
                  <FormField id={fieldIdForPath(`${base}.name`)} label={t("name")} error={errorFor(`${base}.name`)} className="min-w-0 flex-1" required>
                    <Input value={ing.name} maxLength={120} onChange={(e) => update(index, { name: e.target.value })} disabled={disabled} data-testid="ingredient-name" />
                  </FormField>
                  <div className="pt-7">
                    <ItemControls index={index} total={draft.ingredients.length} label={label(index)} onMove={(to) => move(index, to)} onRemove={() => remove(index)} disabled={disabled} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                  <FormField
                    id={fieldIdForPath(`${base}.amount`)}
                    label={t("amount")}
                    hint={parsed.kind === "text" ? t("textHint") : t("amountHint")}
                    error={errorFor(`${base}.amount`) ?? errorFor(`${base}.quantity`) ?? errorFor(`${base}.quantity_text`)}
                  >
                    <Input value={ing.amount} maxLength={60} {...amountInputProps} onChange={(e) => update(index, { amount: e.target.value })} disabled={disabled || ing.toTaste} data-testid="ingredient-amount" />
                  </FormField>
                  <FormField id={fieldIdForPath(`${base}.unit`)} label={t("unit")} error={errorFor(`${base}.unit`)}>
                    <Select value={ing.unit} onChange={(e) => update(index, { unit: e.target.value as RecipeUnit | "" })} disabled={disabled || ing.toTaste} data-testid="ingredient-unit">
                      {unitOptions}
                    </Select>
                  </FormField>
                </div>
                <div className="flex flex-wrap gap-x-4">
                  <Checkbox id={`${fieldIdForPath(`${base}.to_taste`)}`} checked={ing.toTaste} onChange={(e) => update(index, { toTaste: e.target.checked })} label={t("toTaste")} disabled={disabled} />
                  <Checkbox id={`${fieldIdForPath(`${base}.optional`)}`} checked={ing.optional} onChange={(e) => update(index, { optional: e.target.checked })} label={t("optional")} disabled={disabled} />
                </div>
                <FormField id={fieldIdForPath(`${base}.note`)} label={t("note")} error={errorFor(`${base}.note`)}>
                  <Input value={ing.note} maxLength={200} placeholder={t("notePlaceholder")} onChange={(e) => update(index, { note: e.target.value })} disabled={disabled} />
                </FormField>

                <div className="flex flex-col gap-2" role="group" aria-label={`${t("substitutions")} · ${label(index)}`}>
                  <span className="text-sm font-semibold text-fg">{t("substitutions")}</span>
                  <p className="type-caption text-fg-muted">{t("substitutionsHint")}</p>
                  {ing.substitutions.map((sub, sIndex) => {
                    const sBase = `${base}.substitutions.${sIndex}`;
                    const subLabel = `${t("substitution", { n: sIndex + 1 })} · ${label(index)}`;
                    return (
                      <div key={sIndex} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                        <FormField id={fieldIdForPath(`${sBase}.name`)} label={t("name")} error={errorFor(`${sBase}.name`)}>
                          <Input value={sub.name} maxLength={120} aria-label={`${t("name")} · ${subLabel}`} onChange={(e) => updateSub(index, sIndex, { name: e.target.value })} disabled={disabled} />
                        </FormField>
                        <FormField id={fieldIdForPath(`${sBase}.amount`)} label={t("amount")} error={errorFor(`${sBase}.amount`)}>
                          <Input value={sub.amount} maxLength={60} {...amountInputProps} onChange={(e) => updateSub(index, sIndex, { amount: e.target.value })} disabled={disabled} />
                        </FormField>
                        <FormField id={fieldIdForPath(`${sBase}.unit`)} label={t("unit")} error={errorFor(`${sBase}.unit`)}>
                          <Select value={sub.unit} onChange={(e) => updateSub(index, sIndex, { unit: e.target.value as RecipeUnit | "" })} disabled={disabled}>
                            {unitOptions}
                          </Select>
                        </FormField>
                        <IconButton
                          label={t("remove", { label: subLabel })}
                          icon={<X />}
                          onClick={() => update(index, { substitutions: ing.substitutions.filter((_, i) => i !== sIndex) })}
                          disabled={disabled}
                        />
                      </div>
                    );
                  })}
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      leadingIcon={<Plus />}
                      disabled={disabled || ing.substitutions.length >= RECIPE_LIMITS.substitutions}
                      onClick={() => update(index, { substitutions: [...ing.substitutions, { name: "", amount: "", unit: "", note: "" }] })}
                    >
                      {t("addSubstitution")}
                    </Button>
                  </div>
                </div>
              </StepSection>
            </li>
          );
        })}
      </ol>
      <div>
        <Button id={ADD_ID} type="button" variant="secondary" leadingIcon={<Plus />} onClick={add} disabled={disabled || draft.ingredients.length >= RECIPE_LIMITS.ingredients} data-testid="add-ingredient">
          {t("add")}
        </Button>
      </div>
    </div>
  );
}
