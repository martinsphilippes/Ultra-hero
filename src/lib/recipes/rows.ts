// Leitura das tabelas da receita estruturada (0027) com o cliente de quem pede: a RLS decide o que
// volta (o dono vê o próprio rascunho; o consumidor só o que pode abrir). Serve ao editor, à
// pré-visualização e à página pública. Sem "server-only": os testes usam um cliente falso.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RecipeAllergen, RecipeDiet, RecipeUnit } from "./codes";

type Client = SupabaseClient<Database>;

export type RecipeContentRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  pillar: "routine" | "training" | "nutrition" | "gastronomy";
  disclaimer_kind: "general" | "training" | "nutrition" | "none" | null;
  media_license_kind: "platform_demo" | "own" | "licensed" | "third_party_embed";
  media_license_ref: string | null;
  media_credit: string | null;
  cover_url: string | null;
  status: "draft" | "published" | "archived";
  review_status: "none" | "in_review" | "returned" | "approved" | "rejected";
  publish_at: string | null;
  published_at: string | null;
  archived_by: string | null;
  creator_id: string | null;
  updated_at: string;
};

export type RecipeDetailsRow = {
  servings: number | null;
  yield_text: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
  total_minutes: number | null;
  story: string | null;
  diets: RecipeDiet[];
  allergens: RecipeAllergen[];
  allergens_declared: boolean;
  allergen_notes: string | null;
  cover_media_id: string | null;
  rating_count: number;
  rating_sum: number;
};

export type RecipeSubstitution = { name: string; quantity: number | null; unit: RecipeUnit | null; quantity_text: string | null; note: string | null };

export type RecipeIngredientRow = {
  id: string;
  position: number;
  name: string;
  quantity: number | null;
  unit: RecipeUnit | null;
  quantity_text: string | null;
  to_taste: boolean;
  optional: boolean;
  note: string | null;
  substitutions: RecipeSubstitution[];
};

export type RecipeStepRow = {
  id: string;
  position: number;
  instruction: string;
  duration_seconds: number | null;
  temperature_c: number | null;
  tip: string | null;
  image_media_id: string | null;
};

export type RecipeMediaRow = {
  id: string;
  role: "gallery" | "step";
  position: number;
  mime: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  storage_path: string;
};

export type RecipeNutritionRow = {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  source: "chef" | "nutritionist" | "food_table" | "lab";
  source_note: string | null;
  validated: boolean;
  validated_by: string | null;
  validated_at: string | null;
  validation_note: string | null;
};

export type RecipeVideo = { provider: "none" | "embed_youtube" | "embed_vimeo" | "cloudflare_stream" | "mux" | "upload"; ref: string | null };

export type RecipeRows = {
  details: RecipeDetailsRow | null;
  chefNote: string | null;
  categories: string[];
  ingredients: RecipeIngredientRow[];
  steps: RecipeStepRow[];
  stepIngredients: { step_id: string; ingredient_id: string }[];
  media: RecipeMediaRow[];
  nutrition: RecipeNutritionRow | null;
  video: RecipeVideo | null;
};

export const RECIPE_CONTENT_SELECT =
  "id, slug, title, summary, tags, difficulty, pillar, disclaimer_kind, media_license_kind, media_license_ref, media_credit, cover_url, status, review_status, publish_at, published_at, archived_by, creator_id, updated_at";

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function substitutionsFrom(value: unknown): RecipeSubstitution[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null && typeof (s as { name?: unknown }).name === "string")
    .map((s) => ({
      name: String(s.name),
      quantity: num(s.quantity),
      unit: (typeof s.unit === "string" ? s.unit : null) as RecipeUnit | null,
      quantity_text: typeof s.quantity_text === "string" ? s.quantity_text : null,
      note: typeof s.note === "string" ? s.note : null,
    }));
}

/** Existe recipe_details para o conteúdo? (receita estruturada; as antigas também, depois da 0029) */
export async function hasRecipeDetails(supabase: Client, contentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("recipe_details").select("content_id").eq("content_id", contentId).maybeSingle();
  if (error) return false; // banco sem a 0027 ou sem permissão: fica com a página antiga
  return Boolean(data);
}

/**
 * Lê as tabelas da receita. Tabelas que a pessoa não pode ler (visitante em recipe_extras, por
 * exemplo) voltam vazias em vez de derrubar a página. `withVideo` lê também o vídeo (content_bodies).
 * `publicOnly` (receita fechada) lê só a parte pública (detalhes, categorias e mídia): extras,
 * ingredientes, etapas, vínculos e nutrição não aparecem nesse modo e nem vão ao banco.
 */
