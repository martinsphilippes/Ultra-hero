import { drainPushOutbox } from "@/lib/push/dispatch";
import { runCronJob } from "../_lib/cron";

// Push diário (docs/decisions/push-notifications.md): enfileira os lembretes de sequência, envia o
// que está na fila (posts agendados que já foram ao ar, sobras de envios que falharam) e limpa a
// fila antiga. Idempotente: a fila tem dedupe_key única e push_claim não entrega a mesma linha a
// dois envios ao mesmo tempo.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// lotes até esvaziar a fila (drainPushOutbox para em 45 s)
export const maxDuration = 60;

async function handler(request: Request) {
  return runCronJob(request, "push", async (admin) => {
    const reminders = await admin.rpc("push_enqueue_streak_reminders");
    if (reminders.error) throw new Error(reminders.error.message);
    const dispatch = await drainPushOutbox(admin);
    const cleanup = await admin.rpc("push_outbox_cleanup");
    if (cleanup.error) throw new Error(cleanup.error.message);
    return { streak_reminders: Number(reminders.data ?? 0), ...dispatch, cleaned: Number(cleanup.data ?? 0) };
  });
}

export { handler as GET, handler as POST };
