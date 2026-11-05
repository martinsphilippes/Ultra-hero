import "server-only";
import { getTranslations } from "next-intl/server";
import type { AccessKind } from "@/lib/agency/access-contact";
import { escapeHtml, isEmailConfigured, sendEmail } from "./server";

// E-mail do acesso criado pela agência (0112). Hero: "a agência criou sua página/ficha de Hero; crie sua senha pelo
// link com este e-mail" (invited) ou "foi ligada à sua conta" (linked). Marca: o mesmo para o acesso de Dono da marca.
// Sem provedor configurado nada sai e a tela mostra o link para copiar (como os outros convites).

export type AccessEmailInput = {
  to: string;
  kind: AccessKind;
  outcome: "invited" | "linked";
  /** Nome do Hero ou da marca. */
  name: string;
  agencyName: string;
  link: string;
  days: number;
};

export async function sendAccessEmail(input: AccessEmailInput): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const t = await getTranslations("email.access");
  const base = `${input.kind === "talent" ? "hero" : "brand"}.${input.outcome}`;
  const values = { agency: input.agencyName, name: input.name, days: input.days };
  const subject = t(`${base}.subject`, values);
  const lines = [
    t("greeting"),
    t(`${base}.body`, values),
    t(`${base}.how`, values),
    t(`${base}.cta`),
    input.link,
    input.outcome === "invited" ? t("expires", values) : "",
    t("ignore"),
    t("signature"),
  ];
  const text = lines.filter(Boolean).join("\n\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#0b0b0b;color:#f3f3f3;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#151515;border:1px solid #2a2a2a;border-radius:16px;padding:28px">
<tr><td style="font-size:14px;letter-spacing:.2em;color:#ff5a1f;font-weight:700">GROSCOVE ULTRA</td></tr>
<tr><td style="padding-top:16px;font-size:16px">${escapeHtml(lines[0])}</td></tr>
<tr><td style="padding-top:12px;font-size:16px">${escapeHtml(lines[1])}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;color:#d6d6d6">${escapeHtml(lines[2])}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#ff5a1f;color:#111;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${escapeHtml(lines[3])}</a></td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[4])}</td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#b9b9b9">${lines[5] ? `${escapeHtml(lines[5])}<br>` : ""}${escapeHtml(lines[6])}</td></tr>
<tr><td style="padding-top:24px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[7])}</td></tr>
</table></td></tr></table></body></html>`;
  const result = await sendEmail({ to: input.to, subject, text, html });
  return result.ok;
}