export async function loadRecipeRows(supabase: Client, contentId: string, options: { withVideo?: boolean; publicOnly?: boolean } = {}): Promise<RecipeRows> {
  const full = !options.publicOnly;
  const [details, extras, cats, ings, steps, links, media, nutrition, body] = await Promise.all([
    supabase
      .from("recipe_details")
      .select("servings, yield_text, prep_minutes, cook_minutes, rest_minutes, total_minutes, story, diets, allergens, allergens_declared, allergen_notes, cover_media_id, rating_count, rating_sum")
      .eq("content_id", contentId)
      .maybeSingle(),
    full ? supabase.from("recipe_extras").select("chef_note").eq("content_id", contentId).maybeSingle() : null,
    supabase.from("recipe_category_links").select("category_code").eq("content_id", contentId),
    full
      ? supabase
          .from("recipe_ingredients")
          .select("id, position, name, quantity, unit, quantity_text, to_taste, optional, note, substitutions")
          .eq("content_id", contentId)
          .order("position")
      : null,
    full ? supabase.from("recipe_steps").select("id, position, instruction, duration_seconds, temperature_c, tip, image_media_id").eq("content_id", contentId).order("position") : null,
    full ? supabase.from("recipe_step_ingredients").select("step_id, ingredient_id").eq("content_id", contentId) : null,
    supabase.from("recipe_media").select("id, role, position, mime, width, height, alt_text, caption, storage_path").eq("content_id", contentId).order("role").order("position"),
    full
      ? supabase
          .from("recipe_nutrition")
          .select("kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source, source_note, validated, validated_by, validated_at, validation_note")
          .eq("content_id", contentId)
          .maybeSingle()
      : null,
    options.withVideo ? supabase.from("content_bodies").select("media_provider, media_ref").eq("content_id", contentId).maybeSingle() : null,
  ]);
  const d = details.data as (RecipeDetailsRow & Record<string, unknown>) | null;
  const n = nutrition?.data as Record<string, unknown> | null;
  const b = body?.data as { media_provider: RecipeVideo["provider"]; media_ref: string | null } | null | undefined;
  return {
    details: d
      ? {
          ...d,
          diets: (d.diets ?? []) as RecipeDiet[],
          allergens: (d.allergens ?? []) as RecipeAllergen[],
          rating_count: d.rating_count ?? 0,
          rating_sum: d.rating_sum ?? 0,
        }
      : null,
    chefNote: (extras?.data as { chef_note: string | null } | null)?.chef_note ?? null,
    categories: ((cats.data ?? []) as { category_code: string }[]).map((c) => c.category_code),
    ingredients: ((ings?.data ?? []) as Record<string, unknown>[]).map((i) => ({
      id: String(i.id),
      position: Number(i.position),
      name: String(i.name),
      quantity: num(i.quantity),
      unit: (i.unit ?? null) as RecipeUnit | null,
      quantity_text: (i.quantity_text ?? null) as string | null,
      to_taste: Boolean(i.to_taste),
      optional: Boolean(i.optional),
      note: (i.note ?? null) as string | null,
      substitutions: substitutionsFrom(i.substitutions),
    })),
    steps: ((steps?.data ?? []) as RecipeStepRow[]).map((s) => ({ ...s, position: Number(s.position) })),
    stepIngredients: (links?.data ?? []) as { step_id: string; ingredient_id: string }[],
    media: ((media.data ?? []) as RecipeMediaRow[]).map((m) => ({ ...m, position: Number(m.position) })),
    nutrition: n
      ? {
          kcal: num(n.kcal),
          protein_g: num(n.protein_g),
          carbs_g: num(n.carbs_g),
          fat_g: num(n.fat_g),
          fiber_g: num(n.fiber_g),
          sodium_mg: num(n.sodium_mg),
          source: (n.source ?? "chef") as RecipeNutritionRow["source"],
          source_note: (n.source_note ?? null) as string | null,
          validated: Boolean(n.validated),
          validated_by: (n.validated_by ?? null) as string | null,
          validated_at: (n.validated_at ?? null) as string | null,
          validation_note: (n.validation_note ?? null) as string | null,
        }
      : null,
    video: b ? { provider: b.media_provider, ref: b.media_ref } : null,
  };
}
