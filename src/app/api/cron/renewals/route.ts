import { runCronJob } from "../_lib/cron";

// Renovação simulada em lote (sync_all_subscriptions): idempotente, nenhuma cobrança real.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(request: Request) {
  return runCronJob(request, "renewals", async (admin) => {
    const { data, error } = await admin.rpc("sync_all_subscriptions");
    if (error) throw new Error(error.message);
    return { synced: Number(data ?? 0), simulated: true };
  });
}

export { handler as GET, handler as POST };
