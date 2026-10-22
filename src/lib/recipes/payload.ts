// Formato do payload de public.recipe_save (0027), espelhado em Zod. O banco valida de novo campo a
// campo ("invalid_payload: <caminho>"); aqui a mesma regra barra antes, no cliente e na action, com
// o mesmo caminho para destacar o campo certo. Mudar um limite aqui exige conferir a 0027.
import { z } from "zod";
import { RECIPE_ALLERGENS, RECIPE_DIETS, RECIPE_LIMITS, RECIPE_NUTRITION_SOURCES, RECIPE_UNITS } from "./codes";

export const RECIPE_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export const RECIPE_PILLARS = ["routine", "training", "nutrition", "gastronomy"] as const;
export const RECIPE_DISCLAIMERS = ["general", "training", "nutrition", "none"] as const;
export const RECIPE_LICENSE_KINDS = ["platform_demo", "own", "licensed", "third_party_embed"] as const;
export const RECIPE_VIDEO_PROVIDERS = ["none", "embed_youtube", "embed_vimeo", "cloudflare_stream"] as const;
export type RecipeLicenseKind = (typeof RECIPE_LICENSE_KINDS)[number];
export type RecipeVideoProvider = (typeof RECIPE_VIDEO_PROVIDERS)[number];
export type RecipeDifficulty = (typeof RECIPE_DIFFICULTIES)[number];

/** Licenças coerentes com o vídeo (espelha public.media_license_compatible, 0017). */
export function allowedRecipeLicenses(provider: RecipeVideoProvider): readonly RecipeLicenseKind[] {
  if (provider === "embed_youtube" || provider === "embed_vimeo") return ["third_party_embed"];
  if (provider === "none") return ["platform_demo", "own"];
  return ["platform_demo", "own", "licensed"];
}

/** Mantém a licença escolhida se ainda é coerente; senão a primeira permitida ("own" sem vídeo). */
export function coerceRecipeLicense(provider: RecipeVideoProvider, kind: string | null | undefined): RecipeLicenseKind {
  const allowed = allowedRecipeLicenses(provider);
  if (kind && (allowed as readonly string[]).includes(kind)) return kind as RecipeLicenseKind;
  return allowed.includes("own") ? "own" : allowed[0];
}

// Texto: o banco faz btrim e conta o tamanho depois; vazio vira nulo.
const text = (max: number) => z.string().trim().max(max).nullable();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const uuid = z.uuid();

const quantity = z.number().min(0.001).max(100000).nullable();
const unit = z.enum(RECIPE_UNITS).nullable();

const substitutionSchema = z
  .object({
    name: requiredText(120),
    quantity,
    unit,
    quantity_text: text(60),
    note: text(200),
  })
  .refine((s) => s.unit === null || s.quantity !== null, { path: ["unit"], message: "unitNeedsAmount" });

const ingredientSchema = z
  .object({
    id: uuid,
    name: requiredText(120),
    quantity,
    unit,
    quantity_text: text(60),
    to_taste: z.boolean(),
    optional: z.boolean(),
    note: text(200),
    substitutions: z.array(substitutionSchema).max(RECIPE_LIMITS.substitutions),
  })
  .superRefine((i, ctx) => {
    // mesma regra de recipe_ingredients_qty_ck
    if (i.to_taste && (i.quantity !== null || i.unit !== null || i.quantity_text !== null)) ctx.addIssue({ code: "custom", path: ["to_taste"], message: "invalid" });
    if (i.quantity !== null && i.quantity_text !== null) ctx.addIssue({ code: "custom", path: ["quantity_text"], message: "invalid" });
    if (i.quantity === null && i.unit !== null) ctx.addIssue({ code: "custom", path: ["unit"], message: "unitNeedsAmount" });
  });

const stepSchema = z.object({
  id: uuid,
  instruction: requiredText(1200),
  duration_seconds: int(1, 86400),
  temperature_c: int(-30, 320),
  tip: text(400),
  image_media_id: uuid.nullable(),
  ingredient_ids: z.array(uuid).max(RECIPE_LIMITS.ingredients),
});

