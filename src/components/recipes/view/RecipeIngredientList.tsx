import type { ViewIngredient } from "@/lib/recipes/view-model";

export type IngredientListLabels = { title: string; optional: string; toTaste: string; substitutes: string };

// Lista de ingredientes da receita estruturada: nome, quantidade (ou "a gosto"), observação,
// "(opcional)" e substituições. Síncrona e sem dependências de servidor: a página, a prévia e os
// testes renderizam o mesmo markup. Cada parte tem seu próprio elemento (o E2E confere o texto).
export function RecipeIngredientList({ ingredients, labels, headingId = "recipe-ingredients" }: { ingredients: ViewIngredient[]; labels: IngredientListLabels; headingId?: string }) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="type-h3 text-fg">
        {labels.title}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" data-testid="recipe-ingredients">
        {ingredients.map((ing) => (
          <li key={ing.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm" data-testid="recipe-ingredient">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-fg">
                <span className="font-medium">{ing.name}</span>
                {ing.note ? <span className="text-fg-muted"> · {ing.note}</span> : null}
                {ing.optional ? <span className="text-fg-muted"> {labels.optional}</span> : null}
              </span>
              {ing.toTaste ? (
                <span className="shrink-0 text-fg-muted">{labels.toTaste}</span>
              ) : ing.amount ? (
                <span className="type-numeric shrink-0 font-semibold text-fg-muted">{ing.amount}</span>
              ) : null}
            </span>
            {ing.substitutions.length > 0 ? (
              <span className="type-caption text-fg-muted">
                {labels.substitutes}:{" "}
                {ing.substitutions.map((s, index) => (
                  <span key={`${s.name}-${index}`}>
                    {index > 0 ? "; " : ""}
                    {s.name}
                    {s.amount ? ` (${s.amount})` : ""}
                    {s.note ? ` · ${s.note}` : ""}
                  </span>
                ))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
