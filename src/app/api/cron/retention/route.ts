import { runCronJob } from "../_lib/cron";

// Retenção diária: analytics 90d, pedidos de teste 90d (anonimiza), auditoria 365d, runs/logs 30d.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(request: Request) {
  return runCronJob(request, "retention", async (admin) => {
    const { data, error } = await admin.rpc("run_retention");
    if (error) throw new Error(error.message);
    const counts = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    return { counts };
  });
}

export { handler as GET, handler as POST };
