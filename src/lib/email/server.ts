import "server-only";

// E-mail transacional (convites). Provedor: Resend, pela API HTTP (sem SDK). Configuração por ambiente:
//   RESEND_API_KEY  chave do serviço (nunca vai ao navegador)
//   EMAIL_FROM      remetente verificado no domínio, ex.: "Groscove Ultra <convites@groscove.com.br>"
// Sem as duas, nada é enviado e as telas seguem com o link para copiar (comportamento anterior).

const RESEND_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export type EmailMessage = { to: string; subject: string; text: string; html: string; replyTo?: string };
export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: "not_configured" | "rejected" | "network" };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, error: "not_configured" };
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html, ...(message.replyTo ? { reply_to: message.replyTo } : {}) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // o corpo do provedor nunca vai para a tela; só o status no log do servidor
      console.warn("[email] provedor recusou o envio:", response.status);
      return { ok: false, error: "rejected" };
    }
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: typeof data?.id === "string" ? data.id : null };
  } catch (error) {
    console.warn("[email] envio falhou:", error instanceof Error ? error.message : error);
    return { ok: false, error: "network" };
  }
}

/** Escapa texto para o HTML do e-mail (nomes e assuntos vêm de cadastro). */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
