import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeVariant } from "@/components/ui";
import type { Database } from "@/lib/supabase/database.types";

// Indicadores agregados dos Colecionáveis para o admin (sem dado pessoal): visualizações vêm dos
// eventos "collectible.view" (analytics, só o admin lê) e lances do contador do próprio item.

type Client = SupabaseClient<Database>;

/** Visualizações por item (contagem de eventos; um evento por abertura da página). */
export async function fetchCollectibleViews(supabase: Client, ids?: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    let query = supabase.from("analytics_events").select("properties").eq("event_name", "collectible.view").limit(20000);
    if (ids && ids.length === 1) query = query.eq("properties->>collectible_id", ids[0]);
    const { data } = await query;
    for (const row of data ?? []) {
      const id = (row.properties as Record<string, unknown> | null)?.collectible_id;
      if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  } catch {
    // indicador opcional: sem leitura, fica zerado
  }
  return counts;
}

/** Cor do selo de cada fase na lista e no detalhe do admin. */
export const PHASE_BADGE: Record<string, BadgeVariant> = {
  draft: "neutral",
  scheduled: "info",
  live: "danger",
  ended: "success",
  cancelled: "warning",
};
