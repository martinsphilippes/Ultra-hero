import { runCronJob } from "../_lib/cron";

// Encerra os Colecionáveis vencidos (grava vencedor e valor final, contato "a contatar"; idempotente).
// Vercel Hobby só permite cron diário: o encerramento também acontece sob demanda, ao abrir o item
// (collectible_finalize). Sem a 0054 no banco a função não existe e o job devolve erro (500).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(request: Request) {
  return runCronJob(request, "collectibles", async (admin) => {
    const { data, error } = await admin.rpc("collectible_finalize_due");
    if (error) throw new Error(error.message);
    return { finalized: Number(data ?? 0) };
  });
}

export { handler as GET, handler as POST };
