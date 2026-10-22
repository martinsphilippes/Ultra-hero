import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { cleanupAvatarUploads } from "@/lib/avatar/server";
import { CloudflareStreamProvider, isCloudflareStreamConfigured } from "@/lib/video/providers/cloudflare-stream";
import { runCronJob } from "../_lib/cron";
import { cleanupStreamUploads } from "../_lib/stream-cleanup";

// Retenção diária: analytics 90d, pedidos de teste 90d (anonimiza), auditoria 365d, runs/logs 30d;
// limpeza dos envios de vídeo do composer (descartados e vencidos sem publicar) e das fotos de
// perfil sem uso ou de conta excluída (0031).
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
    return { counts, stream, avatars };
  });
}

export { handler as GET, handler as POST };
