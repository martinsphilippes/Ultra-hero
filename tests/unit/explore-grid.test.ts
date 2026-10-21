import { describe, expect, it } from "vitest";
import { CONTENT_TILE_SELECT, daySeed, spreadCreators, TILE_PAGE_SIZE, tileCover, tileLabel } from "@/components/discover/explore/tiles";
import { PILLARS } from "@/lib/supabase/helpers";

describe("TILE_PAGE_SIZE", () => {
  it("é 15: cinco linhas de três colunas por carga", () => {
    expect(TILE_PAGE_SIZE).toBe(15);
    expect(TILE_PAGE_SIZE % 3).toBe(0);
  });
});

describe("daySeed", () => {
  it("é o número do dia UTC (ms / 86 400 000, arredondado para baixo)", () => {
    expect(daySeed(new Date("1970-01-01T00:00:00Z"))).toBe(0);
    expect(daySeed(new Date("1970-01-02T00:00:00Z"))).toBe(1);
    expect(daySeed(new Date("2026-10-21T12:34:56Z"))).toBe(Math.floor(Date.UTC(2026, 9, 21) / 86_400_000));
  });

  it("é o mesmo durante todo o dia UTC e muda exatamente na virada", () => {
    const start = new Date("2026-10-21T00:00:00.000Z");
    const noon = new Date("2026-10-21T12:00:00.000Z");
    const lastMs = new Date("2026-10-21T23:59:59.999Z");
    const next = new Date("2026-10-22T00:00:00.000Z");
    expect(daySeed(start)).toBe(daySeed(noon));
    expect(daySeed(noon)).toBe(daySeed(lastMs));
    expect(daySeed(next)).toBe(daySeed(lastMs) + 1);
  });

  it("usa UTC, não o fuso local: 21h em São Paulo (UTC-3) já é o dia seguinte", () => {
    const late = new Date("2026-10-21T21:30:00-03:00"); // 00:30Z do dia 22
    expect(daySeed(late)).toBe(daySeed(new Date("2026-10-22T00:00:00Z")));
  });

  it("é determinístico para a mesma data e inteiro não negativo", () => {
    const when = new Date("2031-03-09T08:00:00Z");
    expect(daySeed(when)).toBe(daySeed(new Date(when.getTime())));
    expect(Number.isInteger(daySeed(when))).toBe(true);
    expect(daySeed(when)).toBeGreaterThan(0);
    expect(daySeed()).toBeGreaterThan(daySeed(new Date("2026-01-01T00:00:00Z")));
  });

  it("cabe num int4 do Postgres (p_seed integer)", () => {
    expect(daySeed(new Date("2200-01-01T00:00:00Z"))).toBeLessThan(2 ** 31 - 1);
  });
});

describe("tileCover", () => {
  it("usa a capa do conteúdo quando existe", () => {
    expect(tileCover("https://x.supabase.co/storage/v1/object/public/covers/a.jpg", "training")).toBe(
      "https://x.supabase.co/storage/v1/object/public/covers/a.jpg",
    );
    expect(tileCover("/placeholders/cover-routine-2.svg", "nutrition")).toBe("/placeholders/cover-routine-2.svg");
  });

  it("sem capa (null, undefined ou vazia) cai no placeholder do pilar", () => {
    expect(tileCover(null, "routine")).toBe("/placeholders/cover-routine-1.svg");
    expect(tileCover(undefined, "training")).toBe("/placeholders/cover-training-1.svg");
    expect(tileCover("", "gastronomy")).toBe("/placeholders/cover-gastronomy-1.svg");
  });

  it("há um placeholder por pilar, sempre SVG local", () => {
    for (const pillar of PILLARS) {
      const cover = tileCover(null, pillar);
      expect(cover).toBe(`/placeholders/cover-${pillar}-1.svg`);
      expect(cover.endsWith(".svg")).toBe(true);
    }
    expect(new Set(PILLARS.map((pillar) => tileCover(null, pillar))).size).toBe(PILLARS.length);
  });
});

