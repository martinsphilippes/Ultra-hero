import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadRecipeRows } from "@/lib/recipes/rows";
import type { RecipeViewModel } from "@/lib/recipes/view-model";
import { resolveVideoSource } from "@/lib/video";
import type { ResolvedVideo } from "@/lib/video/types";
import { buildViewModel } from "./RecipeView";

type Input = { contentId: string; title: string; premium: boolean; userId?: string; locale?: string; poster?: string | null };

/**
 * Tabelas da receita → modelo do RecipeView + vídeo resolvido no servidor (as chaves do provedor
 * nunca chegam ao navegador). Receita sem vídeo não mostra a seção ("none" não vira player simulado).
 */
export async function loadRecipeView(supabase: SupabaseClient<Database>, input: Input): Promise<{ model: RecipeViewModel; video: ResolvedVideo | null }> {
  const rows = await loadRecipeRows(supabase, input.contentId, { withVideo: true });
  const model = await buildViewModel(rows, input.title);
  const v = rows.video;
  let video: ResolvedVideo | null = null;
  if (v && v.provider !== "none" && v.ref) {
    try {
      video = await resolveVideoSource({
        mediaProvider: v.provider,
        mediaRef: v.ref,
        body: null,
        durationMinutes: null,
        premium: input.premium,
        poster: input.poster ?? null,
        userId: input.userId,
        locale: input.locale,
      });
    } catch {
      video = { type: "unavailable", reason: "not-ready" };
    }
  }
  return { model, video };
}
