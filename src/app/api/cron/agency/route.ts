import { getOriginFromRequest } from "@/lib/auth/origin";
import { drainEmailOutbox } from "@/lib/email/outbox";
import { collectYouTubeMetrics } from "@/lib/media/youtube-collect";
import { drainPushOutbox } from "@/lib/push/dispatch";
import { runCronJob } from "../_lib/cron";
import { cleanupAgencyDocOrphans } from "../_lib/agency-docs";

// Gestão (0069), diário: alerta de creator sem contato há N dias (1×/semana) e de tarefa vencida (1×/dia),
// limpeza de avisos antigos e de documentos pendentes, e o envio das notificações push que isso gerou.
// 0083: aviso de vencimento do direito de uso (15, 7 e 0 dias) e a coleta das métricas do YouTube pela API
// oficial (só com YOUTUBE_API_KEY; sem ela o resultado diz "not_configured" e nada é inventado).
// 0084: aviso de prazo chegando (tarefa que vence nas próximas 24 h) e o envio da fila de e-mail dos avisos (só com
// RESEND_API_KEY e EMAIL_FROM; sem eles o resultado diz "not_configured" e a fila só é limpa).
// 0085: oportunidade de patrocínio com o prazo de resposta vencido passa a "encerrada" (a agência ainda escolhe).
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
    const rights = await admin.rpc("usage_rights_expiry_scan");
    if (rights.error) {
      if (!NOT_MIGRATED.has(rights.error.code ?? "")) throw new Error(rights.error.message);
      out.rights_skipped = "not_migrated";
    } else {
      out.rights_notified = Number(rights.data ?? 0);
    }
    const dueSoon = await admin.rpc("task_due_soon_scan");
    if (dueSoon.error) {
      if (!NOT_MIGRATED.has(dueSoon.error.code ?? "")) throw new Error(dueSoon.error.message);
      out.due_soon_skipped = "not_migrated";
    } else {
      out.due_soon_notified = Number(dueSoon.data ?? 0);
    }
    const sponsorships = await admin.rpc("sponsorship_deadline_scan");
    if (sponsorships.error) {
      if (!NOT_MIGRATED.has(sponsorships.error.code ?? "")) throw new Error(sponsorships.error.message);
      out.sponsorships_skipped = "not_migrated";
    } else {
      out.sponsorships_closed = Number(sponsorships.data ?? 0);
    }
    // 0089: chamadas da marca com prazo para propostas vencido
    const brandCalls = await admin.rpc("brand_call_deadline_scan");
    if (brandCalls.error) {
      if (!NOT_MIGRATED.has(brandCalls.error.code ?? "")) throw new Error(brandCalls.error.message);
      out.brand_calls_skipped = "not_migrated";
    } else {
      out.brand_calls_closed = Number(brandCalls.data ?? 0);
    }
    try {
      Object.assign(out, await collectYouTubeMetrics(admin));
    } catch (error) {
      out.youtube_error = error instanceof Error ? error.message : String(error);
    }
    try {
      Object.assign(out, await cleanupAgencyDocOrphans(admin));
    } catch (error) {
      out.docs_orphans_error = error instanceof Error ? error.message : String(error);
    }
    try {
      out.email = dueSoon.error ? "not_migrated" : await drainEmailOutbox(admin, getOriginFromRequest(request), 20_000);
      const emailCleanup = await admin.rpc("email_outbox_cleanup");
      if (!emailCleanup.error) out.email_deleted = Number(emailCleanup.data ?? 0);
    } catch (error) {
      out.email_error = error instanceof Error ? error.message : String(error);
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
