// Etapa demonstrativa de receitas: listas fixas e regras puras (servidor, cliente e testes).
// As listas espelham os checks de recipe_onboarding (0024); mudar aqui exige migração.

export const RECIPE_RESTRICTIONS = ["vegetarian", "vegan", "pescatarian", "lactose_free", "gluten_free", "low_sugar", "low_sodium"] as const;
export const RECIPE_ALLERGIES = ["peanut", "tree_nuts", "milk", "egg", "wheat", "soy", "fish", "shellfish", "sesame"] as const;
export type RecipeRestriction = (typeof RECIPE_RESTRICTIONS)[number];
export type RecipeAllergy = (typeof RECIPE_ALLERGIES)[number];

/** Os quatro passos, na ordem: aceitar o aviso, restrições e alergias, interesses, confirmar. */
export const RECIPE_STEPS = ["notice", "diet", "interests", "confirm"] as const;
export type RecipeStep = (typeof RECIPE_STEPS)[number];

export type RecipeGateState = {
  loggedIn: boolean;
  completed: boolean;
  restrictions: RecipeRestriction[];
  allergies: RecipeAllergy[];
};

export const CLOSED_GATE: RecipeGateState = { loggedIn: false, completed: false, restrictions: [], allergies: [] };

/** Mantém só valores conhecidos, sem repetir e na ordem da lista (o banco recusaria o resto). */
export function pickKnown<T extends string>(values: readonly unknown[] | null | undefined, allowed: readonly T[]): T[] {
  const set = new Set((values ?? []).filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v)));
  return allowed.filter((v) => set.has(v));
}

/** Endereço de retorno seguro: só caminhos internos (evita redirecionar para fora do app). */
export function safeNext(value: string | null | undefined, fallback = "/explore"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** Link para a etapa, voltando depois para onde a pessoa estava. */
export function recipeStepHref(next: string): string {
  return `/recipes/onboarding?next=${encodeURIComponent(safeNext(next))}`;
}
