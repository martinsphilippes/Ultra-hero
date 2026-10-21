import { CloudflareStreamProvider, isCloudflareStreamConfigured } from "@/lib/video/providers/cloudflare-stream";
import { runCronJob } from "../_lib/cron";
import { cleanupStreamUploads } from "../_lib/stream-cleanup";

// Retenção diária: analytics 90d, pedidos de teste 90d (anonimiza), auditoria 365d, runs/logs 30d;
// e limpeza dos envios de vídeo do composer (descartados e vencidos sem publicar).
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
    return { counts, stream };
  });
}

export { handler as GET, handler as POST };
