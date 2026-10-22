// Códigos do módulo de receitas espelhados do banco (0027). Mudar uma lista aqui exige migração:
// tests/unit/recipes-codes.test.ts confere estas listas contra os checks e a ordem do checklist no SQL.
// Os rótulos ficam em messages/<locale>/recipes.json; aqui só os códigos e as regras puras.
import { RECIPE_ALLERGIES, RECIPE_RESTRICTIONS } from "./onboarding";

/** Dietas declaráveis pelo chef: os mesmos códigos das restrições da etapa demonstrativa (0024). */
export const RECIPE_DIETS = RECIPE_RESTRICTIONS;
export type RecipeDiet = (typeof RECIPE_DIETS)[number];

/** Alérgenos declaráveis: os mesmos códigos das alergias da etapa demonstrativa (0024). */
export const RECIPE_ALLERGENS = RECIPE_ALLERGIES;
export type RecipeAllergen = (typeof RECIPE_ALLERGENS)[number];

/** Unidades de quantidade (null = contagem simples). Sem conversão para embalagem. */
export const RECIPE_UNITS = ["g", "kg", "mg", "ml", "l", "tsp", "tbsp", "cup", "unit", "clove", "bunch", "sprig", "fillet", "slice", "leaf", "pinch", "can", "package"] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

/** Unidades métricas: decimal com vírgula ("1,5 L"); as demais usam fração ("1/2 xícara"). */
export const METRIC_UNITS: readonly RecipeUnit[] = ["g", "kg", "mg", "ml", "l"];

/** Taxonomia aprovada (P5), na ordem de exibição. O admin pode criar outras pela RPC. */
export const RECIPE_CATEGORY_CODES = ["cafe-da-manha", "almoco", "jantar", "lanche", "sobremesa", "molhos-e-bases", "marmitas", "sopas", "saladas", "bebidas"] as const;
export type RecipeCategoryCode = (typeof RECIPE_CATEGORY_CODES)[number];

/** Itens do checklist de publicação, na ordem de recipe_publishable_missing (0027). */
export const RECIPE_CHECKLIST_CODES = ["title", "summary", "cover", "gallery_alt", "servings", "total_minutes", "times", "ingredients", "steps", "category", "allergens", "license", "stream"] as const;
export type RecipeChecklistCode = (typeof RECIPE_CHECKLIST_CODES)[number];

export const RECIPE_MEDIA_ROLES = ["gallery", "step"] as const;
export const RECIPE_MEDIA_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const RECIPE_NUTRITION_SOURCES = ["chef", "nutritionist", "food_table", "lab"] as const;
export const RECIPE_VERSION_REASONS = ["submit", "publish", "schedule", "admin_publish", "admin_edit", "restore_point"] as const;
export const RECIPE_CATALOG_SORTS = ["relevance", "recent", "quick"] as const;

/** Limites aplicados no banco (recipe_save, recipe_register_media, política do Storage). */
export const RECIPE_LIMITS = {
  ingredients: 60,
  steps: 40,
  categories: 3,
  substitutions: 5,
  media: 30,
  gallery: 12,
  mediaBytes: 5 * 1024 * 1024,
  dailyObjects: 50,
  dailyBytes: 100 * 1024 * 1024,
  shoppingItems: 300,
  historyDays: 90,
} as const;

/** Códigos de erro das RPCs de receita (prefixo antes de ":"), traduzidos em recipes.errors.*. */
export const RECIPE_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_recipe",
  "content_not_editable",
  "stale_draft",
  "invalid_payload",
  "invalid_category",
  "too_many_categories",
  "too_many_ingredients",
  "too_many_steps",
  "media_not_owned",
  "recipe_body_managed",
  "recipe_incomplete",
  "review_required",
  "invalid_publish_at",
  "type_locked",
  "cover_not_owned",
  "nutrition_validation_forbidden",
  "nutrition_validation_incomplete",
  "uploads_disabled",
  "invalid_path",
  "object_not_found",
  "invalid_mime",
  "too_large",
  "rights_required",
  "too_many_media",
  "upload_quota_exceeded",
  "not_in_review",
  "already_archived",
  "not_archived",
  "archived_by_admin",
  "not_draft",
  "already_published",
  "content_in_use",
  "source_locked",
  "slug_taken",
  "invalid_slug",
  "version_not_found",
  "version_not_restorable",
  "version_immutable",
  "stream_media_forbidden",
] as const;
export type RecipeErrorCode = (typeof RECIPE_ERROR_CODES)[number];

/** Corpo mínimo gravado depois da primeira gravação estruturada (o v1 fica no restore_point). */
export const RECIPE_BODY_MARKER = { kind: "recipe", schema: 2 } as const;

/** Lê o código de erro de uma mensagem do banco ("recipe_incomplete: cover,steps" → "recipe_incomplete"). */
export function recipeErrorCode(message: string | null | undefined): RecipeErrorCode | null {
  const code = (message ?? "").split(":")[0]?.trim();
  return (RECIPE_ERROR_CODES as readonly string[]).includes(code) ? (code as RecipeErrorCode) : null;
}

/** Itens que faltam em "recipe_incomplete: a,b,c", só os conhecidos e na ordem do checklist. */
export function parseRecipeIncomplete(message: string | null | undefined): RecipeChecklistCode[] {
  const text = message ?? "";
  if (recipeErrorCode(text) !== "recipe_incomplete") return [];
  const found = new Set(text.slice(text.indexOf(":") + 1).split(",").map((s) => s.trim()));
  return RECIPE_CHECKLIST_CODES.filter((c) => found.has(c));
}

/** Caminho do erro de validação ("invalid_payload: ingredients.3.unit" → "ingredients.3.unit"). */
export function invalidPayloadPath(message: string | null | undefined): string | null {
  const text = message ?? "";
  if (recipeErrorCode(text) !== "invalid_payload") return null;
  return text.slice(text.indexOf(":") + 1).trim() || null;
}
