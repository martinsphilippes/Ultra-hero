import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTemplate,
  DEFAULT_TEMPLATE,
  isTemplate,
  pickTemplate,
  resolveTemplate,
  TEMPLATE_COOKIE,
  TEMPLATE_INIT_SCRIPT,
  templates,
} from "@/lib/theme/template";

// Documento e armazenamento mínimos para rodar o script inicial e o applyTemplate no node.
function fakeEnv({ cookie = "", stored = null as string | null, storageThrows = false } = {}) {
  const attrs = new Map<string, string>();
  const writtenCookies: string[] = [];
  const data = new Map<string, string>();
  if (stored !== null) data.set(TEMPLATE_COOKIE, stored);
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k) ?? null,
    },
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      writtenCookies.push(v);
    },
  };
  const localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("bloqueado");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error("bloqueado");
      data.set(k, v);
    },
  };
  return { document, localStorage, attrs, writtenCookies, data };
}

function runInitScript(env: ReturnType<typeof fakeEnv>) {
  new Function("document", "localStorage", TEMPLATE_INIT_SCRIPT)(env.document, env.localStorage);
  return env.attrs.get("data-template");
}

describe("preferência de template (Aparência)", () => {
  it("aceita só os 5 templates", () => {
    expect(templates).toEqual(["original", "impact", "essential", "performance", "urban"]);
    for (const t of templates) expect(isTemplate(t)).toBe(true);
    for (const bad of ["", "Impact", "dark", "nike", null, undefined, 3, {}]) expect(isTemplate(bad)).toBe(false);
  });

  it("ausente ou inválida cai no Ultra Original", () => {
    expect(DEFAULT_TEMPLATE).toBe("original");
    expect(resolveTemplate(undefined)).toBe("original");
    expect(resolveTemplate("lululemon")).toBe("original");
    expect(resolveTemplate("urban")).toBe("urban");
  });

  it("cookie válido vence; senão localStorage válido; senão Original", () => {
    expect(pickTemplate("impact", "urban")).toBe("impact");
    expect(pickTemplate("xx", "urban")).toBe("urban");
    expect(pickTemplate(null, "essential")).toBe("essential");
    expect(pickTemplate("xx", "yy")).toBe("original");
    expect(pickTemplate(undefined, null)).toBe("original");
  });
});

describe("script inicial do template (sem flash)", () => {
  it("aplica o template do cookie", () => {
    expect(runInitScript(fakeEnv({ cookie: `uh-theme=dark; ${TEMPLATE_COOKIE}=performance`, stored: "urban" }))).toBe("performance");
  });

  it("sem cookie usa o localStorage (páginas do service worker)", () => {
    expect(runInitScript(fakeEnv({ stored: "essential" }))).toBe("essential");
  });

  it("cookie inválido não impede o localStorage válido", () => {
    expect(runInitScript(fakeEnv({ cookie: `${TEMPLATE_COOKIE}=nada`, stored: "impact" }))).toBe("impact");
  });

  it("nada salvo, valor inválido ou armazenamento bloqueado: Original", () => {
    expect(runInitScript(fakeEnv())).toBe("original");
    expect(runInitScript(fakeEnv({ stored: "<script>" }))).toBe("original");
    expect(runInitScript(fakeEnv({ storageThrows: true }))).toBe("original");
  });

  it("não confunde com outro cookie de nome parecido", () => {
    expect(runInitScript(fakeEnv({ cookie: `x${TEMPLATE_COOKIE}=urban` }))).toBe("original");
  });
});

describe("applyTemplate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("só troca o atributo do <html> e grava cookie + localStorage", () => {
    const env = fakeEnv();
    vi.stubGlobal("document", env.document);
    vi.stubGlobal("localStorage", env.localStorage);
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    applyTemplate("urban");
    expect(env.attrs.get("data-template")).toBe("urban");
    expect(env.writtenCookies[0]).toMatch(new RegExp(`^${TEMPLATE_COOKIE}=urban; path=/; max-age=\\d+; samesite=lax; secure$`));
    expect(env.data.get(TEMPLATE_COOKIE)).toBe("urban");
  });

  it("ignora valor inválido e segue sem localStorage", () => {
    const env = fakeEnv({ storageThrows: true });
    vi.stubGlobal("document", env.document);
    vi.stubGlobal("localStorage", env.localStorage);
    vi.stubGlobal("window", { location: { protocol: "http:" } });
    applyTemplate("bogus" as never);
    expect(env.attrs.size).toBe(0);
    applyTemplate("impact");
    expect(env.attrs.get("data-template")).toBe("impact");
    expect(env.writtenCookies).toHaveLength(1);
  });
});

