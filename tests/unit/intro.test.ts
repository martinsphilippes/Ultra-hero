import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIntroKeyframes, JOINTS, POSES } from "@/lib/intro/poses";
import { INTRO_COOLDOWN_MS, INTRO_DURATION_MS, INTRO_INIT_SCRIPT, INTRO_STORAGE_KEY } from "@/lib/intro/script";

type Listener = (e: Record<string, unknown>) => void;

// Navegador mínimo para rodar o script inicial da abertura no node.
function run({
  cookie = "",
  path = "/login",
  reducedMotion = false,
  webdriver = false,
  userAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
  session = new Map<string, string>(),
  local = new Map<string, string>(),
  storageThrows = false,
} = {}) {
  const attrs = new Map<string, string>();
  const listeners = new Map<string, Listener>();
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const storage = (m: Map<string, string>) => ({
    getItem: (k: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => void m.set(k, v),
  });
  const document = {
    cookie,
    documentElement: {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k) ?? null,
      removeAttribute: (k: string) => void attrs.delete(k),
    },
    addEventListener: (type: string, fn: Listener) => void listeners.set(type, fn),
    removeEventListener: (type: string) => void listeners.delete(type),
  };
  const winListeners = new Map<string, () => void>();
  const window = {
    addEventListener: (type: string, fn: () => void) => void winListeners.set(type, fn),
    location: { pathname: path },
    matchMedia: (q: string) => ({ matches: reducedMotion && q.includes("reduce") }),
    sessionStorage: storage(session),
    localStorage: storage(local),
    setTimeout: (fn: () => void, ms: number) => void timers.push({ fn, ms }),
  };
  const navigator = { webdriver, userAgent };
  new Function("document", "window", "navigator", INTRO_INIT_SCRIPT)(document, window, navigator);
  const intro = () => attrs.get("data-intro") ?? null;
  const fire = (type: string, e: Record<string, unknown>) => listeners.get(type)?.({ preventDefault() {}, stopPropagation() {}, ...e });
  const overlayTarget = { closest: (sel: string) => (sel === ".uh-intro" ? {} : null) };
  return { intro, fire, timers, listeners, winListeners, session, local, overlayTarget };
}