describe("tileLabel", () => {
  it("monta 'título · herói · tipo' quando o conteúdo é livre", () => {
    expect(tileLabel({ title: "Sono profundo em 7 dias", creator: "Helena Vilar", type: "Vídeo" })).toBe("Sono profundo em 7 dias · Helena Vilar · Vídeo");
    expect(tileLabel({ title: "Sono", creator: "Helena", type: "Vídeo", restriction: null })).toBe("Sono · Helena · Vídeo");
  });

  it("acrescenta a restrição no fim quando existe", () => {
    expect(tileLabel({ title: "Mobilidade", creator: "Kai", type: "Treino", restriction: "Requer plano Treino" })).toBe(
      "Mobilidade · Kai · Treino · Requer plano Treino",
    );
    expect(tileLabel({ title: "Marmita", creator: "Lia", type: "Receita", restriction: "Indisponível" })).toBe("Marmita · Lia · Receita · Indisponível");
  });

  it("sem herói, pula o trecho (não deixa separador duplo)", () => {
    expect(tileLabel({ title: "Guia de hábitos", type: "Guia" })).toBe("Guia de hábitos · Guia");
    expect(tileLabel({ title: "Guia de hábitos", creator: null, type: "Guia", restriction: "Indisponível" })).toBe("Guia de hábitos · Guia · Indisponível");
    expect(tileLabel({ title: "Guia", creator: "   ", type: "Guia" })).toBe("Guia · Guia");
  });

  it("o herói é sempre o segundo trecho quando presente (contrato lido pelos E2E)", () => {
    const label = tileLabel({ title: "Título com · ponto no meio", creator: "Herói", type: "Artigo", restriction: "Requer plano X" });
    expect(label.split(" · ")[1]).toBe("ponto no meio");
    // Títulos com o separador quebram o contrato; o catálogo não usa " · " em títulos.
    const safe = tileLabel({ title: "Título simples", creator: "Herói", type: "Artigo" });
    expect(safe.split(" · ")[1]).toBe("Herói");
  });
});

describe("spreadCreators", () => {
  const tile = (id: string, creator: string | null) => ({ id, creator: creator ? { slug: creator } : null });
  const slugs = (items: { creator: { slug: string } | null }[]) => items.map((item) => item.creator?.slug ?? "-");

  it("não mexe numa página que já alterna heróis", () => {
    const page = [tile("1", "a"), tile("2", "b"), tile("3", "c"), tile("4", "a")];
    expect(spreadCreators(page)).toEqual(page);
  });

  it("afasta dois vizinhos do mesmo herói trazendo o próximo diferente", () => {
    // Fronteira de rodada: ...c, a | a, b...
    const page = [tile("1", "c"), tile("2", "a"), tile("3", "a"), tile("4", "b"), tile("5", "c")];
    expect(slugs(spreadCreators(page))).toEqual(["c", "a", "b", "a", "c"]);
  });

  it("mantém exatamente os mesmos itens (nada some nem repete) e não altera a entrada", () => {
    const page = [tile("1", "a"), tile("2", "a"), tile("3", "a"), tile("4", "b"), tile("5", "b"), tile("6", "c")];
    const copy = page.map((item) => ({ ...item }));
    const out = spreadCreators(page);
    expect(out.map((item) => item.id).sort()).toEqual(page.map((item) => item.id).sort());
    expect(page).toEqual(copy);
    for (let i = 1; i < out.length; i++) expect(out[i].creator?.slug).not.toBe(out[i - 1].creator?.slug);
  });

  it("quando não há alternativa, deixa como está (um herói só)", () => {
    const page = [tile("1", "a"), tile("2", "a"), tile("3", "a")];
    expect(spreadCreators(page)).toEqual(page);
    expect(spreadCreators([])).toEqual([]);
    expect(spreadCreators([tile("1", "a")])).toEqual([tile("1", "a")]);
  });

  it("posts sem herói contam como heróis distintos (nunca são 'vizinhos iguais')", () => {
    const page = [tile("1", null), tile("2", null), tile("3", "a")];
    expect(spreadCreators(page)).toEqual(page);
  });
});

describe("CONTENT_TILE_SELECT", () => {
  it("seleciona só as colunas do quadro, com herói e módulo embutidos", () => {
    const columns = CONTENT_TILE_SELECT.split(",").map((part) => part.trim());
    for (const column of ["id", "slug", "title", "cover_url", "pillar", "type", "access_level", "source_locale"]) {
      expect(columns).toContain(column);
    }
    expect(CONTENT_TILE_SELECT).toContain("required_module:plan_modules(code, name)");
    expect(CONTENT_TILE_SELECT).toContain("creator:creator_profiles(slug, name, avatar_url)");
    // Campos do card completo que o quadro não mostra ficam de fora (menos bytes por página).
    for (const column of ["summary", "duration_minutes", "difficulty", "published_at", "is_featured", "has_captions"]) {
      expect(columns).not.toContain(column);
    }
  });
});
