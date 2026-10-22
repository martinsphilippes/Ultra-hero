"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { trackRecipeEvent } from "@/app/(app)/content/recipe-actions";
import { IconButton } from "@/components/ui";
import { ingredientCheckKey, readIngredientChecks, writeIngredientChecks } from "@/lib/recipes/ingredient-check";
import { clampServings, SERVINGS_MAX, SERVINGS_MIN, servingsFactor, servingsHref } from "@/lib/recipes/scale";
import { scaledAmount, type ScaledAmount, type UnitLabels, type ViewIngredient } from "@/lib/recipes/view-model";
import { RecipeIngredientList, type IngredientListLabels } from "./RecipeIngredientList";

type Props = {
  contentId: string;
  ingredients: ViewIngredient[];
  labels: IngredientListLabels;
  unitLabels: UnitLabels;
  locale: string;
  /** Porções da receita (sem elas não há ajuste). */
  baseServings: number | null;
  /** Porções pedidas na URL (?porcoes=), já validadas no servidor. */
  initialServings: number | null;
  /** Mexe na URL e registra o evento (a página pública); a prévia do chef só recalcula. */
  syncUrl?: boolean;
};

// Ingredientes com ajuste de porções (− e +, de 1 a 50, anúncio em aria-live, fator na URL) e
// checklist de "já separei" guardado só no aparelho por 24 h. O servidor já renderiza com o fator
// da URL, então a impressão e o primeiro carregamento saem com as quantidades certas.
export function RecipeIngredientsPanel({ contentId, ingredients, labels, unitLabels, locale, baseServings, initialServings, syncUrl = true }: Props) {
  const t = useTranslations("recipes.page");
  const [servings, setServings] = useState<number | null>(initialServings ?? baseServings);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [announce, setAnnounce] = useState("");
  const tracked = useRef(false);
  const labelId = useId();
  const ids = useMemo(() => ingredients.map((i) => i.id), [ingredients]);

  const factor = servingsFactor(baseServings, servings);
  const amounts = useMemo(() => {
    if (factor === 1) return undefined;
    const out: Record<string, ScaledAmount> = {};
    for (const ing of ingredients) {
      out[ing.id] = scaledAmount(ing, factor, unitLabels, locale);
      ing.substitutions.forEach((s, index) => {
        out[`${ing.id}#${index}`] = scaledAmount(s, factor, unitLabels, locale);
      });
    }
    return out;
  }, [factor, ingredients, unitLabels, locale]);

  // Marcações salvas (24 h). Lidas só depois de montar: o servidor não conhece o aparelho.
  useEffect(() => {
    try {
      setChecked(new Set(readIngredientChecks(window.localStorage.getItem(ingredientCheckKey(contentId)), ids)));
    } catch {
      // sem storage (modo privado restrito): o checklist funciona só nesta visita
    }
  }, [contentId, ids]);

  const persist = useCallback(
    (next: Set<string>) => {
      try {
        const value = writeIngredientChecks([...next]);
        if (value) window.localStorage.setItem(ingredientCheckKey(contentId), value);
        else window.localStorage.removeItem(ingredientCheckKey(contentId));
      } catch {
        // idem: só perde a lembrança
      }
    },
    [contentId],
  );

  const toggle = useCallback(
    (id: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearChecks = () => {
    setChecked(new Set());
    persist(new Set());
    setAnnounce(t("checksCleared"));
  };

  const changeServings = (value: number) => {
    if (baseServings === null) return;
    const next = clampServings(value);
    setServings(next);
    setAnnounce(t("servingsAnnounce", { n: next }));
    if (!syncUrl) return;
    // replaceState: o Next mantém a rota; o link compartilhado e a impressão levam as porções
    window.history.replaceState(null, "", servingsHref(window.location.pathname, window.location.search, next, baseServings));
    if (!tracked.current) {
      tracked.current = true;
      void trackRecipeEvent({ event: "recipe.scale", servings: next });
    }
  };

  const toolbar = (
    <div className="flex flex-col gap-2">
      {baseServings !== null && servings !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2" role="group" aria-labelledby={labelId} data-testid="servings-scaler">
          <span id={labelId} className="text-sm font-semibold text-fg">
            {t("servings")}
          </span>
          <div className="flex items-center gap-1 print:hidden">
            <IconButton label={t("servingsLess")} icon={<Minus />} variant="secondary" disabled={servings <= SERVINGS_MIN} onClick={() => changeServings(servings - 1)} data-testid="servings-less" />
            <input
              type="number"
              inputMode="numeric"
              min={SERVINGS_MIN}
              max={SERVINGS_MAX}
              value={servings}
              onChange={(event) => {
                const n = Number(event.target.value);
                if (Number.isFinite(n) && n >= SERVINGS_MIN) changeServings(n);
              }}
              aria-label={t("servingsInput")}
              className="h-11 w-16 rounded-lg border border-border-strong bg-surface text-center text-base font-semibold text-fg type-numeric focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              data-testid="servings-value"
            />
            <IconButton label={t("servingsMore")} icon={<Plus />} variant="secondary" disabled={servings >= SERVINGS_MAX} onClick={() => changeServings(servings + 1)} data-testid="servings-more" />
          </div>
          <span className="hidden text-sm text-fg print:inline">{t("servingsPrint", { n: servings })}</span>
          {servings !== baseServings ? (
            <button
              type="button"
              onClick={() => changeServings(baseServings)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("servingsReset", { n: baseServings })}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="type-caption text-fg-muted">{t("checklistHint")}</p>
        {checked.size > 0 ? (
          <button
            type="button"
            onClick={clearChecks}
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="ingredient-checks-clear"
          >
            {t("checksClear")}
          </button>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only" data-testid="servings-announce">
        {announce}
      </p>
    </div>
  );

  return (
    <RecipeIngredientList
      ingredients={ingredients}
      labels={labels}
      amounts={amounts}
      notScaledLabel={factor !== 1 ? t("notScaled") : null}
      checklist={{ checked, onToggle: toggle, label: (name) => t("checkIngredient", { name }) }}
      toolbar={toolbar}
    />
  );
}
