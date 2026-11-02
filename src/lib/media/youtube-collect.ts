import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chunk, youTubeStats } from "./metrics";
import { youTubeId } from "./video";

// Coleta automática de métricas do YouTube (0083), chamada pelo cron diário /api/cron/agency com o service role.
// Usa a YouTube Data API v3 oficial (videos.list, part=statistics: visualizações, curtidas e comentários de vídeos
// públicos) SOMENTE quando YOUTUBE_API_KEY está configurada no servidor. Sem a chave nada é inventado: o cron
// devolve "not_configured" e as telas dizem que a coleta automática do YouTube não está configurada.
// Uma leitura por entregável e dia (fonte "youtube"; repetir no mesmo dia substitui). Vídeo privado/removido não
// volta na resposta e fica sem leitura nova.

type Admin = ReturnType<typeof createAdminClient>;

export function youTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

const API = "https://www.googleapis.com/youtube/v3/videos";
const LOOKBACK_DAYS = 365;

export async function collectYouTubeMetrics(admin: Admin, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) return { youtube: "not_configured" };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data, error } = await admin
    .from("deliverables")
    .select("id, deal_id, deal_talent_id, talent_id, agency_id, brand_id, published_url")
    .in("status", ["published", "proof_submitted", "done"])
    .not("published_url", "is", null)
    .gte("published_at", since)
    .limit(2000);
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) return { youtube: "not_migrated" };
    throw new Error(error.message);
  }
  const targets = (data ?? []).map((d) => ({ ...d, videoId: youTubeId(d.published_url) })).filter((d): d is typeof d & { videoId: string } => d.videoId !== null);
  if (targets.length === 0) return { youtube: { videos: 0, stored: 0 } };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const ids = Array.from(new Set(targets.map((t) => t.videoId)));
  const stats = new Map<string, NonNullable<ReturnType<typeof youTubeStats>>["stats"]>();
  let failed = 0;
  for (const batch of chunk(ids, 50)) {
    const url = `${API}?part=statistics&id=${batch.map(encodeURIComponent).join(",")}&key=${encodeURIComponent(key)}`;
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      failed += batch.length;
      continue;
    }
    const body = (await res.json()) as { items?: unknown[] };
    for (const item of body.items ?? []) {
      const parsed = youTubeStats(item);
      if (parsed) stats.set(parsed.id, parsed.stats);
    }
  }
  const rows = targets
    .filter((t) => stats.has(t.videoId))
    .map((t) => {
      const s = stats.get(t.videoId)!;
      return {
        agency_id: t.agency_id,
        brand_id: t.brand_id,
        deal_id: t.deal_id,
        deliverable_id: t.id,
        deal_talent_id: t.deal_talent_id,
        talent_id: t.talent_id,
        source: "youtube",
        measured_on: today,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
        entered_side: "system",
      };
    });
  if (rows.length > 0) {
    const { error: upsertError } = await admin.from("deliverable_metrics").upsert(rows, { onConflict: "deliverable_id,source,measured_on" });
    if (upsertError) throw new Error(upsertError.message);
  }
  return { youtube: { videos: ids.length, stored: rows.length, failed } };
}
