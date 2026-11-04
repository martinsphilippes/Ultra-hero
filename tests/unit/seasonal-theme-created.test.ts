import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBackground, checkTokens } from "@/lib/seasonal-theme/contrast";
import { backgroundLayerStyle } from "@/lib/seasonal-theme/css";
import { sanitizeBackground, sanitizeBanner, sanitizeDecorations, sanitizeTokens } from "@/lib/seasonal-theme/normalize";
import { resolveActive, type Candidate } from "@/lib/seasonal-theme/resolve";
import { isAssetUrl, LOCAL_ASSET_RE } from "@/lib/seasonal-theme/vocab";

// 0102: ilustrações do próprio app em /temas/ e os 8 temas criados (lidos direto da migração, para o teste acompanhar
// qualquer ajuste de cor, imagem ou faixa feito lá).

const ROOT = join(__dirname, "..", "..");
const SQL = readFileSync(join(ROOT, "supabase/migrations/0102_temas_sazonais_criados.sql"), "utf8");

type Seed = { id: string; chave: string; priority: number; tokens: unknown; background: unknown; decorations: unknown; banner: unknown; window: [string, string] };

/** Cada linha do VALUES: id, chave, …, datas de reserva, prioridade e os 4 jsonb (tokens, fundo, decorativos, faixa). */
function seeds(): Seed[] {
  const rows = SQL.split(/\n\s+\('b0102000-/).slice(1);
  return rows.map((row) => {
    const id = `b0102000-${row.slice(0, row.indexOf("'"))}`;
    const chave = /'::uuid, '([a-z0-9-]+)'/.exec(row)![1];
    const fb = /timestamp '([^']+)', timestamp '([^']+)', (\d+), (true|false),/.exec(row)!;
    const json = [...row.matchAll(/'((?:[^']|'')*)'::jsonb/g)].map((m) => JSON.parse(m[1].replace(/''/g, "'")));
    const [tokens, background, decorations, banner] = json;
    return { id, chave, priority: Number(fb[3]), tokens, background, decorations, banner, window: [fb[1], fb[2]] as [string, string] };
  });
}

describe("caminho interno /temas/ (0102)", () => {
  it("aceita só /temas/<pasta>/<arquivo>.(png|jpg|webp) com minúsculas, dígitos e hífen", () => {
    for (const ok of ["/temas/natal/arvore.webp", "/temas/copa-feminina/bola.png", "/temas/dia-dos-pais/oculos.jpg", "/temas/a1/b2.webp"]) expect(isAssetUrl(ok)).toBe(true);
    for (const bad of [
      "/temas/../segredo.webp",
      "/temas/natal/../../x.webp",
      "/temas/natal/arvore.svg",
      "/temas/natal/arvore.gif",
      "/temas//arvore.webp",
      "//temas/natal/arvore.webp",
      "/temas/natal/sub/arvore.webp",
      "/temas/Natal/arvore.webp",
      "/temas/natal/-arvore.webp",
      "/temas/natal/arvore-.webp",
      "/temas/natal/arvore.webp?x=1",
      "/outra/natal/arvore.webp",
      "temas/natal/arvore.webp",
      "https://evil.com/temas/natal/arvore.webp",
      "/temas/natal/arvore.webp\n",
      `/temas/${"a".repeat(300)}/b.webp`,
    ]) expect(isAssetUrl(bad), bad).toBe(false);
  });
  it("o saneamento e a camada de fundo usam o caminho interno sem mexer", () => {
    expect(sanitizeDecorations([{ url: "/temas/natal/arvore.webp", position: "top-left", size: "lg" }, { url: "/temas/../x.webp", position: "top-right", size: "md" }])).toEqual([
      { url: "/temas/natal/arvore.webp", position: "top-left", size: "lg" },
    ]);
    expect(sanitizeBackground({ type: "image", url: "/temas/natal/padrao-flocos.webp", fit: "repeat", intensity: 22 })).toEqual({ type: "image", url: "/temas/natal/padrao-flocos.webp", fit: "repeat", intensity: 22 });
    expect(backgroundLayerStyle({ type: "image", url: "/temas/natal/padrao-flocos.webp", fit: "repeat", intensity: 22 })?.backgroundImage).toBe('url("/temas/natal/padrao-flocos.webp")');
    expect(backgroundLayerStyle({ type: "image", url: '/temas/x/y.webp") ;background:red', fit: "repeat", intensity: 22 })).toBeNull();
  });
  it("a regra do app é a mesma da migração", () => {
    expect(SQL).toContain(`p ~ '${LOCAL_ASSET_RE.source.replace(/\\\//g, "/")}'`);
  });
});

describe("temas criados (0102)", () => {
  const all = seeds();
  it("8 temas, chaves e ids únicos", () => {
    expect(all.map((s) => s.chave)).toEqual(["natal-2026", "reveillon-2027", "black-friday-2026", "carnaval-2027", "copa-feminina-2027", "reality-2027", "dia-das-maes-2027", "dia-dos-pais-2027"]);
    expect(new Set(all.map((s) => s.id)).size).toBe(8);
  });
  for (const s of seeds()) {
    describe(s.chave, () => {
      it("cores AA nos 5 templates (claro e escuro), sem ajuste automático, e fundo visível nos dois modos", () => {
        const tokens = sanitizeTokens(s.tokens);
        expect(tokens).toEqual(s.tokens);
        const report = checkTokens(tokens);
        expect(report.ok).toBe(true);
        expect([...report.light.warnings, ...report.dark.warnings]).toEqual([]);
        const bg = sanitizeBackground(s.background);
        expect(bg.type).not.toBe("none");
        expect(checkBackground(bg, tokens).hiddenIn).toEqual([]);
      });
      it("4 decorativos válidos, um por canto, e os arquivos existem (decorativo ≤ 60 KB, fundo ≤ 400 KB)", () => {
        const decor = sanitizeDecorations(s.decorations);
        expect(decor).toHaveLength(4);
        expect(new Set(decor.map((d) => d.position)).size).toBe(4);
        for (const d of decor) {
          const file = join(ROOT, "public", d.url);
          expect(existsSync(file), d.url).toBe(true);
          expect(statSync(file).size).toBeLessThanOrEqual(60 * 1024);
        }
        const bg = sanitizeBackground(s.background);
        if (bg.type === "image") {
          expect(existsSync(join(ROOT, "public", bg.url))).toBe(true);
          expect(statSync(join(ROOT, "public", bg.url)).size).toBeLessThanOrEqual(400 * 1024);
        }
      });
      it("faixa curta nos 3 idiomas, sem link", () => {
        const banner = sanitizeBanner(s.banner);
        expect(banner.text?.["pt-BR"]).toBeTruthy();
        expect(banner.text?.en).toBeTruthy();
        expect(banner.text?.es).toBeTruthy();
        expect(banner.href).toBeUndefined();
        expect(JSON.stringify(s.banner)).not.toMatch(/BBB|Big Brother|FIFA/i);
      });
    });
  }
  it("prioridade: Réveillon > Natal, Carnaval > reality, Copa Feminina a mais alta, Black Friday a mais baixa", () => {
    const by = Object.fromEntries(all.map((s) => [s.chave, s.priority]));
    expect(by["reveillon-2027"]).toBeGreaterThan(by["natal-2026"]);
    expect(by["carnaval-2027"]).toBeGreaterThan(by["reality-2027"]);
    expect(Math.max(...all.map((s) => s.priority))).toBe(by["copa-feminina-2027"]);
    expect(Math.min(...all.map((s) => s.priority))).toBe(by["black-friday-2026"]);
  });
  it("quem vale em cada data (datas de reserva da migração, fuso de São Paulo)", () => {
    const iso = (local: string) => new Date(`${local.replace(" ", "T")}:00-03:00`).toISOString();
    const cands: (Candidate & { chave: string })[] = all.map((s) => ({ id: s.id, chave: s.chave, priority: s.priority, areas: ["app", "portals", "institutional"], windowStart: iso(s.window[0]), windowEnd: iso(s.window[1]) }));
    const at = (local: string) => resolveActive(cands, new Date(`${local}-03:00`), "app")?.chave ?? null;
    expect(at("2026-11-04T12:00:00")).toBeNull();
    expect(at("2026-11-20T00:00:00")).toBe("black-friday-2026");
    expect(at("2026-11-27T23:59:00")).toBe("black-friday-2026");
    expect(at("2026-11-28T00:00:00")).toBeNull();
    expect(at("2026-12-15T09:00:00")).toBe("natal-2026");
    expect(at("2026-12-25T21:00:00")).toBe("natal-2026");
    expect(at("2026-12-26T00:00:00")).toBe("reveillon-2027");
    expect(at("2027-01-01T18:00:00")).toBe("reveillon-2027");
    expect(at("2027-01-02T00:00:00")).toBeNull();
    expect(at("2027-01-20T12:00:00")).toBe("reality-2027");
    expect(at("2027-02-05T12:00:00")).toBe("carnaval-2027");
    expect(at("2027-02-10T12:00:00")).toBe("reality-2027");
    expect(at("2027-05-09T12:00:00")).toBe("dia-das-maes-2027");
    expect(at("2027-06-17T08:00:00")).toBe("copa-feminina-2027");
    expect(at("2027-08-08T12:00:00")).toBe("dia-dos-pais-2027");
  });
});
