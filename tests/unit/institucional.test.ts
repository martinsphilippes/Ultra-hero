import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_POINTS, FAQ_ITEMS, FEATURE_GROUPS, HOW_STEPS, SECTION_ANCHORS, WHAT_ITEMS } from "@/lib/institutional/content";
import { EXPLORE_COOKIE, INSTITUTIONAL_PATH, rootDestination, rootNeedsSessionCheck } from "@/lib/institutional/root";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";

// Etapa 7 · página institucional (/conheca) e o destino do "/".

const session = vi.hoisted(() => ({ signedIn: false, checks: 0 }));

vi.mock("@/lib/supabase/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return { updateSession: async (request: NextRequest) => NextResponse.next({ request }) };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => {
        session.checks += 1;
        return { data: session.signedIn ? { claims: { sub: "u1" } } : null, error: null };
      },
    },
  }),
}));

const { middleware } = await import("@/middleware");
const { GET: exploreGet } = await import("@/app/conheca/explorar/route");

const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const NATIVE_UA = `${BROWSER_UA} GCHeroApp/1.4.0 (ios)`;

function request(url: string, { ua = BROWSER_UA, cookie }: { ua?: string; cookie?: string } = {}) {
  const headers = new Headers({ "user-agent": ua });
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(url, "https://ultra.example"), { headers });
}

function location(res: Response) {
  const loc = res.headers.get("location");
  return loc ? new URL(loc) : null;
}

beforeEach(() => {
  session.signedIn = false;
  session.checks = 0;
});

describe("destino do endereço principal (regra pura)", () => {
  it("logado → aba Hero; visitante → apresentação; app das lojas → aba Hero", () => {
    expect(rootDestination({ signedIn: true, nativeApp: false, explored: false })).toBe("/personalities");
    expect(rootDestination({ signedIn: false, nativeApp: false, explored: false })).toBe(INSTITUTIONAL_PATH);
    expect(rootDestination({ signedIn: false, nativeApp: true, explored: false })).toBe("/personalities");
    expect(rootDestination({ signedIn: false, nativeApp: false, explored: true })).toBe("/personalities");
  });
  it("só confere a sessão quando ela decide", () => {
    expect(rootNeedsSessionCheck({ nativeApp: false, explored: false })).toBe(true);
    expect(rootNeedsSessionCheck({ nativeApp: true, explored: false })).toBe(false);
    expect(rootNeedsSessionCheck({ nativeApp: false, explored: true })).toBe(false);
  });
});

describe("middleware no \"/\"", () => {
  it("visitante sem sessão vê a apresentação (307, mantém a query)", async () => {
    const res = await middleware(request("/?utm_source=x"));
    expect(res.status).toBe(307);
    expect(location(res)?.pathname).toBe("/conheca");
    expect(location(res)?.search).toBe("?utm_source=x");
    expect(session.checks).toBe(1);
  });
  it("logado continua indo direto à aba Hero", async () => {
    session.signedIn = true;
    const res = await middleware(request("/"));
    expect(res.status).toBe(307);
    expect(location(res)?.pathname).toBe("/personalities");
  });
  it("app das lojas vai direto ao app, sem página de marketing (nem confere a sessão)", async () => {
    const res = await middleware(request("/", { ua: NATIVE_UA }));
    expect(location(res)?.pathname).toBe("/personalities");
    expect(session.checks).toBe(0);
  });
  it("quem escolheu \"Pular e explorar\" volta ao app pelo logo", async () => {
    const res = await middleware(request("/", { cookie: `${EXPLORE_COOKIE}=1` }));
    expect(location(res)?.pathname).toBe("/personalities");
    expect(session.checks).toBe(0);
  });
  it("/conheca é pública na web e bloqueada no app das lojas", async () => {
    const web = await middleware(request("/conheca"));
    expect(web.headers.get("location")).toBeNull();
    expect(session.checks).toBe(0);
    const native = await middleware(request("/conheca", { ua: NATIVE_UA }));
    expect(location(native)?.pathname).toBe("/personalities");
    expect(isBlockedInNativeApp("/conheca")).toBe(true);
    expect(isBlockedInNativeApp("/conheca/explorar")).toBe(true);
  });
  it("rotas protegidas seguem exigindo sessão (autenticação inalterada)", async () => {
    const res = await middleware(request("/heroi"));
    expect(location(res)?.pathname).toBe("/login");
    expect(location(res)?.searchParams.get("next")).toBe("/heroi");
    session.signedIn = true;
    const ok = await middleware(request("/heroi"));
    expect(ok.headers.get("location")).toBeNull();
  });
});

