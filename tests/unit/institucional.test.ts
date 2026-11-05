import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_POINTS, FAQ_ITEMS, FEATURE_GROUPS, HOW_STEPS, SECTION_ANCHORS, WHAT_ITEMS } from "@/lib/about-classic/content";
import { ABOUT_ENABLED, ABOUT_PATH, EXPLORE_COOKIE, TEASER_ENABLED, INSTITUTIONAL_PATH, rootDestination, rootNeedsSessionCheck } from "@/lib/institutional/root";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";

// Etapa 7 · página institucional (/conheca, hoje o teaser de lançamento), o destino do "/" e a apresentação
// completa restaurada em /sobre (a antiga /conheca, branch ultra-classico).

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
  it("/sobre (apresentação completa) é pública na web, sem checar sessão, e bloqueada no app das lojas", async () => {
    expect(ABOUT_PATH).toBe("/sobre");
    const web = await middleware(request("/sobre"));
    expect(web.headers.get("location")).toBeNull();
    expect(session.checks).toBe(0);
    const native = await middleware(request("/sobre", { ua: NATIVE_UA }));
    expect(location(native)?.pathname).toBe("/personalities");
    expect(isBlockedInNativeApp("/sobre")).toBe(true);
    expect(isBlockedInNativeApp("/sobremesa")).toBe(false);
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
    expect(get(pt, "teaser.title")).toBe("A rede wellness das celebridades está chegando.");
    expect(get(pt, "teaser.influencer")).toBe("Sou influenciador");
    // o "Já tenho acesso" saiu do rodapé (pedido do dono, 04/11): o texto não existe mais em nenhum idioma
    for (const locale of LOCALES) expect(get(messages[locale], "teaser.haveAccess")).toBeUndefined();
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

// ------------------------------------------------------------------ /sobre (apresentação clássica)
const about = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(process.cwd(), "messages", l, "aboutClassic.json"), "utf8")) as Tree]),
) as Record<(typeof LOCALES)[number], Tree>;

function aboutKeys(): string[] {
  const keys = ["meta.title", "meta.description", "nav.signup", "nav.login", "nav.skip", "nav.openApp", "nav.sections", "nav.home", "hero.eyebrow", "hero.title", "hero.lead", "hero.signedIn", "what.title", "what.lead", "how.title", "how.lead", "how.note", "calendar.title", "calendar.lead", "faq.title", "final.title", "final.lead", "footer.rights", "switcher.label", "switcher.app", "switcher.seeAll", "app.cta"];
  for (const k of WHAT_ITEMS) keys.push(`what.items.${k}.title`, `what.items.${k}.body`);
  for (const k of HOW_STEPS) keys.push(`how.steps.${k}.title`, `how.steps.${k}.body`);
  for (const g of FEATURE_GROUPS) {
    keys.push(`${g.ns}.title`, `${g.ns}.lead`, `interlude.${g.ns}`);
    for (const i of g.items) keys.push(`${g.ns}.items.${i.key}.title`, `${g.ns}.items.${i.key}.body`);
  }
  for (const k of CALENDAR_POINTS) keys.push(`calendar.points.${k}`);
  for (const k of FAQ_ITEMS) keys.push(`faq.items.${k}.q`, `faq.items.${k}.a`);
  for (const a of SECTION_ANCHORS) keys.push(a.labelKey);
  return keys;
}

describe("/sobre · Conheça o Groscove Ultra (apresentação clássica)", () => {
  const root = process.cwd();
  it.each(LOCALES)("%s tem todos os textos usados pela página", (locale) => {
    for (const key of aboutKeys()) expect(typeof get(about[locale], key), `${locale}: ${key}`).toBe("string");
  });
  it("pt-BR traz o título, a proposta de valor e as seções de antes", () => {
    const pt = about["pt-BR"];
    expect(get(pt, "meta.title")).toBe("Conheça o Groscove Ultra");
    expect(get(pt, "hero.title")).toBe("A plataforma onde marca, herói e agência fecham negócio rápido.");
    expect(get(pt, "what.title")).toBe("O que é o Ultra");
    expect(get(pt, "calendar.title")).toBe("Calendário Groscove");
    expect(get(pt, "agency.items.castBuilder.title")).toBe("Montador de elenco");
  });
  it.each(LOCALES)("%s não promete o que não existe: pagamentos ainda não ativados, sem demo", (locale) => {
    for (const text of allStrings(about[locale])) expect(text).not.toMatch(/demonstra|\bdemo\b|simulad|simulat/i);
    const notEnabled = { "pt-BR": /ainda não ativad/i, en: /not enabled yet/i, es: /aún no activad/i }[locale];
    expect(String(get(about[locale], "brands.items.budget.body"))).toMatch(notEnabled);
    expect(String(get(about[locale], "heroes.items.finance.body"))).toMatch(notEnabled);
    expect(String(get(about[locale], "faq.items.data.a"))).toMatch(/<privacy>.+<\/privacy>/);
  });
  it("cada recurso citado aponta para uma rota que existe no app", () => {
    const routes = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx") {
          const rel = path.relative(path.join(root, "src/app"), path.dirname(full));
          routes.add("/" + rel.split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s)).join("/"));
        }
      }
    };
    walk(path.join(root, "src/app"));
    expect(routes.has(ABOUT_PATH)).toBe(true);
    for (const g of FEATURE_GROUPS) for (const item of g.items) expect(routes.has(item.route), item.route).toBe(true);
  });
  it("página com metadados próprios, canônico /sobre, animações com prefixo próprio e sem tocar no teaser", () => {
    const page = readFileSync(path.join(root, "src/app/sobre/page.tsx"), "utf8");
    expect(page).toContain('getTranslations("aboutClassic.meta")');
    expect(page).toContain("canonical: ABOUT_PATH");
    expect(page).toContain('<SeasonalTheme area="institutional" />');
    expect(page).not.toMatch(/<img\b|next\/image|LaunchTeaser|AppIntro/);
    // sem colisão com a abertura do app (intro.css) e o teaser: tudo com uh-sb-
    const css = readFileSync(path.join(root, "src/app/sobre/sobre.css"), "utf8");
    for (const name of css.match(/@keyframes\s+([\w-]+)/g) ?? []) expect(name).toMatch(/@keyframes uh-sb-/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });
  it("/sobre no ar e teaser (/conheca, /conheca/influenciador) oculto com 404", () => {
    expect(ABOUT_ENABLED).toBe(true);
    expect(TEASER_ENABLED).toBe(false);
    for (const f of ["src/app/conheca/page.tsx", "src/app/conheca/influenciador/page.tsx"]) {
      expect(readFileSync(path.join(root, f), "utf8")).toContain("if (!TEASER_ENABLED) notFound();");
    }
  });
  it("links internos para a explicação do produto levam a /sobre (não ao teaser)", () => {
    const settings = readFileSync(path.join(root, "src/app/(app)/configuracoes/page.tsx"), "utf8");
    expect(settings).toContain("href={ABOUT_PATH}");
    expect(settings).not.toMatch(/["'`]\/conheca/);
  });
});
