import { describe, expect, it } from "vitest";
import { LIBRARY_KEYS } from "@/lib/catalog/creator-libraries";
import {
  DEFAULT_LIBRARY_ICON,
  LIBRARY_ICON_KEYS,
  duplicateLabels,
  labelForLocale,
  overrideDiff,
  parseLibraryLabel,
  primaryCategoryId,
  resolveLibraryConfig,
  resolveLibraryTiles,
  type CategoryTabRow,
  type OverrideRow,
} from "@/lib/heroes/library-tabs";

// Atalhos da página do herói (0050): padrões, configuração da categoria principal, exceção do herói.

const ESPORTE = "cat-esporte";
const MUSICA = "cat-musica";
const ALL = Object.fromEntries(LIBRARY_KEYS.map((key) => [key, 1]));

const tab = (sourceKey: string, over: Partial<CategoryTabRow> = {}): CategoryTabRow => ({
  categoryId: ESPORTE,
  sourceKey,
  label: null,
  icon: null,
  sortOrder: (LIBRARY_KEYS.indexOf(sourceKey as never) + 1) * 10,
  isVisible: true,
  ...over,
});
const override = (sourceKey: string, over: Partial<OverrideRow> = {}): OverrideRow => ({ sourceKey, label: null, icon: null, sortOrder: null, isVisible: null, ...over });

describe("padrões (sem categoria ou sem configuração)", () => {
  it("as 7 fontes na ordem padrão, com os ícones de antes e rótulo padrão (null)", () => {
    const config = resolveLibraryConfig({ categoryId: null });
    expect(config.map((t) => t.key)).toEqual(["dia-a-dia", "nutricao", "alimentacao", "treinos", "gastronomia", "programas", "produtos"]);
    expect(config.every((t) => t.label === null && t.isVisible)).toBe(true);
    expect(config.map((t) => t.icon)).toEqual(LIBRARY_KEYS.map((k) => DEFAULT_LIBRARY_ICON[k]));
    expect(config.every((t) => t.origin.label === "default" && t.origin.sortOrder === "default")).toBe(true);
  });

  it("categoria sem linhas também cai nos padrões", () => {
    expect(resolveLibraryConfig({ categoryId: ESPORTE, categoryRows: [] }).map((t) => t.key)).toEqual([...LIBRARY_KEYS]);
  });

  it("todo ícone padrão está na lista fixa", () => {
    for (const icon of Object.values(DEFAULT_LIBRARY_ICON)) expect(LIBRARY_ICON_KEYS).toContain(icon);
  });

  it("só mostra os com itens, mais Alimentação (always)", () => {
    const tiles = resolveLibraryTiles({ counts: { treinos: 3, produtos: 2 }, always: ["alimentacao"], locale: "pt-BR" });
    expect(tiles.map((t) => [t.key, t.count])).toEqual([
      ["alimentacao", 0],
      ["treinos", 3],
      ["produtos", 2],
    ]);
    expect(tiles.every((t) => t.label === null)).toBe(true);
  });
});

