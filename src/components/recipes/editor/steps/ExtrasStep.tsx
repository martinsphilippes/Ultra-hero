"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChipInput } from "@/components/editors/content/fields";
import { Checkbox, Chip, FormField, Input, Select, Textarea } from "@/components/ui";
import { RECIPE_ALLERGENS, RECIPE_DIETS, RECIPE_NUTRITION_SOURCES } from "@/lib/recipes/codes";
import { NUTRITION_FIELDS, allergensPending, type RecipeDraft } from "@/lib/recipes/draft";
import { fieldIdForPath } from "@/lib/recipes/editor-steps";
import { RECIPE_LICENSE_KINDS, allowedRecipeLicenses, type RecipeLicenseKind } from "@/lib/recipes/payload";
import { cn } from "@/lib/utils";
import { FieldError, StepSection, type StepProps } from "../shared";

type AllergenMode = "undeclared" | "none" | "some";
type Props = StepProps & { nutritionValidated: boolean };

// o modo fica no rascunho (allergensSome): "Contém" sem marcar nada não pode virar "Nenhum" calado
function allergenMode(d: RecipeDraft): AllergenMode {
  if (!d.allergensDeclared) return "undeclared";
  return d.allergensSome ? "some" : "none";
}

// Etapa 5: etiquetas, alérgenos (declarar é obrigatório para publicar, com "Nenhum alérgeno"
// explícito), notas, dietas, nutrição com origem (a validação é do admin e aparece só como estado),
// nota do chef e licença coerente com o vídeo.
export function ExtrasStep({ draft, setDraft, errorFor, disabled, nutritionValidated }: Props) {
  const t = useTranslations("recipes.editor.extras");
  const ta = useTranslations("recipes.onboarding.allergies");
  const td = useTranslations("recipes.onboarding.restrictions");
  const tl = useTranslations("editors.license");
  const mode = allergenMode(draft);
  const pickOne = allergensPending(draft);
  const set = (patch: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const allowed = allowedRecipeLicenses(draft.video.provider);
  const allergenId = fieldIdForPath("details.allergens_declared");

  function changeMode(next: AllergenMode) {
    if (next === "undeclared") set({ allergensDeclared: false, allergensSome: false, allergens: [] });
    else if (next === "none") set({ allergensDeclared: true, allergensSome: false, allergens: [] });
    else set({ allergensDeclared: true, allergensSome: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <StepSection>
        <ChipInput label={t("tags")} hint={t("tagsHint")} values={draft.tags} onChange={(tags) => set({ tags })} error={errorFor("content.tags")} max={12} maxLength={30} />
      </StepSection>

      <StepSection title={t("allergensTitle")}>
        <p className="-mt-2 type-body-sm text-fg-muted">{t("allergensHint")}</p>
        <fieldset id={allergenId} tabIndex={-1} className="flex flex-col gap-2 outline-none" aria-describedby={errorFor("details.allergens_declared") ? `${allergenId}-err` : undefined}>
          <legend className="text-sm font-semibold text-fg">{t("allergensState")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["undeclared", "none", "some"] as const).map((m) => (
              <label key={m} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm", mode === m ? "border-accent bg-accent-soft text-fg" : "border-border-strong text-fg-muted")}>
                <input type="radio" name="recipe-allergen-mode" value={m} checked={mode === m} onChange={() => changeMode(m)} disabled={disabled} className="size-4" data-testid={`allergens-${m}`} />
                {m === "undeclared" ? t("allergensUndeclared") : m === "none" ? t("allergensNone") : t("allergensSome")}
              </label>
            ))}
          </div>
          <FieldError id={allergenId} message={errorFor("details.allergens_declared")} />
        </fieldset>
        {mode === "some" && (
          <div role="group" aria-label={t("allergensList")} aria-describedby={pickOne ? "recipe-allergens-pick-one" : undefined} className="flex flex-wrap gap-2">
            {RECIPE_ALLERGENS.map((a) => {
              const selected = draft.allergens.includes(a);
              return (
                <Chip
                  key={a}
                  selected={selected}
                  icon={selected ? <Check /> : undefined}
                  className="min-h-11"
                  disabled={disabled}
                  onClick={() => set({ allergens: selected ? draft.allergens.filter((x) => x !== a) : RECIPE_ALLERGENS.filter((x) => x === a || draft.allergens.includes(x)) })}
                >
                  {ta(a)}
                </Chip>
              );
            })}
          </div>
        )}
        {pickOne && (
          <p id="recipe-allergens-pick-one" className="type-caption font-medium text-warning" data-testid="allergens-pick-one">
            {t("allergensPickOne")}
          </p>
        )}
        {mode !== "undeclared" && (
          <FormField id={fieldIdForPath("details.allergen_notes")} label={t("allergenNotes")} hint={t("allergenNotesHint")} error={errorFor("details.allergen_notes")}>
            <Input value={draft.allergenNotes} maxLength={300} onChange={(e) => set({ allergenNotes: e.target.value })} disabled={disabled} />
          </FormField>
        )}
        <div role="group" aria-labelledby="recipe-diets-label" className="flex flex-col gap-2">
          <span id="recipe-diets-label" className="text-sm font-semibold text-fg">
            {t("diets")}
          </span>
          <p className="type-caption text-fg-muted">{t("dietsHint")}</p>
          <div className="flex flex-wrap gap-2">
            {RECIPE_DIETS.map((dCode) => {
              const selected = draft.diets.includes(dCode);
              return (
                <Chip
                  key={dCode}
                  selected={selected}
                  icon={selected ? <Check /> : undefined}
                  className="min-h-11"
                  disabled={disabled}
                  onClick={() => set({ diets: selected ? draft.diets.filter((x) => x !== dCode) : RECIPE_DIETS.filter((x) => x === dCode || draft.diets.includes(x)) })}
                >
                  {td(dCode)}
                </Chip>
              );
            })}
          </div>
        </div>
      </StepSection>

      <StepSection title={t("nutritionTitle")}>
        <Checkbox id="recipe-nutrition-enabled" checked={draft.nutritionEnabled} onChange={(e) => set({ nutritionEnabled: e.target.checked })} label={t("nutritionEnable")} disabled={disabled} />
        {draft.nutritionEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {NUTRITION_FIELDS.map((key) => (
                <FormField key={key} id={fieldIdForPath(`nutrition.${key}`)} label={t(`nutritionFields.${key}`)} error={errorFor(`nutrition.${key}`)}>
                  <Input inputMode="decimal" value={draft.nutrition[key]} maxLength={9} onChange={(e) => set({ nutrition: { ...draft.nutrition, [key]: e.target.value } })} disabled={disabled} />
                </FormField>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id={fieldIdForPath("nutrition.source")} label={t("nutritionSource")} error={errorFor("nutrition.source")}>
                <Select value={draft.nutrition.source} onChange={(e) => set({ nutrition: { ...draft.nutrition, source: e.target.value as RecipeDraft["nutrition"]["source"] } })} disabled={disabled}>
                  {RECIPE_NUTRITION_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`sources.${s}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id={fieldIdForPath("nutrition.source_note")} label={t("nutritionSourceNote")} error={errorFor("nutrition.source_note")}>
                <Input value={draft.nutrition.sourceNote} maxLength={200} onChange={(e) => set({ nutrition: { ...draft.nutrition, sourceNote: e.target.value } })} disabled={disabled} />
              </FormField>
            </div>
            <p className="type-caption text-fg-muted" role="note">
              {nutritionValidated ? t("nutritionValidated") : t("nutritionPending")}
            </p>
          </>
        )}
      </StepSection>

      <StepSection>
        <FormField id={fieldIdForPath("extras.chef_note")} label={t("chefNote")} hint={t("chefNoteHint")} error={errorFor("extras.chef_note")}>
          <Textarea rows={3} value={draft.chefNote} maxLength={600} onChange={(e) => set({ chefNote: e.target.value })} disabled={disabled} />
        </FormField>
      </StepSection>

      <StepSection title={t("licenseTitle")}>
        <FormField id={fieldIdForPath("content.media_license_kind")} label={tl("kind")} hint={tl(`kindHint.${draft.licenseKind}`)} error={errorFor("content.media_license_kind")}>
          <Select value={draft.licenseKind} onChange={(e) => set({ licenseKind: e.target.value as RecipeLicenseKind })} disabled={disabled}>
            {RECIPE_LICENSE_KINDS.map((kind) => (
              <option key={kind} value={kind} disabled={!allowed.includes(kind)}>
                {tl(`kinds.${kind}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id={fieldIdForPath("content.media_credit")} label={tl("credit")} hint={tl("creditHint")} error={errorFor("content.media_credit")}>
            <Input value={draft.credit} maxLength={160} onChange={(e) => set({ credit: e.target.value })} disabled={disabled} />
          </FormField>
          <FormField id={fieldIdForPath("content.media_license_ref")} label={tl("ref")} hint={tl("refHint")} error={errorFor("content.media_license_ref")}>
            <Input value={draft.licenseRef} maxLength={300} autoComplete="off" spellCheck={false} onChange={(e) => set({ licenseRef: e.target.value })} disabled={disabled} />
          </FormField>
        </div>
      </StepSection>
    </div>
  );
}
