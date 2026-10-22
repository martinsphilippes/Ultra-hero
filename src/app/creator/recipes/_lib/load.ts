import "server-only";
import { RECIPE_CATEGORY_CODES } from "@/lib/recipes/codes";
import { RECIPE_CONTENT_SELECT, type RecipeContentRow } from "@/lib/recipes/rows";
import type { CreatorSupabase } from "../../_lib/content-insert";

// Leituras do Portal do Chef com o cliente do herói (a RLS só devolve o que é dele).

export type CategoryOption = { code: string; label: string };

/** Categorias ativas no idioma da tela (cai no pt-BR quando falta a tradução). */
export async function loadRecipeCategories(supabase: CreatorSupabase, locale: string): Promise<CategoryOption[]> {
  const { data, error } = await supabase.from("recipe_categories").select("code, name, sort_order").eq("active", true).order("sort_order");
  if (error || !data) return RECIPE_CATEGORY_CODES.map((code) => ({ code, label: code }));
  return (data as { code: string; name: Record<string, string> | null }[]).map((c) => ({ code: c.code, label: c.name?.[locale] ?? c.name?.["pt-BR"] ?? c.code }));
}

/** Regra de revisão das receitas (P1). Coluna ausente ou erro: desligada, como em produção hoje. */
export async function loadRecipeReviewRequired(supabase: CreatorSupabase): Promise<boolean> {
  const { data, error } = await supabase.from("content_type_settings").select("review_required").eq("type", "recipe").maybeSingle();
  if (error) return false;
  // linha ausente: o banco falha fechado (content_review_required devolve true)
  return data ? Boolean((data as { review_required?: boolean }).review_required) : true;
}

/** Envio de fotos ligado (kill switch recipes.uploads_enabled; ausente = ligado, como na 0027). */
export async function loadUploadsEnabled(supabase: CreatorSupabase): Promise<boolean> {
  const { data, error } = await supabase.rpc("public_settings");
  if (error) return true;
  const value = (data as Record<string, unknown> | null)?.["recipes.uploads_enabled"];
  return value === undefined ? true : value === true;
}

export async function loadOwnRecipeContent(supabase: CreatorSupabase, id: string, creatorId: string): Promise<RecipeContentRow | null> {
  const { data } = await supabase.from("content").select(`${RECIPE_CONTENT_SELECT}, type`).eq("id", id).maybeSingle();
  const row = data as (RecipeContentRow & { type: string }) | null;
  if (!row || row.creator_id !== creatorId || row.type !== "recipe") return null;
  return row;
}

/** Último comentário da administração (devolvida/rejeitada). */
export async function loadLatestFeedback(supabase: CreatorSupabase, id: string): Promise<string | null> {
  const { data } = await supabase.from("content_reviews").select("feedback, decision").eq("content_id", id).order("round", { ascending: false }).limit(1).maybeSingle();
  const row = data as { feedback: string | null; decision: string } | null;
  return row && (row.decision === "returned" || row.decision === "rejected") ? row.feedback : null;
}