describe("abertura animada: quando mostrar", () => {
  afterEach(() => vi.useRealTimers());

  it("mostra na primeira entrada e grava sessão + carimbo do aparelho", () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const env = run();
    expect(env.intro()).toBe("play");
    expect(env.session.get(INTRO_STORAGE_KEY)).toBe("1");
    expect(env.local.get(INTRO_STORAGE_KEY)).toBe("1000000000000");
  });

  it("não repete na mesma sessão do navegador", () => {
    const env = run({ session: new Map([[INTRO_STORAGE_KEY, "1"]]) });
    expect(env.intro()).toBeNull();
  });

  it("no máximo uma vez a cada 12 h por aparelho (mesmo em outra sessão)", () => {
    const now = 1_000_000_000_000;
    vi.useFakeTimers({ now });
    expect(run({ local: new Map([[INTRO_STORAGE_KEY, String(now - 60_000)]]) }).intro()).toBeNull();
    expect(run({ local: new Map([[INTRO_STORAGE_KEY, String(now - INTRO_COOLDOWN_MS + 1)]]) }).intro()).toBeNull();
    expect(run({ local: new Map([[INTRO_STORAGE_KEY, String(now - INTRO_COOLDOWN_MS)]]) }).intro()).toBe("play");
    // carimbo no futuro (relógio do aparelho voltou) não bloqueia para sempre
    expect(run({ local: new Map([[INTRO_STORAGE_KEY, String(now + 60_000)]]) }).intro()).toBe("play");
  });

  it("movimento reduzido: não mostra e não gasta a vez", () => {
    const env = run({ reducedMotion: true });
    expect(env.intro()).toBeNull();
    expect(env.session.size + env.local.size).toBe(0);
  });

  it("cookie uh-e2e: nunca mostra", () => {
    expect(run({ cookie: "uh-e2e=1" }).intro()).toBeNull();
    expect(run({ cookie: "uh-theme=dark; uh-e2e=1; NEXT_LOCALE=en" }).intro()).toBeNull();
    // nome parecido não conta
    expect(run({ cookie: "xuh-e2e=1" }).intro()).toBe("play");
  });

  it("robôs e navegadores automatizados não veem a abertura", () => {
    expect(run({ webdriver: true }).intro()).toBeNull();
    expect(run({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }).intro()).toBeNull();
    expect(run({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0 Safari/537.36" }).intro()).toBeNull();
    expect(run({ userAgent: "Chrome-Lighthouse" }).intro()).toBeNull();
  });

  it("só na entrada pública e nas telas do app (não em portais, checkout ou páginas legais)", () => {
    for (const path of ["/", "/login", "/signup", "/explore", "/programs/abc", "/personalities/x/produtos", "/profile", "/recipes", "/shop", "/cart"]) {
      expect(run({ path }).intro(), path).toBe("play");
    }
    for (const path of ["/admin", "/creator/posts", "/seller", "/checkout", "/legal/terms", "/verify", "/offline", "/loginx", "/api/health"]) {
      expect(run({ path }).intro(), path).toBeNull();
    }
  });

  it("armazenamento indisponível: não mostra (não haveria como limitar)", () => {
    expect(run({ storageThrows: true }).intro()).toBeNull();
  });
});

describe("abertura animada: pular e encerrar", () => {
  it("Esc pula (fade curto) e depois remove o atributo", () => {
    const env = run();
    env.fire("keydown", { key: "Escape" });
    expect(env.intro()).toBe("out");
    const fade = env.timers.find((t) => t.ms < 1000)!;
    fade.fn();
    expect(env.intro()).toBeNull();
    expect(env.listeners.size).toBe(0);
  });

  it("toque/clique dentro do overlay (inclusive no botão Pular) pula; fora dele, não", () => {
    const env = run();
    env.fire("click", { target: { closest: () => null } });
    expect(env.intro()).toBe("play");
    env.fire("click", { target: env.overlayTarget });
    expect(env.intro()).toBe("out");
  });

  it("outras teclas não pulam", () => {
    const env = run();
    env.fire("keydown", { key: "Tab" });
    expect(env.intro()).toBe("play");
  });

  it("encerra sozinha no fim da animação de saída, com rede de segurança por tempo", () => {
    const env = run();
    env.fire("animationend", { animationName: "uh-j-torso" });
    expect(env.intro()).toBe("play");
    env.fire("animationend", { animationName: "uh-intro-exit" });
    expect(env.intro()).toBeNull();

    const env2 = run();
    expect(env2.timers.find((t) => t.ms > INTRO_DURATION_MS)).toBeUndefined();
    env2.winListeners.get("DOMContentLoaded")!();
    const safety = env2.timers.find((t) => t.ms > INTRO_DURATION_MS)!;
    expect(safety.ms).toBeLessThanOrEqual(INTRO_DURATION_MS + 1000);
    safety.fn();
    expect(env2.intro()).toBeNull();
  });
});

describe("abertura animada: poses", () => {
  it("total ≤ 2,8 s e poses em ordem, cobrindo do início ao fim", () => {
    expect(INTRO_DURATION_MS).toBeLessThanOrEqual(2800);
    expect(POSES[0].t).toBe(0);
    expect(POSES.at(-1)!.t).toBe(INTRO_DURATION_MS / 1000);
    for (let i = 1; i < POSES.length; i++) expect(POSES[i].t).toBeGreaterThan(POSES[i - 1].t);
    // entre 4 e 6+ poses-chave distintas do atleta na fase de ação (0,8–2,2 s)
    expect(POSES.filter((p) => p.t >= 0.8 && p.t <= 2.2).length).toBeGreaterThanOrEqual(4);
  });

  it("gera um @keyframes por articulação, mais o corpo e a sombra", () => {
    const css = buildIntroKeyframes();
    for (const j of JOINTS) expect(css).toContain(`@keyframes uh-j-${j}{0%{`);
    expect(css).toContain("@keyframes uh-fig-body{0%{");
    expect(css).toContain("@keyframes uh-fig-shadow{");
    expect(css).toContain("100%{");
  });
});
