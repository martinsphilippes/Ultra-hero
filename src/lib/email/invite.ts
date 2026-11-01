import "server-only";
import { getTranslations } from "next-intl/server";
import { escapeHtml, isEmailConfigured, sendEmail } from "./server";

// E-mail do convite (agência, marca, talento): assunto e corpo no idioma de quem convida, com o link
// de aceite. O link continua aparecendo na tela: o e-mail é um caminho a mais, não o único.

export type InviteEmailInput = {
  to: string;
  link: string;
  /** Para onde a pessoa entra: nome da agência, da marca ou do talento. */
  scopeName: string;
  /** Papel por extenso (já traduzido pela tela que convida). */
  roleLabel: string;
  /** Dias de validade do link. */
  days: number;
};

/** Monta e envia; devolve se o e-mail saiu (false = sem provedor configurado ou envio recusado). */
export async function sendInviteEmail(input: InviteEmailInput): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const t = await getTranslations("email.invite");
  const subject = t("subject", { scope: input.scopeName });
  const lines = [t("greeting"), t("body", { scope: input.scopeName, role: input.roleLabel }), t("cta"), input.link, t("expires", { days: input.days }), t("ignore"), t("signature")];
  const text = lines.join("\n\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#0b0b0b;color:#f3f3f3;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#151515;border:1px solid #2a2a2a;border-radius:16px;padding:28px">
<tr><td style="font-size:14px;letter-spacing:.2em;color:#ff5a1f;font-weight:700">GROSCOVE ULTRA</td></tr>
<tr><td style="padding-top:16px;font-size:16px">${escapeHtml(lines[0])}</td></tr>
<tr><td style="padding-top:12px;font-size:16px">${escapeHtml(lines[1])}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#ff5a1f;color:#111;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${escapeHtml(lines[2])}</a></td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[3])}</td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[4])}<br>${escapeHtml(lines[5])}</td></tr>
<tr><td style="padding-top:24px;font-size:13px;color:#b9b9b9">${escapeHtml(lines[6])}</td></tr>
</table></td></tr></table></body></html>`;
  const result = await sendEmail({ to: input.to, subject, text, html });
  return result.ok;
}