describe("configuração da categoria", () => {
  const rows = [
    tab("programas", { label: { "pt-BR": "Treinos guiados", en: "Guided workouts" }, icon: "trophy", sortOrder: 5 }),
    tab("nutricao", { isVisible: false }),
    tab("dia-a-dia", { sortOrder: 99 }),
  ];

  it("rótulo, ícone, ordem e visibilidade vêm da categoria", () => {
    const config = resolveLibraryConfig({ categoryId: ESPORTE, categoryRows: rows });
    expect(config[0]).toMatchObject({ key: "programas", icon: "trophy", sortOrder: 5, label: { "pt-BR": "Treinos guiados", en: "Guided workouts" } });
    expect(config[0].origin).toEqual({ label: "category", icon: "category", sortOrder: "category", isVisible: "category" });
    expect(config.at(-1)!.key).toBe("dia-a-dia");
    expect(config.find((t) => t.key === "nutricao")!.isVisible).toBe(false);
    // fonte sem linha fica no padrão
    expect(config.find((t) => t.key === "produtos")!.origin.label).toBe("default");
  });

  it("oculto some dos atalhos, mesmo Alimentação em always", () => {
    const tiles = resolveLibraryTiles({
      links: [{ categoryId: ESPORTE, position: 1 }],
      categoryRows: [...rows, tab("alimentacao", { isVisible: false })],
      counts: ALL,
      always: ["alimentacao"],
      locale: "pt-BR",
    });
    expect(tiles.map((t) => t.key)).toEqual(["programas", "treinos", "gastronomia", "produtos", "dia-a-dia"]);
  });

  it("rótulo no idioma, com en/es caindo no pt-BR", () => {
    const tiles = (locale: string) =>
      resolveLibraryTiles({ links: [{ categoryId: ESPORTE, position: 1 }], categoryRows: rows, counts: ALL, locale }).find((t) => t.key === "programas")!.label;
    expect(tiles("pt-BR")).toBe("Treinos guiados");
    expect(tiles("en")).toBe("Guided workouts");
    expect(tiles("es")).toBe("Treinos guiados");
  });

  it("desempate de ordem igual: a ordem padrão das fontes", () => {
    const config = resolveLibraryConfig({ categoryId: ESPORTE, categoryRows: LIBRARY_KEYS.map((k) => tab(k, { sortOrder: 10 })) });
    expect(config.map((t) => t.key)).toEqual([...LIBRARY_KEYS]);
  });

  it("valores inválidos (ícone fora da lista, rótulo sem pt-BR) caem no padrão", () => {
    const config = resolveLibraryConfig({ categoryId: ESPORTE, categoryRows: [tab("produtos", { icon: "rocket", label: { en: "Shop" } })] });
    const produtos = config.find((t) => t.key === "produtos")!;
    expect(produtos.icon).toBe("shopping-bag");
    expect(produtos.label).toBeNull();
  });
});

describe("só a categoria principal", () => {
  const rows = [tab("programas", { label: { "pt-BR": "Treinos" } }), tab("programas", { categoryId: MUSICA, label: { "pt-BR": "Turnês" } })];

  it("posição 1 vale; a 2ª categoria é ignorada", () => {
    const label = (links: { categoryId: string; position: number }[]) =>
      resolveLibraryTiles({ links, categoryRows: rows, counts: ALL, locale: "pt-BR" }).find((t) => t.key === "programas")!.label;
    expect(label([{ categoryId: MUSICA, position: 2 }, { categoryId: ESPORTE, position: 1 }])).toBe("Treinos");
    expect(label([{ categoryId: MUSICA, position: 1 }, { categoryId: ESPORTE, position: 2 }])).toBe("Turnês");
    // principal invisível (categoria inativa não chega): vale a que restou
    expect(label([{ categoryId: MUSICA, position: 2 }])).toBe("Turnês");
    expect(label([])).toBeNull();
  });

  it("primaryCategoryId pega a menor posição", () => {
    expect(primaryCategoryId([{ categoryId: "b", position: 2 }, { categoryId: "a", position: 1 }])).toBe("a");
    expect(primaryCategoryId([])).toBeNull();
  });
});

describe("exceção do herói", () => {
  const rows = [tab("programas", { label: { "pt-BR": "Treinos" }, icon: "trophy", sortOrder: 5 }), tab("produtos", { isVisible: false })];

  it("vence a categoria campo a campo; null herda", () => {
    const config = resolveLibraryConfig({
      categoryId: ESPORTE,
      categoryRows: rows,
      overrideRows: [override("programas", { label: { "pt-BR": "Planos" } }), override("produtos", { isVisible: true }), override("dia-a-dia", { sortOrder: 1, icon: "camera" })],
    });
    const programas = config.find((t) => t.key === "programas")!;
    expect(programas.label).toEqual({ "pt-BR": "Planos" });
    expect(programas.icon).toBe("trophy");
    expect(programas.origin).toMatchObject({ label: "override", icon: "category", sortOrder: "category" });
    expect(config.find((t) => t.key === "produtos")!).toMatchObject({ isVisible: true, origin: { isVisible: "override" } });
    expect(config[0]).toMatchObject({ key: "dia-a-dia", icon: "camera", origin: { sortOrder: "override", icon: "override" } });
  });

  it("vale também sem categoria (por cima dos padrões)", () => {
    const tiles = resolveLibraryTiles({ overrideRows: [override("produtos", { isVisible: false })], counts: ALL, locale: "pt-BR" });
    expect(tiles.map((t) => t.key)).not.toContain("produtos");
    expect(tiles).toHaveLength(6);
  });

  it("pode ocultar atalho mesmo com itens", () => {
    const tiles = resolveLibraryTiles({ links: [{ categoryId: ESPORTE, position: 1 }], categoryRows: rows, overrideRows: [override("treinos", { isVisible: false })], counts: ALL, locale: "en" });
    expect(tiles.map((t) => t.key)).toEqual(["programas", "dia-a-dia", "nutricao", "alimentacao", "gastronomia"]);
    expect(tiles[0].label).toBe("Treinos");
  });
});

