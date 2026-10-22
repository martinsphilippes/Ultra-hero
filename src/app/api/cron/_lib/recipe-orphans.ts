import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { RECIPE_MEDIA_BUCKET } from "@/lib/recipes/media";

// Limpeza diária das fotos de receita órfãs (chamada pelo cron de retenção, com o service role):
// recipe_orphan_media (0028) lista objetos do bucket sem linha em recipe_media há mais de 24 h
// (envio que não foi registrado, foto cuja exclusão no Storage falhou, rascunho apagado). Apaga
// pela API do Storage — nunca por SQL em storage.objects. Banco sem a 0028: pula sem erro.

type Admin = SupabaseClient<Database>;

export type RecipeOrphansResult =
  | { recipe_orphans_deleted: number; recipe_orphans_failed: number }
  | { recipe_orphans_skipped: "not_migrated" };

/** Teto por execução: o cron diário não pode estourar o tempo da função. */
export const RECIPE_ORPHANS_LIMIT = 500;
const CHUNK = 100;

export async function cleanupRecipeOrphans(admin: Admin, limit: number = RECIPE_ORPHANS_LIMIT): Promise<RecipeOrphansResult> {
  const { data, error } = await admin.rpc("recipe_orphan_media", { p_limit: limit });
  if (error) {
    if (error.code === "PGRST202") return { recipe_orphans_skipped: "not_migrated" };
    throw new Error(error.message);
  }
  const paths = ((data ?? []) as unknown[]).filter((p): p is string => typeof p === "string");
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { error: removeError } = await admin.storage.from(RECIPE_MEDIA_BUCKET).remove(chunk);
    if (removeError) failed += chunk.length;
    else deleted += chunk.length;
  }
  return { recipe_orphans_deleted: deleted, recipe_orphans_failed: failed };
}
