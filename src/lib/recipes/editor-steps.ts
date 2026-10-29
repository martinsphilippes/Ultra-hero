// Etapas do editor de receitas (Portal do Chef) e o mapa "caminho do erro → etapa/campo".
// Regras puras: servem ao servidor (página com ?step=), ao cliente (RecipeWizard) e aos testes.
import type { RecipeChecklistCode } from "./codes";

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

/** Em qual etapa se corrige cada item do checklist de publicação. */
export const CHECKLIST_STEP: Record<RecipeChecklistCode, RecipeEditorStep> = {
  title: "basicos",
  summary: "basicos",
  cover: "midia",
  gallery_alt: "midia",
  servings: "basicos",
  total_minutes: "basicos",
  times: "basicos",
  ingredients: "ingredientes",
  steps: "preparo",
  category: "basicos",
  allergens: "complementos",
  license: "complementos",
  stream: "midia",
};

export const MEDIA_GALLERY_SECTION_ID = "recipe-media-gallery";
export const MEDIA_VIDEO_SECTION_ID = "recipe-media-video";

/**
 * Elemento a mostrar quando se chega pela Revisão para corrigir um item: o campo exato quando dá
 * (a primeira foto sem texto alternativo, por exemplo), senão a seção.
 */
export function checklistTarget(code: RecipeChecklistCode, opts: { firstGalleryWithoutAlt?: number | null } = {}): string {
  switch (code) {
    case "title":
      return fieldIdForPath("content.title");
    case "summary":
      return fieldIdForPath("content.summary");
    case "category":
      return fieldIdForPath("categories");
    case "servings":
      return fieldIdForPath("details.servings");
    case "total_minutes":
      return fieldIdForPath("details.prep_minutes");
    case "times":
      return fieldIdForPath("details.total_minutes");
    case "ingredients":
      return "recipe-add-ingredient";
    case "steps":
      return "recipe-add-step";
    case "allergens":
      return fieldIdForPath("details.allergens_declared");
    case "license":
      return fieldIdForPath("content.media_license_kind");
    case "gallery_alt":
      return opts.firstGalleryWithoutAlt != null ? fieldIdForPath(`media.${opts.firstGalleryWithoutAlt}.alt_text`) : MEDIA_GALLERY_SECTION_ID;
    case "cover":
      return MEDIA_GALLERY_SECTION_ID;
    case "stream":
      return MEDIA_VIDEO_SECTION_ID;
  }
}
