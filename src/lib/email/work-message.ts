// E-mail dos avisos de trabalho (0084), lógica pura testada em tests/unit/assinatura.test.ts. Os textos vêm de
// messages/<locale>/email.json → work; o link é absoluto (origem do app + caminho do aviso, já validado pelo banco).
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import type { Locale } from "@/i18n/config";
import { safeInboxLink } from "@/lib/inbox/kinds";
import { escapeHtml } from "./escape";

/** Tipos de aviso que têm texto de e-mail (o banco decide quem entra na fila: public.inbox_kind_emails). */
export const WORK_EMAIL_KINDS = [
  "opportunity_received",
  "opportunity_updated",
  "deliverable_decided",
  "deliverable_submitted",
  "contract_acceptance_requested",
  "task_due_soon",
  // oportunidade de patrocínio (0085)
  "sponsorship_published",
  "sponsorship_interest",
  "sponsorship_decided",
  // negociação das cotas (0088)
  "sponsorship_negotiation",
  // chamada da marca (0089)
  "brand_call_published",
  "brand_call_interest",
  "brand_call_negotiation",
  "brand_call_decided",
  // pedido de alteração de verba e pagamentos da marca (0090)
  "budget_change",
  "payment_reported",
  "payment_reviewed",
  "payment_due",
  "payment_plan",
] as const;
export type WorkEmailKind = (typeof WORK_EMAIL_KINDS)[number];

// tokens sempre presentes (vazio quando o aviso não traz), como no sino e no push
const TOKENS = ["name", "brand", "deal", "talent", "step", "date", "status", "title", "tier"] as const;

export type WorkEmail = { subject: string; text: string; html: string };

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "2026-11-03 14:00" (fuso da agência, vindo do banco) → "03/11/2026 14:00" (pt-BR/es) ou "11/03/2026 14:00" (en). */
export function formatLocalStamp(value: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  const date = locale === "en" ? `${mo}/${d}/${y}` : `${d}/${mo}/${y}`;
  return h ? `${date} ${h}:${mi}` : date;
}

export function isWorkEmailKind(kind: string): kind is WorkEmailKind {
  return (WORK_EMAIL_KINDS as readonly string[]).includes(kind);
}

/** Monta assunto, texto e HTML; null se o tipo não tem e-mail. */
export function buildWorkEmail(input: { kind: string; params: Record<string, string>; link: string; origin: string; locale: Locale; messages: AbstractIntlMessages }): WorkEmail | null {
  if (!isWorkEmailKind(input.kind)) return null;
  const t = (createTranslator as unknown as (config: { locale: Locale; messages: AbstractIntlMessages; namespace: string }) => Translate)({
    locale: input.locale,
    messages: input.messages,
    namespace: "work",
  });
  const values: Record<string, string> = Object.fromEntries(TOKENS.map((k) => [k, (input.params[k] ?? "").slice(0, 120)]));
  if (values.date) values.date = formatLocalStamp(values.date, input.locale);
  const url = `${input.origin.replace(/\/+$/, "")}${safeInboxLink(input.link)}`;
  const subject = t(`kinds.${input.kind}.subject`, values);
  const body = t(`kinds.${input.kind}.body`, values);
  const cta = t(`kinds.${input.kind}.cta`);
  const lines = [t("greeting"), body, `${cta}: ${url}`, t("prefs"), t("signature")];
  const text = lines.join("\n\n");
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;padding:24px;background:#0b0b0b;color:#f3f3f3;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#151515;border:1px solid #2a2a2a;border-radius:16px;padding:28px">
<tr><td style="font-size:14px;letter-spacing:.2em;color:#ff5a1f;font-weight:700">GROSCOVE ULTRA</td></tr>
<tr><td style="padding-top:16px;font-size:16px">${escapeHtml(lines[0])}</td></tr>
<tr><td style="padding-top:12px;font-size:16px">${escapeHtml(body)}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#ff5a1f;color:#111;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${escapeHtml(cta)}</a></td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#b9b9b9">${escapeHtml(url)}</td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[3])}</td></tr>
<tr><td style="padding-top:24px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[4])}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
