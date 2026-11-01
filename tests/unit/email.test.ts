import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendInviteEmail } from "@/lib/email/invite";
import { escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email/server";

// E-mail transacional pelo Resend (HTTP): sem chave e remetente nada sai (as telas ficam com o link);
// configurado, o pedido leva remetente, destinatário, assunto, texto e HTML; recusa e rede viram códigos.

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string, values?: Record<string, unknown>) => `${namespace}.${key}${values ? JSON.stringify(values) : ""}`,
}));

const calls: { url: string; init: RequestInit }[] = [];
let status = 200;
let body: unknown = { id: "re_123" };

beforeEach(() => {
  calls.length = 0;
  status = 200;
  body = { id: "re_123" };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});
afterEach(() => vi.unstubAllGlobals());

describe("sendEmail", () => {
  it("sem chave ou sem remetente: not_configured, nenhum pedido", async () => {
    expect(isEmailConfigured()).toBe(false);
    expect(await sendEmail({ to: "a@b.c", subject: "x", text: "y", html: "<p>y</p>" })).toEqual({ ok: false, error: "not_configured" });
    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailConfigured()).toBe(false);
    expect(calls).toEqual([]);
  });

  it("configurado: POST na API do Resend com remetente, destinatário, assunto, texto e HTML", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Groscove Ultra <convites@exemplo.com.br>";
    expect(await sendEmail({ to: "pessoa@exemplo.com", subject: "Olá", text: "txt", html: "<p>txt</p>", replyTo: "resp@exemplo.com" })).toEqual({ ok: true, id: "re_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: "Groscove Ultra <convites@exemplo.com.br>", to: ["pessoa@exemplo.com"], subject: "Olá", text: "txt", html: "<p>txt</p>", reply_to: "resp@exemplo.com" });
  });

  it("provedor recusa (4xx/5xx): rejected; falha de rede: network", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "x@y.z";
    status = 422;
    expect(await sendEmail({ to: "a@b.c", subject: "x", text: "y", html: "y" })).toEqual({ ok: false, error: "rejected" });
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET");
    });
    expect(await sendEmail({ to: "a@b.c", subject: "x", text: "y", html: "y" })).toEqual({ ok: false, error: "network" });
  });

  it("escapeHtml neutraliza marcação em nomes vindos de cadastro", () => {
    expect(escapeHtml(`<b onclick="x">Agência & "Cia"</b>`)).toBe("&lt;b onclick=&quot;x&quot;&gt;Agência &amp; &quot;Cia&quot;&lt;/b&gt;");
  });
});

describe("sendInviteEmail", () => {
  it("sem provedor devolve false sem pedir tradução nem enviar", async () => {
    expect(await sendInviteEmail({ to: "a@b.c", link: "https://app/invite?token=t", scopeName: "Quantso", roleLabel: "Adm", days: 7 })).toBe(false);
    expect(calls).toEqual([]);
  });

  it("configurado: assunto com o escopo, link no texto e no botão, HTML escapado", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "x@y.z";
    expect(await sendInviteEmail({ to: "a@b.c", link: "https://app/invite?token=t&x=1", scopeName: "Marca <X>", roleLabel: "Dono da marca", days: 14 })).toBe(true);
    const sent = JSON.parse(String(calls[0].init.body)) as { subject: string; text: string; html: string; to: string[] };
    expect(sent.to).toEqual(["a@b.c"]);
    expect(sent.subject).toContain("Marca <X>");
    expect(sent.text).toContain("https://app/invite?token=t&x=1");
    expect(sent.text).toContain('{"days":14}');
    expect(sent.html).toContain('href="https://app/invite?token=t&amp;x=1"');
    expect(sent.html).not.toContain("<X>");
  });
});