describe("\"Pular e explorar\"", () => {
  it("grava a escolha e leva à aba Hero", () => {
    const res = exploreGet(request("/conheca/explorar"));
    expect(res.status).toBe(303);
    expect(location(res)?.pathname).toBe("/personalities");
    const cookie = res.cookies.get(EXPLORE_COOKIE);
    expect(cookie?.value).toBe("1");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");
  });
});

describe("configuração", () => {
  const root = process.cwd();
  it("o next.config não redireciona mais \"/\" fixo", () => {
    const config = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(config).not.toMatch(/source:\s*"\/",/);
  });
  it("a página recebe os temas sazonais da área institucional e não mexe na abertura animada", () => {
    const page = readFileSync(path.join(root, "src/app/conheca/page.tsx"), "utf8");
    expect(page).toContain('<SeasonalTheme area="institutional" />');
    expect(page).not.toContain("AppIntro");
    expect(page).not.toMatch(/<img\b|next\/image/);
  });
});

// ------------------------------------------------------------------ textos
type Tree = Record<string, unknown>;
const LOCALES = ["pt-BR", "en", "es"] as const;
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(process.cwd(), "messages", l, "institutional.json"), "utf8")) as Tree]),
) as Record<(typeof LOCALES)[number], Tree>;

function get(tree: Tree, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Tree)[part] : undefined), tree);
}

function usedKeys(): string[] {
  const keys = ["meta.title", "meta.description", "nav.signup", "nav.login", "nav.skip", "nav.openApp", "nav.sections", "hero.title", "hero.lead", "final.title", "final.lead", "footer.rights"];
  for (const k of WHAT_ITEMS) keys.push(`what.items.${k}.title`, `what.items.${k}.body`);
  for (const k of HOW_STEPS) keys.push(`how.steps.${k}.title`, `how.steps.${k}.body`);
  for (const g of FEATURE_GROUPS) {
    keys.push(`${g.ns}.title`, `${g.ns}.lead`);
    for (const i of g.items) keys.push(`${g.ns}.items.${i.key}.title`, `${g.ns}.items.${i.key}.body`);
  }
  for (const k of CALENDAR_POINTS) keys.push(`calendar.points.${k}`);
  for (const k of FAQ_ITEMS) keys.push(`faq.items.${k}.q`, `faq.items.${k}.a`);
  for (const a of SECTION_ANCHORS) keys.push(a.labelKey);
  return keys;
}

function allStrings(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (tree && typeof tree === "object") return Object.values(tree).flatMap(allStrings);
  return [];
}

describe("textos da página institucional", () => {
  it.each(LOCALES)("%s tem todos os textos usados pela página", (locale) => {
    for (const key of usedKeys()) expect(typeof get(messages[locale], key), `${locale}: ${key}`).toBe("string");
  });
  it("pt-BR traz a proposta de valor, as seções pedidas e os CTAs", () => {
    const pt = messages["pt-BR"];
    expect(get(pt, "hero.title")).toBe("A plataforma onde marca, herói e agência fecham negócio rápido.");
    expect(get(pt, "nav.signup")).toBe("Criar conta");
    expect(get(pt, "nav.login")).toBe("Entrar");
    expect(get(pt, "nav.skip")).toBe("Pular e explorar");
    expect(get(pt, "what.title")).toBe("O que é o Ultra");
    expect(get(pt, "calendar.title")).toBe("Calendário Groscove");
    expect(get(pt, "agency.items.castBuilder.title")).toBe("Montador de elenco");
    expect(String(get(pt, "agency.items.agenda.title"))).toContain("Real-Time Culture");
  });
  it.each(LOCALES)("%s não promete o que não existe: pagamentos ainda não ativados, sem demo/creator", (locale) => {
    const texts = allStrings(messages[locale]);
    for (const text of texts) {
      expect(text).not.toMatch(/demonstra|\bdemo\b|simulad|simulat|creator/i);
    }
    const notEnabled = { "pt-BR": /ainda não ativad/i, en: /not enabled yet/i, es: /aún no activad/i }[locale];
    expect(String(get(messages[locale], "brands.items.budget.body"))).toMatch(notEnabled);
    expect(String(get(messages[locale], "heroes.items.finance.body"))).toMatch(notEnabled);
    expect(String(get(messages[locale], "faq.items.data.a"))).toMatch(/<privacy>.+<\/privacy>/);
  });
  it("cada recurso citado aponta para uma rota que existe no app", () => {
    const routes = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx") {
          const rel = path.relative(path.join(process.cwd(), "src/app"), path.dirname(full));
          // grupos de rota "(x)" não entram no endereço
          routes.add("/" + rel.split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s)).join("/"));
        }
      }
    };
    walk(path.join(process.cwd(), "src/app"));
    for (const g of FEATURE_GROUPS) for (const item of g.items) expect(routes.has(item.route), item.route).toBe(true);
  });
});
