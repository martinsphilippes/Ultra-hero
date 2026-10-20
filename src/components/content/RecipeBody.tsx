import { Clock, CookingPot, ShieldCheck, Users, Wheat } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatNumber, formatPlainDate } from "@/i18n/format";
import { nutritionDisplayState, type NutritionPerServing, type RecipeBody as Recipe } from "./body-types";

const NUTRIENT_ROWS: { key: keyof NutritionPerServing; label: string; unit: string }[] = [
  { key: "kcal", label: "kcal", unit: "kcal" },
  { key: "proteinG", label: "protein_g", unit: "g" },
  { key: "carbsG", label: "carbs_g", unit: "g" },
  { key: "fatG", label: "fat_g", unit: "g" },
  { key: "fiberG", label: "fiber_g", unit: "g" },
  { key: "sodiumMg", label: "sodium_mg", unit: "mg" },
];

// Receita: porções/tempos, ingredientes (qty + item), passos numerados, alérgenos e informação
// nutricional — a tabela só aparece quando validada por profissional (RF-006, RB-08).
export async function RecipeBody({ recipe }: { recipe: Recipe }) {
  const [t, locale] = await Promise.all([getTranslations("consume.body.recipe"), getLocale()]);
  const uiLocale = locale as Locale;
  const nutritionState = nutritionDisplayState(recipe.nutrition);
  const nutrition = recipe.nutrition;

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-wrap gap-2" aria-label={t("ingredients")}>
        {recipe.servings !== null && (
          <li>
            <Badge variant="neutral" icon={<Users />}>{t("servings", { n: recipe.servings })}</Badge>
          </li>
        )}
        {recipe.prepMinutes !== null && (
          <li>
            <Badge variant="neutral" icon={<Clock />}>{t("prep", { minutes: recipe.prepMinutes })}</Badge>
          </li>
        )}
        {recipe.cookMinutes !== null && (
          <li>
            <Badge variant="neutral" icon={<CookingPot />}>{t("cook", { minutes: recipe.cookMinutes })}</Badge>
          </li>
        )}
      </ul>

      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="recipe-ingredients" className="flex flex-col gap-3">
          <h2 id="recipe-ingredients" className="type-h3 text-fg">
            {t("ingredients")}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {recipe.ingredients.map((ing, index) => (
              <li key={`${ing.item}-${index}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-fg">{ing.item}</span>
                {ing.qty && <span className="type-numeric shrink-0 font-semibold text-fg-muted">{ing.qty}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recipe-steps" className="flex flex-col gap-3">
          <h2 id="recipe-steps" className="type-h3 text-fg">
            {t("steps")}
          </h2>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                  {index + 1}
                </span>
                <p className="type-body text-fg">
                  <span className="sr-only">{t("step", { n: index + 1 })}: </span>
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="recipe-allergens" className="flex flex-col gap-2">
        <h2 id="recipe-allergens" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Wheat className="size-4 text-warning" aria-hidden="true" />
          {t("allergens")}
        </h2>
        {recipe.allergens.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {recipe.allergens.map((a) => (
              <li key={a}>
                <Badge variant="warning">{a}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-fg-muted">{t("noAllergens")}</p>
        )}
      </section>

      {/* Números só com validação profissional; sem ela, apenas "em validação" (nunca como certificado). */}
      {nutritionState === "validated" && nutrition && nutrition.validatedBy && nutrition.validatedAt && (
        <section aria-labelledby="recipe-nutrition" className="flex flex-col gap-3">
          <h2 id="recipe-nutrition" className="type-h3 text-fg">
            {t("nutrition.title")}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 py-2 text-left type-caption text-fg-muted">{t("nutrition.perServing")}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t("nutrition.nutrient")}</th>
                  <th scope="col">{t("nutrition.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {NUTRIENT_ROWS.filter((row) => nutrition.perServing[row.key] !== null).map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="px-4 py-2 text-left font-medium text-fg">
                      {t(`nutrition.fields.${row.label}`)}
                    </th>
                    <td className="type-numeric px-4 py-2 text-right text-fg">
                      {formatNumber(nutrition.perServing[row.key] as number, uiLocale, { maximumFractionDigits: 1 })} {row.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-start gap-2 type-caption text-success">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("nutrition.validatedBy", { by: nutrition.validatedBy, date: formatPlainDate(nutrition.validatedAt, uiLocale) })}
          </p>
          {nutrition.note && <p className="type-caption text-fg-muted">{nutrition.note}</p>}
          <p className="type-caption text-fg-muted">{t("nutrition.disclaimer")}</p>
        </section>
      )}
      {nutritionState === "pending" && (
        <p role="note" className="rounded-xl border border-dashed border-border px-4 py-3 type-body-sm text-fg-muted">
          {t("nutrition.pending")}
        </p>
      )}

      {recipe.note && (
        <p className="rounded-xl border border-border bg-surface-elevated px-4 py-3 type-body-sm text-fg-muted">
          <span className="font-semibold text-fg">{t("note")}: </span>
          {recipe.note}
        </p>
      )}
    </div>
  );
}
