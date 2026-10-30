import { describe, expect, it } from "vitest";
import {
  matchesFilter,
  pageSlice,
  parseFilterParam,
  productsForFilter,
  resolveFilter,
  SHOP_PAGE_SIZE,
  shopHref,
  slugifyLabel,
  visibleFilters,
  type ShopFilterRule,
  type ShopIndexItem,
} from "@/lib/shop/filters";

const items: ShopIndexItem[] = [
  { id: "p1", categoryCode: "supplement" },
  { id: "p2", categoryCode: "meal" },
  { id: "p3", categoryCode: "ingredient_kit" },
  { id: "p4", categoryCode: "training_accessory" },
  { id: "p5", categoryCode: "supplement" },
  { id: "p6", categoryCode: null },
];

function rule(partial: Partial<ShopFilterRule> & { slug: string }): ShopFilterRule {
  return { id: partial.slug, name: { "pt-BR": partial.slug }, sortOrder: 100, categoryCodes: [], productIds: [], ...partial };
}

describe("filtro da loja: categoria OU produto escolhido à mão", () => {
  it("casa pela categoria", () => {
    expect(matchesFilter(items[0], { categoryCodes: ["supplement"], productIds: [] })).toBe(true);
    expect(matchesFilter(items[1], { categoryCodes: ["supplement"], productIds: [] })).toBe(false);
  });

  it("casa pelo produto escolhido mesmo fora das categorias", () => {
    expect(matchesFilter(items[3], { categoryCodes: ["supplement"], productIds: ["p4"] })).toBe(true);
  });

  it("produto sem categoria só entra escolhido à mão", () => {
    expect(matchesFilter(items[5], { categoryCodes: ["supplement"], productIds: [] })).toBe(false);
    expect(matchesFilter(items[5], { categoryCodes: [], productIds: ["p6"] })).toBe(true);
  });

  it("filtro sem regra não mostra nada; 'Tudo' (null) mostra todos na ordem recebida", () => {
    expect(productsForFilter(items, { categoryCodes: [], productIds: [] })).toEqual([]);
    expect(productsForFilter(items, null).map((i) => i.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("união sem duplicar e preservando a ordem da loja", () => {
    const result = productsForFilter(items, { categoryCodes: ["meal", "ingredient_kit"], productIds: ["p5", "p2"] });
    expect(result.map((i) => i.id)).toEqual(["p2", "p3", "p5"]);
  });
});

describe("chips visíveis", () => {
  const rules = [
    rule({ slug: "futebol", sortOrder: 50 }),
    rule({ slug: "alimentacao", sortOrder: 20, categoryCodes: ["meal", "ingredient_kit"] }),
    rule({ slug: "suplementos", sortOrder: 10, categoryCodes: ["supplement"] }),
    rule({ slug: "surf", sortOrder: 40, productIds: ["inexistente"] }),
    rule({ slug: "acessorios", sortOrder: 20, productIds: ["p4"] }),
  ];

  it("ordem do admin (desempate pelo slug) e escondidos os sem produto visível", () => {
    const visible = visibleFilters(rules, items);
    expect(visible.map((r) => [r.slug, r.count])).toEqual([
      ["suplementos", 2],
      ["acessorios", 1],
      ["alimentacao", 2],
    ]);
  });

  it("filtro desconhecido ou escondido cai em 'Tudo'", () => {
    const visible = visibleFilters(rules, items);
    expect(resolveFilter("suplementos", visible)?.slug).toBe("suplementos");
    expect(resolveFilter("futebol", visible)).toBeNull();
    expect(resolveFilter("nao-existe", visible)).toBeNull();
    expect(resolveFilter(null, visible)).toBeNull();
  });

  it("sem filtros (banco sem a 0047): nenhum chip além de 'Tudo'", () => {
    expect(visibleFilters([], items)).toEqual([]);
  });
});

describe("parâmetro ?filtro= da URL", () => {
  it("aceita slug válido e normaliza caixa e espaços", () => {
    expect(parseFilterParam("suplementos")).toBe("suplementos");
    expect(parseFilterParam("  Suplementos ")).toBe("suplementos");
    expect(parseFilterParam("bem-estar-2")).toBe("bem-estar-2");
  });

  it("usa o primeiro valor repetido", () => {
    expect(parseFilterParam(["surf", "futebol"])).toBe("surf");
  });

  it("vazio, 'tudo' e lixo viram null (Tudo)", () => {
    for (const raw of [undefined, null, "", "tudo", "TUDO", "a b", "x,y", "../admin", "-surf", "surf-", "a--b", "%20"]) {
      expect(parseFilterParam(raw)).toBeNull();
    }
  });

  it("corta em 40 caracteres", () => {
    expect(parseFilterParam("a".repeat(60))).toBe("a".repeat(40));
  });

  it("link do chip: 'Tudo' é /shop e os demais levam ?filtro=", () => {
    expect(shopHref(null)).toBe("/shop");
    expect(shopHref("suplementos")).toBe("/shop?filtro=suplementos");
  });
});

describe("paginação e slug", () => {
  it("15 por página com cursor da próxima", () => {
    const list = Array.from({ length: 32 }, (_, i) => i);
    expect(SHOP_PAGE_SIZE).toBe(15);
    expect(pageSlice(list, 0)).toEqual({ page: list.slice(0, 15), hasMore: true, nextOffset: 15 });
    expect(pageSlice(list, 15).hasMore).toBe(true);
    expect(pageSlice(list, 30)).toEqual({ page: [30, 31], hasMore: false, nextOffset: 45 });
    expect(pageSlice(list.slice(0, 15), 0).hasMore).toBe(false);
  });

  it("sugere slug sem acento a partir do rótulo", () => {
    expect(slugifyLabel("Alimentação")).toBe("alimentacao");
    expect(slugifyLabel("Tênis & Corrida!")).toBe("tenis-corrida");
    expect(slugifyLabel("  Bem-estar  ")).toBe("bem-estar");
  });
});
