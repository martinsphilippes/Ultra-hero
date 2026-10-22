import type { ReactNode } from "react";
import type { ScaledAmount, ViewIngredient } from "@/lib/recipes/view-model";
import { cn } from "@/lib/utils";

export type IngredientListLabels = { title: string; optional: string; toTaste: string; substitutes: string };

type Checklist = {
  checked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Nome acessível da caixa ("Marcar Azeite como separado"). */
  label: (name: string) => string;
};

type Props = {
  ingredients: ViewIngredient[];
  labels: IngredientListLabels;
  headingId?: string;
  /** Quantidades com o fator de porções, por id do ingrediente (e `${id}#${n}` para substituições). */
  amounts?: Record<string, ScaledAmount>;
  /** Aviso dos itens que não mudam com as porções (texto livre e "a gosto"); só quando o fator ≠ 1. */
  notScaledLabel?: string | null;
  checklist?: Checklist;
  /** Controles entre o título e a lista (ajuste de porções, "Limpar marcações"). */
  toolbar?: ReactNode;
};

// Lista de ingredientes da receita estruturada: nome, quantidade (ou "a gosto"), observação,
// "(opcional)" e substituições. Sem dependências de servidor: a página, a prévia e os testes
// renderizam o mesmo markup. Com `checklist`, cada item vira uma caixa nativa (teclado e leitor de
// tela de graça); com `amounts`, mostra as quantidades ajustadas às porções (≈ quando arredondou).
export function RecipeIngredientList({ ingredients, labels, headingId = "recipe-ingredients", amounts, notScaledLabel, checklist, toolbar }: Props) {
  const amountOf = (key: string, fallback: string | null) => {
    const scaled = amounts?.[key];
    if (!scaled) return { text: fallback, approx: false, scaled: true };
    return scaled;
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="type-h3 text-fg">
        {labels.title}
      </h2>
      {toolbar}
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" data-testid="recipe-ingredients">
        {ingredients.map((ing) => {
          const amount = amountOf(ing.id, ing.amount);
          const done = Boolean(checklist?.checked.has(ing.id));
          const body = (
            <>
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className={cn("text-fg", done && "text-fg-muted line-through")}>
                  <span className="font-medium">{ing.name}</span>
                  {ing.note ? <span className="text-fg-muted"> · {ing.note}</span> : null}
                  {ing.optional ? <span className="text-fg-muted"> {labels.optional}</span> : null}
                </span>
                {ing.toTaste ? (
                  <span className="shrink-0 text-fg-muted">{labels.toTaste}</span>
                ) : amount.text ? (
                  <span className="type-numeric shrink-0 font-semibold text-fg-muted" data-testid="recipe-ingredient-amount">
                    {amount.approx ? `≈ ${amount.text}` : amount.text}
                  </span>
                ) : null}
              </span>
              {notScaledLabel && (ing.toTaste || !amount.scaled) ? (
                <span className="type-caption text-fg-subtle" data-testid="recipe-ingredient-not-scaled">
                  {notScaledLabel}
                </span>
              ) : null}
              {ing.substitutions.length > 0 ? (
                <span className="type-caption text-fg-muted">
                  {labels.substitutes}:{" "}
                  {ing.substitutions.map((s, index) => {
                    const sub = amountOf(`${ing.id}#${index}`, s.amount);
                    return (
                      <span key={`${s.name}-${index}`}>
                        {index > 0 ? "; " : ""}
                        {s.name}
                        {sub.text ? ` (${sub.approx ? "≈ " : ""}${sub.text})` : ""}
                        {s.note ? ` · ${s.note}` : ""}
                      </span>
                    );
                  })}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={ing.id} className={cn("flex flex-col gap-1 text-sm print:break-inside-avoid", !checklist && "px-4 py-2.5")} data-testid="recipe-ingredient" data-checked={checklist ? String(done) : undefined}>
              {checklist ? (
                // o padding fica no label: a linha inteira (≥ 44px) marca o item, sem faixa morta entre vizinhos
                <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-2.5" data-testid="recipe-ingredient-check">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => checklist.onToggle(ing.id)}
                    aria-label={checklist.label(ing.name)}
                    className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-sm accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">{body}</span>
                </label>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
