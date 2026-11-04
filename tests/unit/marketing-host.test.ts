import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  haveAccessHref,
  isMarketingHost,
  marketingAppUrl,
  marketingDecision,
  normalizeHost,
  parseMarketingHosts,
  requestHost,
} from "@/lib/marketing-host";

// Domínio próprio do teaser (MARKETING_HOSTS): regra pura e o middleware.

const session = vi.hoisted(() => ({ signedIn: false, refreshed: 0 }));

vi.mock("@/lib/supabase/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    updateSession: async (request: NextRequest) => {
      session.refreshed += 1;
      return NextResponse.next({ request });
    },
  };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: session.signedIn ? { claims: { sub: "u1" } } : null, error: null }) },
  }),
}));

const { middleware } = await import("@/middleware");

function request(url: string, host: string, extra: Record<string, string> = {}) {
  const headers = new Headers({ host, "user-agent": "Mozilla/5.0 (iPhone)", ...extra });
  return new NextRequest(new URL(url, `https://${host}`), { headers });
}

describe("regra de host (pura)", () => {
  it("normaliza host: protocolo, porta, maiúsculas, caminho e ponto final", () => {
    expect(normalizeHost("HTTPS://www.Dominio.com:443/x")).toBe("www.dominio.com");
    expect(normalizeHost(" dominio.com. ")).toBe("dominio.com");
    expect(normalizeHost("localhost:3000")).toBe("localhost");
    expect(normalizeHost(null)).toBe("");
  });
  it("lista vazia ou ausente = modo desligado", () => {
    expect(parseMarketingHosts({})).toEqual([]);
    expect(parseMarketingHosts({ MARKETING_HOSTS: " , " })).toEqual([]);
    expect(isMarketingHost("dominio.com", [])).toBe(false);
  });
  it("lista separada por vírgula, sem duplicatas, e casamento exato do host", () => {
    const hosts = parseMarketingHosts({ MARKETING_HOSTS: "dominio.com, WWW.dominio.com ,https://dominio.com" });
    expect(hosts).toEqual(["dominio.com", "www.dominio.com"]);
    expect(isMarketingHost("dominio.com:443", hosts)).toBe(true);
    expect(isMarketingHost("www.dominio.com", hosts)).toBe(true);
    expect(isMarketingHost("app.dominio.com", hosts)).toBe(false);
    expect(isMarketingHost("ultra-hero.vercel.app", hosts)).toBe(false);
  });
  it("host da requisição: x-forwarded-host primeiro", () => {
    expect(requestHost(new Headers({ host: "interno:3000", "x-forwarded-host": "Dominio.com, proxy" }))).toBe("dominio.com");
    expect(requestHost(new Headers({ host: "dominio.com" }))).toBe("dominio.com");
  });
  it("\"/\" vira o teaser; teaser, legais e arquivos do Next passam; o resto volta para \"/\"", () => {
    expect(marketingDecision("/")).toEqual({ action: "rewrite", pathname: "/conheca" });
    for (const p of ["/conheca", "/conheca/influenciador", "/legal/privacy", "/legal/terms", "/_next/static/x.js", "/manifest.webmanifest", "/favicon.ico"]) {
      expect(marketingDecision(p), p).toEqual({ action: "next" });
    }
    for (const p of ["/login", "/personalities", "/agencia", "/marca/campanhas", "/heroi", "/admin", "/api/cron/agency", "/conheca/explorar", "/conhecaX", "/legalx"]) {
      expect(marketingDecision(p), p).toEqual({ action: "redirect", pathname: "/" });
    }
  });
  it("\"Já tenho acesso\": relativo no app; no domínio do teaser, o app configurado ou nada", () => {
    expect(haveAccessHref({ marketing: false, appUrl: null, loginPath: "/login?mode=password" })).toBe("/login?mode=password");
    expect(haveAccessHref({ marketing: true, appUrl: "https://app.dominio.com", loginPath: "/login?mode=password" })).toBe("https://app.dominio.com/login?mode=password");
    expect(haveAccessHref({ marketing: true, appUrl: null, loginPath: "/login" })).toBeNull();
    expect(marketingAppUrl({ MARKETING_APP_URL: "https://app.dominio.com/qualquer" })).toBe("https://app.dominio.com");
    expect(marketingAppUrl({ MARKETING_APP_URL: "javascript:alert(1)" })).toBeNull();
    expect(marketingAppUrl({})).toBeNull();
  });
});

describe("middleware com MARKETING_HOSTS", () => {
  beforeEach(() => {
    session.signedIn = false;
    session.refreshed = 0;
    vi.stubEnv("MARKETING_HOSTS", "dominio.com,www.dominio.com");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("\"/\" mostra o teaser sem mudar o endereço (rewrite, com a query) e sem renovar sessão", async () => {
    const res = await middleware(request("/?utm_source=ig", "dominio.com"));
    expect(res.headers.get("location")).toBeNull();
    const rewrite = new URL(res.headers.get("x-middleware-rewrite") ?? "");
    expect(rewrite.pathname).toBe("/conheca");
    expect(rewrite.search).toBe("?utm_source=ig");
    expect(session.refreshed).toBe(0);
  });
  it("rotas do app voltam para \"/\" (mesmo logado)", async () => {
    session.signedIn = true;
    for (const p of ["/login", "/personalities", "/agencia", "/admin"]) {
      const res = await middleware(request(p, "www.dominio.com"));
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname, p).toBe("/");
    }
  });
  it("teaser e páginas legais abrem normalmente", async () => {
    for (const p of ["/conheca", "/conheca/influenciador", "/legal/privacy"]) {
      const res = await middleware(request(p, "dominio.com"));
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.headers.get("x-middleware-rewrite"), p).toBeNull();
    }
  });
  it("outro host (app.dominio.com) segue o comportamento de sempre", async () => {
    const res = await middleware(request("/", "app.dominio.com"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/conheca");
    const login = await middleware(request("/heroi", "app.dominio.com"));
    expect(new URL(login.headers.get("location")!).pathname).toBe("/login");
    expect(session.refreshed).toBe(2);
  });
  it("sem a variável nada muda", async () => {
    vi.stubEnv("MARKETING_HOSTS", "");
    const res = await middleware(request("/login", "dominio.com"));
    expect(res.headers.get("location")).toBeNull();
    expect(session.refreshed).toBe(1);
  });
});