describe("tokens dos templates", () => {
  const globals = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const css = readFileSync(path.join(process.cwd(), "src/app/templates.css"), "utf8");
  const block = (source: string, selector: string) => {
    const start = source.indexOf(`${selector} {`) >= 0 ? source.indexOf(`${selector} {`) : source.indexOf(`${selector},`);
    expect(start, selector).toBeGreaterThanOrEqual(0);
    return source.slice(start, source.indexOf("}", start));
  };
  const tokens = (text: string) => Object.fromEntries(Array.from(text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g), (m) => [m[1], m[2].trim()]));
  const colorNames = Object.keys(tokens(block(globals, ':root[data-theme="light"]')));
  const others = templates.filter((t) => t !== "original");

  it("cada template tem variante clara e escura com todas as cores do Original", () => {
    for (const t of others) {
      for (const mode of ["light", "dark"]) {
        const own = tokens(block(css, `[data-template="${t}"][data-theme="${mode}"]`));
        for (const name of colorNames) expect(own[name], `${t}/${mode}: --${name}`).toBeDefined();
      }
    }
  });

  it("o bloco padrão (Original) declara tudo o que os templates mudam, para a prévia não herdar outro", () => {
    const defaults = tokens(block(css, ":root,\n[data-template=\"original\"]"));
    for (const t of others) {
      for (const name of Object.keys(tokens(block(css, `[data-template="${t}"]`)))) expect(defaults[name], `${t}: --${name}`).toBeDefined();
    }
  });

  const hex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
  const parse = (v: string, under: number[]): number[] => {
    if (hex(v)) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) throw new Error(`cor não suportada: ${v}`);
    const [r, g, b, a = 1] = m[1].split(",").map(Number);
    return [r, g, b].map((c, i) => Math.round(c * a + under[i] * (1 - a)));
  };
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const pairs: [string, string][] = [
    ["fg", "bg"],
    ["fg", "surface"],
    ["fg-muted", "bg"],
    ["fg-muted", "surface"],
    ["fg-subtle", "bg"],
    ["fg-subtle", "surface"],
    ["fg-subtle", "surface-hover"],
    ["accent-fg", "accent"],
    ["accent-text", "bg"],
    ["accent-text", "surface"],
    ["success", "bg"],
    ["warning", "bg"],
    ["danger", "bg"],
    ["info", "bg"],
  ];

  it("texto passa AA (4,5:1) nos 5 templates × claro/escuro", () => {
    const themes: Record<string, Record<string, string>> = {
      "original/light": tokens(block(globals, ':root[data-theme="light"]')),
      "original/dark": tokens(block(globals, ":root")),
    };
    for (const t of others) for (const mode of ["light", "dark"]) themes[`${t}/${mode}`] = tokens(block(css, `[data-template="${t}"][data-theme="${mode}"]`));
    for (const [name, tk] of Object.entries(themes)) {
      const bg = parse(tk["uh-bg"], [255, 255, 255]);
      for (const [fgName, bgName] of pairs) {
        const under = parse(tk[`uh-${bgName}`], bg);
        const ratio = contrast(parse(tk[`uh-${fgName}`], under), under);
        expect(ratio, `${name}: ${fgName} sobre ${bgName}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("textos do painel Aparência", () => {
  it("nome e descrição de cada template nos 3 idiomas", () => {
    for (const locale of ["pt-BR", "en", "es"]) {
      const common = JSON.parse(readFileSync(path.join(process.cwd(), `messages/${locale}/common.json`), "utf8"));
      for (const t of templates) {
        expect(common.appearance.options[t].name, `${locale}/${t}`).toMatch(/^Ultra /);
        expect(common.appearance.options[t].description.length, `${locale}/${t}`).toBeGreaterThan(10);
      }
    }
  });
});
