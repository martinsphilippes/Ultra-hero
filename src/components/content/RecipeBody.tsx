import { Clock, CookingPot, Users, Wheat } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { RecipeBody as Recipe } from "./body-types";

// Receita: porções/tempos, ingredientes (qty + item), passos numerados e alérgenos.
export async function RecipeBody({ recipe }: { recipe: Recipe }) {
  const t = await getTranslations("consume.body.recipe");
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

      {recipe.note && (
        <p className="rounded-xl border border-border bg-surface-elevated px-4 py-3 type-body-sm text-fg-muted">
          <span className="font-semibold text-fg">{t("note")}: </span>
          {recipe.note}
        </p>
      )}
    </div>
  );
}
