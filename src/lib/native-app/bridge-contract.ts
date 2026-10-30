// Contrato das mensagens entre a web e a casca das lojas (mobile/). Sem import: a casca importa este
// mesmo arquivo (mobile/metro.config.js), então os dois lados não divergem.
//
// web → casca: window.ReactNativeWebView.postMessage(JSON.stringify(mensagem))
// casca → web: window.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: mensagem }))

export const NATIVE_EVENT = "gchero:native";

export type WebToNative =
  /** Abre o login OAuth (Google) no navegador do sistema; o Google recusa WebView. */
  | { type: "oauth"; url: string }
  /** Sign in with Apple nativo (só iOS). */
  | { type: "apple-signin" }
  /** Folha de compartilhar do sistema (a WebView do Android não tem navigator.share). */
  | { type: "share"; title?: string; text?: string; url?: string }
  /** Tema da página, para a barra de status do sistema acompanhar (claro/escuro). */
  | { type: "theme"; theme: "light" | "dark" };

export type NativeToWeb =
  | { type: "oauth-result"; ok: false; reason: "canceled" | "error" }
  /** fullName só vem no primeiro login da pessoa com a Apple (a Apple não manda de novo). */
  | { type: "apple-result"; ok: true; token: string; nonce: string; fullName?: string }
  | { type: "apple-result"; ok: false; reason: "canceled" | "unavailable" | "error" };

const isString = (value: unknown): value is string => typeof value === "string";

// Só a tela de autorização do Supabase Auth abre pelo pedido de OAuth: a casca não vira abridor de
// endereço qualquer, mesmo que algo na página consiga falar com a ponte.
function isOAuthAuthorizeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.pathname === "/auth/v1/authorize";
  } catch {
    return false;
  }
}
const optionalString = (value: unknown) => value === undefined || isString(value);

/** Valida o que chega do outro lado; mensagem fora do contrato vira null e é ignorada. */
export function parseWebToNative(raw: string): WebToNative | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case "oauth":
      return isString(message.url) && isOAuthAuthorizeUrl(message.url) ? { type: "oauth", url: message.url } : null;
    case "apple-signin":
      return { type: "apple-signin" };
    case "share":
      if (!optionalString(message.title) || !optionalString(message.text) || !optionalString(message.url)) return null;
      return { type: "share", title: message.title as string | undefined, text: message.text as string | undefined, url: message.url as string | undefined };
    case "theme":
      return message.theme === "light" || message.theme === "dark" ? { type: "theme", theme: message.theme } : null;
    default:
      return null;
  }
}

export function parseNativeToWeb(detail: unknown): NativeToWeb | null {
  if (typeof detail !== "object" || detail === null) return null;
  const message = detail as Record<string, unknown>;
  if (message.type === "oauth-result" && message.ok === false && (message.reason === "canceled" || message.reason === "error")) {
    return { type: "oauth-result", ok: false, reason: message.reason };
  }
  if (message.type === "apple-result") {
    if (message.ok === true && isString(message.token) && isString(message.nonce) && optionalString(message.fullName)) {
      return { type: "apple-result", ok: true, token: message.token, nonce: message.nonce, ...(isString(message.fullName) ? { fullName: message.fullName } : {}) };
    }
    if (message.ok === false && (message.reason === "canceled" || message.reason === "unavailable" || message.reason === "error")) {
      return { type: "apple-result", ok: false, reason: message.reason };
    }
  }
  return null;
}
