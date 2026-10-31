import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Documentos do módulo de gestão reservados e nunca concluídos há mais de 24 h (0069): o banco lista os
// caminhos, o cron apaga pela API do Storage (nunca por SQL em storage.objects) e só então apaga as linhas
// dos arquivos que saíram. Banco sem a 0069: pula sem erro.

type Admin = SupabaseClient<Database>;
export const AGENCY_DOCS_BUCKET = "agency-docs";
const CHUNK = 100;

export type AgencyDocsResult = { docs_orphans_deleted: number; docs_orphans_failed: number } | { docs_orphans_skipped: "not_migrated" };

export async function cleanupAgencyDocOrphans(admin: Admin, limit = 200): Promise<AgencyDocsResult> {
  const { data, error } = await admin.rpc("documents_orphans", { p_limit: limit });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { docs_orphans_skipped: "not_migrated" };
    throw new Error(error.message);
  }
  const paths = ((data ?? []) as unknown[]).filter((p): p is string => typeof p === "string");
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { error: removeError } = await admin.storage.from(AGENCY_DOCS_BUCKET).remove(chunk);
    if (removeError) {
      failed += chunk.length;
      continue;
    }
    const { data: purged, error: purgeError } = await admin.rpc("documents_orphans_purge", { p_paths: chunk });
    if (purgeError) failed += chunk.length;
    else deleted += Number(purged ?? 0);
  }
  return { docs_orphans_deleted: deleted, docs_orphans_failed: failed };
}
