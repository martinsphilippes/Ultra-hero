import "server-only";
import { after } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AbstractIntlMessages } from "next-intl";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getOrigin } from "@/lib/auth/origin";
import { inboxParams } from "@/lib/inbox/kinds";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "./server";
import { buildWorkEmail } from "./work-message";

// Avisos por e-mail (0084): o banco põe na fila email_outbox os avisos do sino que valem e-mail (respeitando
// notification_preferences.channel_email); aqui a fila sai pelo Resend (src/lib/email/server.ts). Sem
// RESEND_API_KEY e EMAIL_FROM nada é pego da fila (o aviso continua no sino; a fila é limpa pelo cron).
// Chamado depois das server actions que geram esses avisos (after(), sem bloquear a ação) e pelo cron diário.

type Admin = ReturnType<typeof createAdminClient>;
export type EmailDrainResult = { claimed: number; sent: number; failed: number; skipped: number } | { skipped: "not_configured" };

const BATCH = 50;

const messagesCache = new Map<Locale, Promise<AbstractIntlMessages>>();
function emailMessages(locale: Locale): Promise<AbstractIntlMessages> {
  let pending = messagesCache.get(locale);
  if (!pending) {
    pending = fs.readFile(path.join(process.cwd(), "messages", locale, "email.json"), "utf8").then((raw) => JSON.parse(raw) as AbstractIntlMessages);
    messagesCache.set(locale, pending);
  }
  return pending;
}

export async function drainEmailOutbox(admin: Admin, origin: string, budgetMs = 20_000): Promise<EmailDrainResult> {
  if (!isEmailConfigured()) return { skipped: "not_configured" };
  const started = Date.now();
  const result = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  while (Date.now() - started < budgetMs) {
    const { data, error } = await admin.rpc("email_outbox_claim", { p_limit: BATCH });
    if (error) throw new Error(`email: claim ${error.message}`);
    const rows = data ?? [];
    result.claimed += rows.length;
    if (rows.length === 0) break;
    for (const row of rows) {
      const locale: Locale = isLocale(row.locale) ? row.locale : defaultLocale;
      const message = buildWorkEmail({ kind: row.kind, params: inboxParams(row.params), link: row.link, origin, locale, messages: await emailMessages(locale) });
      if (!message || !row.email) {
        result.skipped += 1;
        await admin.from("email_outbox").update({ skipped_at: new Date().toISOString(), outcome: "skipped_no_template" }).eq("id", row.id);
        continue;
      }
      const sent = await sendEmail({ to: row.email, ...message });
      if (sent.ok) {
        result.sent += 1;
        await admin.from("email_outbox").update({ sent_at: new Date().toISOString(), outcome: "sent" }).eq("id", row.id);
      } else {
        // fica "pego": volta à fila em 5 minutos (até 5 tentativas, controladas pelo claim)
        result.failed += 1;
        await admin.from("email_outbox").update({ outcome: sent.error }).eq("id", row.id);
      }
    }
    if (rows.length < BATCH) break;
  }
  return result;
}

/**
 * Depois da resposta da server action, esvazia a fila que a ação acabou de encher. Dependência não crítica:
 * falha é logada e engolida (a ação já terminou); o cron diário recolhe o que sobrar.
 */
export function scheduleEmailDispatch(origin: string): void {
  if (!hasAdminClient() || !isEmailConfigured()) return;
  try {
    after(async () => {
      try {
        await drainEmailOutbox(createAdminClient(), origin, 15_000);
      } catch (error) {
        console.warn("[email] envio após a ação falhou; fica para o cron", error instanceof Error ? error.message : String(error));
      }
    });
  } catch (error) {
    console.warn("[email] envio não agendado", error instanceof Error ? error.message : String(error));
  }
}

/** Atalho das server actions: origem pública do app (para o link do e-mail) + envio depois da resposta. */
export async function dispatchWorkEmails(): Promise<void> {
  if (!hasAdminClient() || !isEmailConfigured()) return;
  try {
    scheduleEmailDispatch(await getOrigin());
  } catch (error) {
    console.warn("[email] origem indisponível; fica para o cron", error instanceof Error ? error.message : String(error));
  }
}
