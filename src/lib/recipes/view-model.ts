// Modelo de exibição da receita estruturada (RecipeView): junta as linhas das tabelas numa forma
// pronta para a tela (ingredientes com quantidade formatada, etapas com seus ingredientes e foto,
// galeria com a capa primeiro). Puro: a página pública, a prévia do chef e os testes usam o mesmo.
import type { RecipeAllergen, RecipeDiet, RecipeUnit } from "./codes";
import { formatAmount } from "./quantity";
import { recipeMediaUrl } from "./media";
import type { RecipeMediaRow, RecipeNutritionRow, RecipeRows } from "./rows";

export type UnitLabels = Record<RecipeUnit, readonly [string, string]>;

export type ViewIngredient = {
  id: string;
  name: string;
  /** "300 g", "2 colheres de sopa", "1/2 maço", "3 colheres" (texto livre) ou null ("a gosto" vem à parte). */
  amount: string | null;
  toTaste: boolean;
  optional: boolean;
  note: string | null;
  substitutions: { name: string; amount: string | null; note: string | null }[];
};

export type ViewStep = {
  id: string;
  number: number;
  instruction: string;
  durationSeconds: number | null;
  temperatureC: number | null;
  tip: string | null;
  image: { src: string; alt: string } | null;
  ingredients: string[];
};

export type ViewPhoto = { id: string; src: string; alt: string; caption: string | null; width: number | null; height: number | null };

export type RecipeViewModel = {
  photos: ViewPhoto[];
  story: string | null;
  servings: number | null;
  yieldText: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  totalMinutes: number | null;
  categories: string[];
  ingredients: ViewIngredient[];
  steps: ViewStep[];
  allergensDeclared: boolean;
  allergens: RecipeAllergen[];
  allergenNotes: string | null;
  diets: RecipeDiet[];
  /** Números só quando validados por profissional (RB-08); senão só o estado. */
  nutrition: { state: "hidden" | "pending" | "validated"; values: Pick<RecipeNutritionRow, "kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "sodium_mg"> | null; source: RecipeNutritionRow["source"] | null; validatedBy: string | null; validatedAt: string | null; note: string | null };
  chefNote: string | null;
  ratingCount: number;
  ratingAvg: number | null;
};

/** "2 colheres de sopa" com os rótulos do idioma (plural a partir de 2). */
export function formatIngredientAmount(quantity: number | null, unit: RecipeUnit | null, quantityText: string | null, labels: UnitLabels): string | null {
  if (quantity !== null) {
    const amount = formatAmount(quantity, unit);
    if (!unit) return amount;
    const [singular, plural] = labels[unit];
    return `${amount} ${quantity >= 2 ? plural : singular}`;
  }
  return quantityText?.trim() ? quantityText.trim() : null;
}

function photo(m: RecipeMediaRow, fallbackAlt: string): ViewPhoto {
  return { id: m.id, src: recipeMediaUrl(m.id), alt: m.alt_text?.trim() || fallbackAlt, caption: m.caption, width: m.width, height: m.height };
}

export function buildRecipeViewModel(rows: RecipeRows, opts: { labels: UnitLabels; title: string }): RecipeViewModel {
  const d = rows.details;
  const gallery = rows.media.filter((m) => m.role === "gallery").sort((a, b) => a.position - b.position);
  const coverId = d?.cover_media_id ?? null;
  const ordered = coverId ? [...gallery.filter((m) => m.id === coverId), ...gallery.filter((m) => m.id !== coverId)] : gallery;
  const byId = new Map(rows.media.map((m) => [m.id, m]));
  const names = new Map(rows.ingredients.map((i) => [i.id, i.name]));
  const n = rows.nutrition;
  const hasNumbers = Boolean(n && [n.kcal, n.protein_g, n.carbs_g, n.fat_g, n.fiber_g, n.sodium_mg].some((v) => v !== null));
  const validated = Boolean(n && hasNumbers && n.validated && n.validated_by && n.validated_at);
  const ratingCount = d?.rating_count ?? 0;

  return {
    photos: ordered.map((m) => photo(m, opts.title)),
    story: d?.story ?? null,
    servings: d?.servings ?? null,
    yieldText: d?.yield_text ?? null,
    prepMinutes: d?.prep_minutes ?? null,
    cookMinutes: d?.cook_minutes ?? null,
    restMinutes: d?.rest_minutes ?? null,
    totalMinutes: d?.total_minutes ?? null,
    categories: rows.categories,
    ingredients: [...rows.ingredients]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        name: i.name,
        amount: i.to_taste ? null : formatIngredientAmount(i.quantity, i.unit, i.quantity_text, opts.labels),
        toTaste: i.to_taste,
        optional: i.optional,
        note: i.note,
        substitutions: i.substitutions.map((s) => ({ name: s.name, amount: formatIngredientAmount(s.quantity, s.unit, s.quantity_text, opts.labels), note: s.note })),
      })),
    steps: [...rows.steps]
      .sort((a, b) => a.position - b.position)
      .map((s, index) => {
        const image = s.image_media_id ? byId.get(s.image_media_id) : undefined;
        return {
          id: s.id,
          number: index + 1,
          instruction: s.instruction,
          durationSeconds: s.duration_seconds,
          temperatureC: s.temperature_c,
          tip: s.tip,
          image: image ? { src: recipeMediaUrl(image.id), alt: image.alt_text?.trim() || "" } : null,
          ingredients: rows.stepIngredients
            .filter((l) => l.step_id === s.id)
            .map((l) => names.get(l.ingredient_id))
            .filter((v): v is string => Boolean(v)),
        };
      }),
    allergensDeclared: d?.allergens_declared ?? false,
    allergens: d?.allergens ?? [],
    allergenNotes: d?.allergen_notes ?? null,
    diets: d?.diets ?? [],
    nutrition: {
      state: !hasNumbers ? "hidden" : validated ? "validated" : "pending",
      values: validated && n ? { kcal: n.kcal, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g, fiber_g: n.fiber_g, sodium_mg: n.sodium_mg } : null,
      source: hasNumbers && n ? n.source : null,
      validatedBy: validated && n ? n.validated_by : null,
      validatedAt: validated && n ? n.validated_at : null,
      note: validated && n ? n.validation_note : null,
    },
    chefNote: rows.chefNote,
    ratingCount,
    ratingAvg: ratingCount >= 3 && d ? Math.round((d.rating_sum / ratingCount) * 10) / 10 : null,
  };
}

/** "25 min", "1 h 05 min", "45 s" para a duração da etapa. */
export function formatStepDuration(seconds: number): { h: number; m: number; s: number } {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return { h, m, s };
}
