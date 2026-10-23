import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { cleanupAvatarUploads } from "@/lib/avatar/server";
import { CloudflareStreamProvider, isCloudflareStreamConfigured } from "@/lib/video/providers/cloudflare-stream";
import { runCronJob } from "../_lib/cron";
import { cleanupRecipeOrphans } from "../_lib/recipe-orphans";
import { cleanupStreamUploads } from "../_lib/stream-cleanup";

// Retenção diária: analytics 90d, pedidos de teste 90d (anonimiza), auditoria 365d, runs/logs 30d;
// limpeza dos envios de vídeo do composer (descartados e vencidos sem publicar) e das fotos de
// perfil sem uso ou de conta excluída (0031), das fotos de receita órfãs no bucket recipe-media e
// dos dados de relógio (health_run_retention, 0038).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(request: Request) {
  return runCronJob(request, "retention", async (admin) => {
    const { data, error } = await admin.rpc("run_retention");
    if (error) throw new Error(error.message);
    const counts = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    // Sem as chaves do Stream não há o que apagar no Cloudflare; falha na limpeza de vídeo não
    // derruba a retenção do banco, que já rodou (volta no relatório e tenta de novo amanhã).
    let stream: Record<string, unknown> = { stream_skipped: "not_configured" };
    if (isCloudflareStreamConfigured()) {
      try {
        stream = await cleanupStreamUploads(admin, new CloudflareStreamProvider());
      } catch (cleanupError) {
        stream = { stream_failed: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) };
      }
    }
    // Fotos de perfil: mesma regra (falha não derruba a retenção; banco sem a 0031 só pula).
    let avatars: Record<string, unknown>;
    try {
      avatars = await cleanupAvatarUploads(admin, supabaseBaseUrl());
    } catch (cleanupError) {
      avatars = { avatars_failed: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) };
    }
    // fotos de receita órfãs no Storage: falha aqui também não derruba o resto
    let recipeMedia: Record<string, unknown>;
    try {
      recipeMedia = await cleanupRecipeOrphans(admin);
    } catch (orphanError) {
      recipeMedia = { recipe_orphans_error: orphanError instanceof Error ? orphanError.message : String(orphanError) };
    }
    // Dados de relógio (0038, §8.10): 13 meses, payload bruto 7/30 dias, revogação pela marca e
    // mudança material em 30 dias. Banco sem a 0038 (o remoto de hoje): pula sem erro.
    let health: Record<string, unknown>;
    try {
      const { data: purged, error: healthError } = await admin.rpc("health_run_retention");
      if (healthError) health = healthError.code === "PGRST202" ? { health_skipped: "not_migrated" } : { health_failed: healthError.message };
      else health = (purged && typeof purged === "object" ? purged : {}) as Record<string, unknown>;
    } catch (healthError) {
      health = { health_failed: healthError instanceof Error ? healthError.message : String(healthError) };
    }
    return { counts, stream, avatars, recipe_media: recipeMedia, health };
  });
}

export { handler as GET, handler as POST };
