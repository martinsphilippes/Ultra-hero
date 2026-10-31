import { drainPushOutbox } from "@/lib/push/dispatch";
import { runCronJob } from "../_lib/cron";
import { cleanupAgencyDocOrphans } from "../_lib/agency-docs";

// Gestão (0069), diário: alerta de creator sem contato há N dias (1×/semana) e de tarefa vencida (1×/dia),
// limpeza de avisos antigos e de documentos pendentes, e o envio das notificações push que isso gerou.
// Cada passo que depende da 0069 pula com "not_migrated" enquanto a migração não chega ao banco.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOT_MIGRATED = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);

async function handler(request: Request) {
  return runCronJob(request, "agency", async (admin) => {
    const out: Record<string, unknown> = {};
    const scan = await admin.rpc("agency_relationship_scan");
    if (scan.error) {
      if (!NOT_MIGRATED.has(scan.error.code ?? "")) throw new Error(scan.error.message);
      out.scan_skipped = "not_migrated";
    } else {
      out.scan = scan.data ?? {};
    }
    const cleanup = await admin.rpc("inbox_cleanup");
    if (cleanup.error) {
      if (!NOT_MIGRATED.has(cleanup.error.code ?? "")) throw new Error(cleanup.error.message);
      out.inbox_cleanup_skipped = "not_migrated";
    } else {
      out.inbox_deleted = Number(cleanup.data ?? 0);
    }
    try {
      Object.assign(out, await cleanupAgencyDocOrphans(admin));
    } catch (error) {
      out.docs_orphans_error = error instanceof Error ? error.message : String(error);
    }
    try {
      const push = await drainPushOutbox(admin, 20_000);
      out.push = { sent: push.sent, failed: push.failed, rounds: push.rounds };
    } catch (error) {
      out.push_error = error instanceof Error ? error.message : String(error);
    }
    return out;
  });
}

export { handler as GET, handler as POST };
