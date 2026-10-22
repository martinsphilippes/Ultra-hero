import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrigin } from "@/lib/auth/origin";
import type { RecipeCategoryOption } from "@/lib/recipes/catalog";
import { buildRecipeJsonLd, serializeJsonLd } from "@/lib/recipes/jsonld";
import type { RecipeViewModel } from "@/lib/recipes/view-model";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** recipes.ratings_enabled em public_settings(); ausente = desligada (como recipe_setting_on no banco). */
export function ratingsEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
  const value = (settings as Record<string, unknown>)["recipes.ratings_enabled"];
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

/**
 * Pode avaliar? Só quem concluiu a receita, com as avaliações ligadas e sem ser o chef dela (a
 * política de recipe_ratings confere tudo de novo). Devolve também a nota que a pessoa já deu.
 */
export async function loadRatingState(
  supabase: Client,
  input: { contentId: string; creatorId: string | null; userId: string | null; completed: boolean },
): Promise<{ canRate: boolean; stars: number | null }> {
  if (!input.userId || !input.completed) return { canRate: false, stars: null };
  const [settings, own, mine] = await Promise.all([
    supabase.rpc("public_settings"),
    input.creatorId ? supabase.from("creator_profiles").select("id").eq("id", input.creatorId).eq("user_id", input.userId).maybeSingle() : null,
    supabase.from("recipe_ratings").select("stars").eq("content_id", input.contentId).eq("user_id", input.userId).maybeSingle(),
  ]);
  if (settings.error || !ratingsEnabled(settings.data) || own?.data || mine.error) return { canRate: false, stars: null };
  return { canRate: true, stars: mine.data?.stars ?? null };
}

type LdInput = {
  path: string;
  title: string;
  summary: string | null;
  cover: string | null;
  publishedAt: string | null;
  tags: string[];
  chef: { slug: string; name: string; is_fictional: boolean } | null;
  model: RecipeViewModel;
  /** Quem pede pode abrir a receita (só então ingredientes e preparo entram). */
  open: boolean;
  categoryLabels: RecipeCategoryOption[] | null;
};

/** JSON-LD da receita já serializado (com `<` escapado), com endereços absolutos. */
export async function loadRecipeLd(input: LdInput): Promise<string> {
  const origin = await getOrigin();
  const abs = (p: string) => (p.startsWith("http") ? p : `${origin}${p}`);
  const labels = new Map((input.categoryLabels ?? []).map((c) => [c.code, c.label]));
  const m = input.model;
  return serializeJsonLd(
    buildRecipeJsonLd({
      url: abs(input.path),
      title: input.title,
      summary: input.summary,
      image: input.cover && !input.cover.endsWith(".svg") ? abs(input.cover) : null,
      publishedAt: input.publishedAt,
      chef: input.chef ? { name: input.chef.name, url: abs(`/personalities/${input.chef.slug}`), fictional: input.chef.is_fictional } : null,
      prepMinutes: m.prepMinutes,
      cookMinutes: m.cookMinutes,
      totalMinutes: m.totalMinutes,
      servings: m.servings,
      categories: m.categories.map((c) => labels.get(c) ?? c),
      diets: m.diets,
      keywords: input.tags,
      ingredients: input.open ? m.ingredients.map((i) => [i.amount, i.name].filter(Boolean).join(" ")) : undefined,
      steps: input.open ? m.steps.map((s) => s.instruction) : undefined,
      ratingAvg: m.ratingAvg,
      ratingCount: m.ratingCount,
    }),
  );
}
