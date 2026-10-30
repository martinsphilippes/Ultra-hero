import { describe, expect, it } from "vitest";
import {
  CONTENT_LIBRARY_KEYS,
  LEGACY_LIBRARY_SEGMENTS,
  LIBRARY_KEYS,
  buildCreatorLibraries,
  contentLibraryKey,
  isContentLibraryKey,
  isLibraryKey,
  legacyLibraryTarget,
  type LibraryContent,
} from "@/lib/catalog/creator-libraries";
import type { ContentType, Pillar } from "@/lib/supabase/helpers";

type C = LibraryContent & { id: string };
let seq = 0;
const content = (type: ContentType, pillar: Pillar): C => ({ id: `c${++seq}`, type, pillar });

describe("contentLibraryKey", () => {
  it("receita vai para Alimentação em qualquer pilar", () => {
    for (const pillar of ["routine", "nutrition", "training", "gastronomy"] as const) {
      expect(contentLibraryKey(content("recipe", pillar))).toBe("alimentacao");
    }
  });

  it("treino (tipo workout ou pilar training) vai para Treinos", () => {
    expect(contentLibraryKey(content("workout", "routine"))).toBe("treinos");
    expect(contentLibraryKey(content("workout", "nutrition"))).toBe("treinos");
    expect(contentLibraryKey(content("video", "training"))).toBe("treinos");
    expect(contentLibraryKey(content("article", "training"))).toBe("treinos");
  });

  it("receita tem prioridade sobre treino", () => {
    expect(contentLibraryKey(content("recipe", "training"))).toBe("alimentacao");
  });

  it("os demais seguem o pilar", () => {
    expect(contentLibraryKey(content("video", "routine"))).toBe("dia-a-dia");
    expect(contentLibraryKey(content("guide", "nutrition"))).toBe("nutricao");
    expect(contentLibraryKey(content("article", "gastronomy"))).toBe("gastronomia");
  });
});

describe("buildCreatorLibraries", () => {
  it("cada conteúdo entra em uma única biblioteca e as contagens batem", () => {
    const contents = [
      content("video", "routine"),
      content("recipe", "nutrition"),
      content("recipe", "gastronomy"),
      content("workout", "training"),
      content("video", "training"),
      content("guide", "nutrition"),
      content("article", "gastronomy"),
      content("workout", "routine"),
    ];
    const libraries = buildCreatorLibraries({ contents, programs: [{ id: "p1" }], products: [{ id: "x1" }, { id: "x2" }] });
    expect(libraries.map((l) => [l.key, l.count])).toEqual([
      ["dia-a-dia", 1],
      ["nutricao", 1],
      ["alimentacao", 2],
      ["treinos", 3],
      ["gastronomia", 1],
      ["programas", 1],
      ["produtos", 2],
    ]);
    const placed = libraries.filter((l) => l.kind === "content").flatMap((l) => l.items.map((c) => c.id));
    expect(placed).toHaveLength(contents.length);
    expect(new Set(placed).size).toBe(contents.length);
    for (const library of libraries) expect(library.count).toBe(library.items.length);
  });

  it("mantém a ordem fixa mesmo quando os dados chegam embaralhados", () => {
    const libraries = buildCreatorLibraries({
      contents: [content("article", "gastronomy"), content("recipe", "routine"), content("video", "routine")],
      programs: [],
      products: [{ id: "x1" }],
    });
    expect(libraries.map((l) => l.key)).toEqual(["dia-a-dia", "alimentacao", "gastronomia", "produtos"]);
    const order = libraries.map((l) => LIBRARY_KEYS.indexOf(l.key));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("esconde bibliotecas vazias e devolve vazio sem nada", () => {
    expect(buildCreatorLibraries({ contents: [], programs: [], products: [] })).toEqual([]);
    expect(buildCreatorLibraries({})).toEqual([]);
    expect(buildCreatorLibraries({ contents: null, programs: null, products: null })).toEqual([]);
    const only = buildCreatorLibraries({ contents: [content("video", "nutrition")] });
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ key: "nutricao", kind: "content", count: 1 });
  });

  it("preserva a ordem de chegada dentro de cada biblioteca", () => {
    const a = content("video", "routine");
    const b = content("guide", "routine");
    const [diaADia] = buildCreatorLibraries({ contents: [a, b] });
    expect(diaADia.items.map((c) => (c as C).id)).toEqual([a.id, b.id]);
  });
});

describe("chaves", () => {
  it("LIBRARY_KEYS tem as sete chaves na ordem do hub", () => {
    expect(LIBRARY_KEYS).toEqual(["dia-a-dia", "nutricao", "alimentacao", "treinos", "gastronomia", "programas", "produtos"]);
    expect(CONTENT_LIBRARY_KEYS).toEqual(["dia-a-dia", "nutricao", "alimentacao", "treinos", "gastronomia"]);
  });

  it("valida o segmento da URL", () => {
    expect(isLibraryKey("alimentacao")).toBe(true);
    expect(isLibraryKey("produtos")).toBe(true);
    expect(isLibraryKey("inexistente")).toBe(false);
    expect(isLibraryKey("")).toBe(false);
    expect(isLibraryKey(null)).toBe(false);
    expect(isContentLibraryKey("treinos")).toBe(true);
    expect(isContentLibraryKey("programas")).toBe(false);
  });

  it("os segmentos antigos (rotina, receitas) não são chaves: viram redirecionamento", () => {
    expect(isLibraryKey("rotina")).toBe(false);
    expect(isLibraryKey("receitas")).toBe(false);
    expect(isLibraryKey("dia-a-dia")).toBe(true);
  });
});

describe("legacyLibraryTarget (0050)", () => {
  it("leva os segmentos antigos aos novos", () => {
    expect(legacyLibraryTarget("rotina")).toBe("dia-a-dia");
    expect(legacyLibraryTarget("receitas")).toBe("alimentacao");
    expect(LEGACY_LIBRARY_SEGMENTS).toEqual({ rotina: "dia-a-dia", receitas: "alimentacao" });
  });

  it("todo destino é uma chave válida", () => {
    for (const target of Object.values(LEGACY_LIBRARY_SEGMENTS)) expect(isLibraryKey(target)).toBe(true);
  });

  it("segmento atual, desconhecido ou vazio não redireciona", () => {
    for (const segment of ["dia-a-dia", "alimentacao", "programas", "inexistente", "", null, undefined, "toString", "__proto__", "constructor"]) {
      expect(legacyLibraryTarget(segment)).toBeNull();
    }
  });
});
