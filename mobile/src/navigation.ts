// Regras de navegação da casca (puras, testadas em tests/navigation.test.ts).

export type NavigationDecision = "load" | "browser" | "system" | "block";

const SYSTEM_SCHEMES = new Set(["mailto:", "tel:", "sms:", "maps:", "geo:"]);

/**
 * O que fazer com uma navegação da WebView. Só o próprio site roda dentro da casca: outro domínio no
 * quadro principal abre no navegador do app (a casca nunca vira navegador genérico, e o Google
 * recusa OAuth em WebView). Iframes (player de vídeo) carregam.
 */
export function decideNavigation(url: string, origin: string, isTopFrame: boolean): NavigationDecision {
  if (url === "about:blank" || url.startsWith("about:srcdoc")) return "load";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "block";
  }
  if (SYSTEM_SCHEMES.has(parsed.protocol)) return "system";
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "block";
  if (!isTopFrame) return "load";
  return parsed.origin === origin ? "load" : "browser";
}

/** Caminho relativo seguro do próprio site ("/x"), nunca "//host" nem "/\host". */
function safePath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/[\u0000-\u001F\u007F]/.test(path)) return null;
  return path;
}

/** Caminho do site (vindo de um aviso de push) → endereço que a WebView abre; null se não for seguro. */
export function webUrlFromPath(path: string | null | undefined, origin: string): string | null {
  const safe = safePath(path ?? null);
  return safe ? `${origin}${safe}` : null;
}

/** Link gchero:// → endereço do site que a WebView abre; null quando não é nosso ou não é seguro. */
export function webUrlFromDeepLink(link: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  if (parsed.protocol !== "gchero:") return null;
  // gchero://auth/callback?… → host "auth", pathname "/callback"
  const route = `${parsed.host}${parsed.pathname}`;
  if (route === "auth/callback") return `${origin}/auth/callback${parsed.search}`;
  if (route === "open" || route === "open/") {
    const path = safePath(parsed.searchParams.get("path"));
    return path ? `${origin}${path}` : null;
  }
  return null;
}
