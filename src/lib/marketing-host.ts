// Domínio próprio do teaser (docs/dominio-teaser.md). Módulo puro: usado pelo middleware, pela página e pelos testes.
//
// MARKETING_HOSTS="groscoveultra.com,www.groscoveultra.com" (lista separada por vírgula) liga o "modo teaser" nesses
// hosts: "/" mostra o teaser (/conheca, sem mudar o endereço) e qualquer rota do app (/login, /personalities,
// /agencia…) volta para "/". Só passam o teaser (/conheca/*), as páginas legais (/legal/*) e o que o Next precisa
// (/_next/*, arquivos estáticos — o matcher do middleware já os deixa de fora). O formulário é server action
// (POST na própria página), então não precisa de nenhuma /api.
// Sem a variável (ou com host fora da lista), nada muda.
//
// MARKETING_APP_URL="https://app.groscoveultra.com" (opcional): para onde vai o "Já tenho acesso" do teaser quando ele
// é aberto num host de marketing (lá o /login não existe). Sem ela, o link some nesses hosts.

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  return typeof process === "undefined" ? {} : process.env;
}

/** "HTTPS://www.Dominio.com:443/" → "www.dominio.com" (sem protocolo, porta, caminho nem ponto final). */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  let v = raw.trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.split("/")[0] ?? "";
  // IPv6 entre colchetes fica como está; senão tira a porta
  if (!v.startsWith("[")) v = v.replace(/:\d+$/, "");
  return v.replace(/\.$/, "");
}

/** Lista de hosts do teaser (vazia = modo desligado). */
export function parseMarketingHosts(env: Env = defaultEnv()): string[] {
  const raw = env.MARKETING_HOSTS ?? "";
  return Array.from(new Set(raw.split(",").map(normalizeHost).filter(Boolean)));
}

export function isMarketingHost(host: string | null | undefined, hosts: readonly string[]): boolean {
  if (hosts.length === 0) return false;
  const h = normalizeHost(host);
  return h !== "" && hosts.includes(h);
}

/** Host da requisição (o proxy da Vercel põe o original em x-forwarded-host). */
export function requestHost(headers: Headers, fallback?: string): string {
  return normalizeHost(headers.get("x-forwarded-host")?.split(",")[0] ?? headers.get("host") ?? fallback ?? "");
}

export const MARKETING_TEASER_PATH = "/conheca";

const ALLOWED_PREFIXES = ["/conheca", "/legal", "/_next"] as const;
// arquivos que o navegador pede sozinho (a maioria nem passa pelo middleware: veja o matcher)
const ALLOWED_EXACT = new Set(["/favicon.ico", "/icon.svg", "/apple-icon.png", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/sw.js"]);

/** O que um host de marketing faz com o caminho pedido. */
export type MarketingDecision = { action: "rewrite"; pathname: string } | { action: "next" } | { action: "redirect"; pathname: string };

export function marketingDecision(pathname: string): MarketingDecision {
  if (pathname === "/" || pathname === "") return { action: "rewrite", pathname: MARKETING_TEASER_PATH };
  // "Pular e explorar" leva ao app: num host de marketing não existe
  if (pathname === "/conheca/explorar" || pathname.startsWith("/conheca/explorar/")) return { action: "redirect", pathname: "/" };
  if (ALLOWED_EXACT.has(pathname)) return { action: "next" };
  if (ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return { action: "next" };
  return { action: "redirect", pathname: "/" };
}

/** URL do app para o "Já tenho acesso" (só http/https; inválida = null). */
export function marketingAppUrl(env: Env = defaultEnv()): string | null {
  const raw = env.MARKETING_APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Destino do "Já tenho acesso": relativo no app; no host de marketing, o app configurado (ou nenhum). */
export function haveAccessHref(input: { marketing: boolean; appUrl: string | null; loginPath: string }): string | null {
  if (!input.marketing) return input.loginPath;
  return input.appUrl ? `${input.appUrl}${input.loginPath}` : null;
}