describe("overrideDiff: só o que difere do herdado vira exceção", () => {
  const inherited = resolveLibraryConfig({ categoryId: ESPORTE, categoryRows: [tab("programas", { label: { "pt-BR": "Treinos" } })] });
  const wanted = inherited.map((t) => ({ key: t.key, label: t.label, icon: t.icon, sortOrder: t.sortOrder, isVisible: t.isVisible }));

  it("igual ao herdado: nenhuma exceção", () => {
    expect(overrideDiff(inherited, wanted)).toEqual([]);
  });

  it("guarda só os campos alterados", () => {
    const changed = wanted.map((t) => (t.key === "programas" ? { ...t, label: { "pt-BR": "Planos" } } : t.key === "produtos" ? { ...t, isVisible: false, icon: "star" as const } : t));
    expect(overrideDiff(inherited, changed)).toEqual([
      { source_key: "programas", label: { "pt-BR": "Planos" }, icon: null, sort_order: null, is_visible: null },
      { source_key: "produtos", label: null, icon: "star", sort_order: null, is_visible: false },
    ]);
  });

  it("troca de ordem guarda só as posições que mudaram e o resultado bate com o pedido", () => {
    const swapped = [...wanted];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const renumbered = swapped.map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));
    const diff = overrideDiff(inherited, renumbered);
    expect(diff.map((d) => [d.source_key, d.sort_order])).toEqual([
      ["nutricao", 10],
      ["dia-a-dia", 20],
    ]);
    const after = resolveLibraryConfig({
      categoryId: ESPORTE,
      categoryRows: [tab("programas", { label: { "pt-BR": "Treinos" } })],
      overrideRows: diff.map((d) => ({ sourceKey: d.source_key, label: d.label, icon: d.icon, sortOrder: d.sort_order, isVisible: d.is_visible })),
    });
    expect(after.map((t) => t.key)).toEqual(renumbered.map((t) => t.key));
  });
});

describe("rótulos", () => {
  it("parseLibraryLabel exige pt-BR e apara espaços", () => {
    expect(parseLibraryLabel({ "pt-BR": "  Treinos ", en: " ", es: "Entrenos" })).toEqual({ "pt-BR": "Treinos", es: "Entrenos" });
    expect(parseLibraryLabel({ en: "Food" })).toBeNull();
    expect(parseLibraryLabel(null)).toBeNull();
    expect(parseLibraryLabel(["x"])).toBeNull();
    expect(parseLibraryLabel("Treinos")).toBeNull();
  });

  it("labelForLocale cai no pt-BR", () => {
    expect(labelForLocale({ "pt-BR": "Treinos", en: "Workouts" }, "en")).toBe("Workouts");
    expect(labelForLocale({ "pt-BR": "Treinos" }, "es")).toBe("Treinos");
    expect(labelForLocale(null, "en")).toBeNull();
  });

  it("duplicateLabels avisa rótulos repetidos entre visíveis (sem diferenciar maiúsculas)", () => {
    expect(duplicateLabels([
      { visible: true, text: "Treinos" },
      { visible: true, text: "treinos " },
      { visible: true, text: "Produtos" },
      { visible: false, text: "Produtos" },
    ])).toEqual(["Treinos"]);
    expect(duplicateLabels([{ visible: true, text: "A" }, { visible: true, text: "B" }])).toEqual([]);
  });
});
