// Etapas do editor de receitas (Portal do Chef) e o mapa "caminho do erro → etapa/campo".
// Regras puras: servem ao servidor (página com ?step=), ao cliente (RecipeWizard) e aos testes.

/** As 6 etapas, na ordem do assistente; o valor vai na URL (?step=). */
export const RECIPE_EDITOR_STEPS = ["basicos", "ingredientes", "preparo", "midia", "complementos", "revisao"] as const;
export type RecipeEditorStep = (typeof RECIPE_EDITOR_STEPS)[number];

/** Valor de ?step= desconhecido ou ausente volta para a primeira etapa. */
export function parseEditorStep(value: unknown): RecipeEditorStep {
  return typeof value === "string" && (RECIPE_EDITOR_STEPS as readonly string[]).includes(value) ? (value as RecipeEditorStep) : "basicos";
}

export function stepIndex(step: RecipeEditorStep): number {
  return RECIPE_EDITOR_STEPS.indexOf(step);
}

/**
 * Em qual etapa mora o campo de um caminho de erro (do Zod ou de "invalid_payload: <caminho>" do
 * banco). Ex.: "ingredients.3.unit" → ingredientes; "details.allergens_declared" → complementos.
 */
export function stepForPath(path: string): RecipeEditorStep {
  const [head, key] = path.split(".");
  if (head === "ingredients") return "ingredientes";
  if (head === "steps") return "preparo";
  if (head === "media" || head === "video" || head === "cover") return "midia";
  if (head === "nutrition" || head === "extras") return "complementos";
  if (head === "details") {
    if (key === "cover_media_id") return "midia";
    if (key && ["diets", "allergens", "allergens_declared", "allergen_notes"].includes(key)) return "complementos";
    return "basicos";
  }
  if (head === "content") {
    if (key && ["tags", "media_license_kind", "media_license_ref", "media_credit"].includes(key)) return "complementos";
    return "basicos";
  }
  if (head === "categories") return "basicos";
  return "basicos";
}

/** id do elemento do campo no formulário ("ingredients.3.name" → "recipe-ingredients-3-name"). */
export function fieldIdForPath(path: string): string {
  return `recipe-${path.replace(/\./g, "-")}`;
}
