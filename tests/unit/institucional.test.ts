import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPLORE_COOKIE, INSTITUTIONAL_PATH, rootDestination, rootNeedsSessionCheck } from "@/lib/institutional/root";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";

// Etapa 7 · página institucional (/conheca, hoje o teaser de lançamento) e o destino do "/".

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
  it("as duas portas do teaser recebem os temas sazonais da área institucional e não mexem na abertura animada", () => {
    for (const file of ["src/app/conheca/page.tsx", "src/app/conheca/influenciador/page.tsx"]) {
      const page = readFileSync(path.join(root, file), "utf8");
      expect(page).toContain('<SeasonalTheme area="institutional" />');
      expect(page).not.toContain("AppIntro");
      expect(page).not.toMatch(/<img\b|next\/image/);
    }
    const teaser = readFileSync(path.join(root, "src/components/launch/LaunchTeaser.tsx"), "utf8");
    expect(teaser).not.toMatch(/<img\b|next\/image/);
    // não há porta para empresas
    expect(teaser).not.toMatch(/conheca\/empresa|kind="empresa"/);
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

function allStrings(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (tree && typeof tree === "object") return Object.values(tree).flatMap(allStrings);
  return [];
}

const USED_KEYS = [
  "meta.title",
  "meta.description",
  "meta.influencerTitle",
  "meta.influencerDescription",
  "countdown.units.days",
  "countdown.units.hours",
  "countdown.units.minutes",
  "countdown.units.seconds",
  "countdown.srCountdown",
  "teaser.eyebrow",
  "teaser.title",
  "teaser.influencer",
  "teaser.back",
  "teaser.backLabel",
  "teaser.haveAccess",
  "teaser.rights",
  "teaser.countdownTitle",
  "influencer.eyebrow",
  "influencer.title",
  "influencer.benefitsTitle",
  "influencer.benefits.brands",
  "influencer.benefits.work",
  "influencer.benefits.page",
  "form.title",
  "form.name",
  "form.phone",
  "form.email",
  "form.instagram",
  "form.consent",
  "form.privacy",
  "form.submit",
  "form.success",
  ...["required", "nameInvalid", "phoneInvalid", "emailInvalid", "consentRequired", "instagramInvalid", "tooMany", "unavailable", "unknown"].map((k) => `form.errors.${k}`),
];

describe("textos do teaser de lançamento", () => {
  it.each(LOCALES)("%s tem todos os textos usados pelo teaser", (locale) => {
    for (const key of USED_KEYS) expect(typeof get(messages[locale], key), `${locale}: ${key}`).toBe("string");
  });
  it("pt-BR traz a frase, o formulário e o sucesso pedidos pelo dono", () => {
    const pt = messages["pt-BR"];
    expect(get(pt, "teaser.title")).toBe("A rede social das celebridades está chegando.");
    expect(get(pt, "teaser.influencer")).toBe("Sou influenciador");
    expect(get(pt, "teaser.haveAccess")).toBe("Já tenho acesso");
    expect(get(pt, "influencer.title")).toBe("Um ecossistema inteiro que conecta você a marcas e empresas.");
    expect(get(pt, "form.title")).toBe("Seja o primeiro a saber");
    expect(get(pt, "form.consent")).toBe("Aceito receber novidades do Groscove Ultra.");
    expect(get(pt, "form.submit")).toBe("Quero saber primeiro");
    expect(get(pt, "form.success")).toBe("Pronto. Você vai saber antes de todo mundo.");
  });
  it.each(LOCALES)("%s não explica o produto nem promete o que não existe (sem demo/creator/simulado/agência/pagamento)", (locale) => {
    for (const text of allStrings(messages[locale])) {
      expect(text).not.toMatch(/demonstra|\bdemo\b|simulad|simulat|creator|ag[eê]nci|agency|pagamento|payment|pago\b/i);
    }
    expect(String(get(messages[locale], "form.privacy"))).toMatch(/<privacy>.+<\/privacy>/);
    // metadados sem spoiler: nada de portal, marca/herói/agência
    const meta = [get(messages[locale], "meta.title"), get(messages[locale], "meta.description")].join(" ");
    expect(meta).not.toMatch(/portal|her[oó]i|hero|marca/i);
  });
});
