// Cruzamento de alergias na página da receita (seção 2.6): só entre os alérgenos que o chef
// DECLAROU e as alergias que a pessoa marcou na etapa demonstrativa. Receita sem declaração não
// gera aviso de "seguro" nem de risco (aparece "não informados"), e dieta nunca vira aviso.
import type { RecipeAllergen } from "./codes";
import { RECIPE_ALLERGIES, type RecipeAllergy } from "./onboarding";

export function matchDeclaredAllergens(recipe: { allergensDeclared: boolean; allergens: readonly RecipeAllergen[] }, marked: readonly RecipeAllergy[]): RecipeAllergen[] {
  if (!recipe.allergensDeclared || recipe.allergens.length === 0 || marked.length === 0) return [];
  const declared = new Set<string>(recipe.allergens);
  const mine = new Set<string>(marked);
  // ordem fixa da lista (a mesma dos rótulos), sem repetir
  return RECIPE_ALLERGIES.filter((a) => declared.has(a) && mine.has(a));
}