const mediaSchema = z.object({
  id: uuid,
  position: z.number().int().min(1).max(40),
  alt_text: text(200),
  caption: text(200),
});

const nutritionNumber = z.number().min(0).max(100000).nullable();

export const recipePayloadSchema = z
  .object({
    content: z.object({
      title: requiredText(140),
      summary: text(600),
      tags: z.array(z.string().trim().min(1).max(30)).max(12),
      difficulty: z.enum(RECIPE_DIFFICULTIES).nullable(),
      pillar: z.enum(RECIPE_PILLARS),
      disclaimer_kind: z.enum(RECIPE_DISCLAIMERS).nullable(),
      media_license_kind: z.enum(RECIPE_LICENSE_KINDS),
      media_license_ref: text(300),
      media_credit: text(160),
    }),
    details: z.object({
      servings: int(1, 100),
      yield_text: text(60),
      prep_minutes: int(0, 1440),
      cook_minutes: int(0, 1440),
      rest_minutes: int(0, 2880),
      total_minutes: int(1, 4320),
      story: text(4000),
      diets: z.array(z.enum(RECIPE_DIETS)).max(RECIPE_DIETS.length),
      allergens: z.array(z.enum(RECIPE_ALLERGENS)).max(RECIPE_ALLERGENS.length),
      allergens_declared: z.boolean(),
      allergen_notes: text(300),
      cover_media_id: uuid.nullable(),
    }),
    extras: z.object({ chef_note: text(600) }),
    categories: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40)).max(RECIPE_LIMITS.categories),
    ingredients: z.array(ingredientSchema).max(RECIPE_LIMITS.ingredients),
    steps: z.array(stepSchema).max(RECIPE_LIMITS.steps),
    media: z.array(mediaSchema).max(RECIPE_LIMITS.media),
    nutrition: z
      .object({
        kcal: nutritionNumber,
        protein_g: nutritionNumber,
        carbs_g: nutritionNumber,
        fat_g: nutritionNumber,
        fiber_g: nutritionNumber,
        sodium_mg: nutritionNumber,
        source: z.enum(RECIPE_NUTRITION_SOURCES),
        source_note: text(200),
      })
      .nullable(),
    // ausente = mantém o vídeo atual (recipe_save)
    video: z.object({ provider: z.enum(RECIPE_VIDEO_PROVIDERS), ref: z.string().trim().min(1).max(300).nullable() }).optional(),
  })
  .superRefine((p, ctx) => {
    if (!p.details.allergens_declared && p.details.allergens.length > 0) ctx.addIssue({ code: "custom", path: ["details", "allergens_declared"], message: "invalid" });
    if (p.video && p.video.provider !== "none" && !p.video.ref) ctx.addIssue({ code: "custom", path: ["video", "ref"], message: "required" });
    const ids = new Set(p.ingredients.map((i) => i.id));
    if (ids.size !== p.ingredients.length) ctx.addIssue({ code: "custom", path: ["ingredients"], message: "invalid" });
    p.steps.forEach((s, index) => {
      if (s.ingredient_ids.some((id) => !ids.has(id))) ctx.addIssue({ code: "custom", path: ["steps", index, "ingredient_ids"], message: "invalid" });
    });
  });

export type RecipePayload = z.infer<typeof recipePayloadSchema>;

export type PayloadIssue = { path: string; message: string };

/** Erros do Zod como "caminho.com.pontos" + chave da mensagem (required, tooLong, invalid…). */
export function payloadIssues(error: z.ZodError): PayloadIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    let message = issue.message;
    if (issue.code === "too_small" && (issue as { origin?: string }).origin === "string") message = "required";
    else if (issue.code === "too_big" && (issue as { origin?: string }).origin === "string") message = "tooLong";
    else if (issue.code === "too_big" || issue.code === "too_small") message = "range";
    else if (!["required", "unitNeedsAmount", "invalid"].includes(message)) message = "invalid";
    return { path, message };
  });
}
