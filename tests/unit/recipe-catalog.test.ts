import { describe, expect, it } from "vitest";
import { orderByIds, splitMinutes, toRecipeCard } from "@/lib/recipes/card";
import {
  activeRecipeFilters,
  catalogFilterNames,
  EMPTY_RECIPE_PARAMS,
  hasRecipeCriteria,
  nextRecipeCursor,
  parseRecipeCatalogParams,
  recipeCatalogArgs,
  recipeCatalogHref,
  withoutRecipeFilter,
} from "@/lib/recipes/catalog-params";

// Catálogo de receitas (fase 3): parâmetros da URL lidos só na aba Receitas, links dos filtros, o
// evento sem valores de saúde, os argumentos da recipe_catalog, o cursor e o card público.

describe("parseRecipeCatalogParams", () => {
  it("sem nada na URL: padrão (relevância, nenhum filtro)", () => {
    expect(parseRecipeCatalogParams({})).toEqual(EMPTY_RECIPE_PARAMS);
  });

  it("lê busca, categoria, tempo, dificuldade, dietas e alérgenos (múltiplos) e a ordem", () => {
    const p = parseRecipeCatalogParams({ q: "  cabotiá ", cat: "almoco", tempo: "15", dif: "beginner", dieta: ["vegan", "gluten_free"], sem: "egg", ordem: "quick" });
    expect(p).toEqual({ q: "cabotiá", cat: "almoco", tempo: 15, dif: "beginner", dieta: ["vegan", "gluten_free"], sem: ["egg"], ordem: "quick" });
  });

  it("valor inválido vira 'sem filtro' em vez de quebrar a página", () => {
    const p = parseRecipeCatalogParams({ cat: "Almoço!", tempo: "20", dif: "chef", dieta: ["keto", "vegan"], sem: ["glúten"], ordem: "rating" });
    expect(p).toEqual({ ...EMPTY_RECIPE_PARAMS, dieta: ["vegan"] });
  });

  it("dietas e alérgenos ficam na ordem da lista fixa e sem repetir (URL estável)", () => {
    expect(parseRecipeCatalogParams({ dieta: ["low_sodium", "vegan", "vegan"], sem: ["sesame", "peanut"] })).toMatchObject({ dieta: ["vegan", "low_sodium"], sem: ["peanut", "sesame"] });
  });

  it("busca cortada em 100 caracteres", () => {
    expect(parseRecipeCatalogParams({ q: "a".repeat(150) }).q).toHaveLength(100);
  });
});

describe("links e chips dos filtros", () => {
  const p = parseRecipeCatalogParams({ q: "ovo", cat: "almoco", tempo: "30", dieta: ["vegan", "gluten_free"], sem: ["egg"], ordem: "recent" });

  it("monta a URL do Explorar com a aba fixa e repete dieta/sem", () => {
    expect(recipeCatalogHref("/explore", p, [["tab", "receitas"]])).toBe("/explore?tab=receitas&q=ovo&cat=almoco&tempo=30&dieta=vegan&dieta=gluten_free&sem=egg&ordem=recent");
    expect(recipeCatalogHref("/personalities/erick-jacquin/receitas", EMPTY_RECIPE_PARAMS)).toBe("/personalities/erick-jacquin/receitas");
  });

  it("chips removíveis: tirar um mantém os outros", () => {
    const active = activeRecipeFilters(p);
    expect(active.map((f) => `${f.key}=${f.value}`)).toEqual(["cat=almoco", "tempo=30", "dieta=vegan", "dieta=gluten_free", "sem=egg"]);
    expect(withoutRecipeFilter(p, { key: "dieta", value: "vegan" }).dieta).toEqual(["gluten_free"]);
    expect(withoutRecipeFilter(p, { key: "cat", value: "almoco" }).cat).toBeNull();
    expect(withoutRecipeFilter(p, { key: "sem", value: "egg" }).sem).toEqual([]);
  });

  it("a ordem sozinha não conta como critério", () => {
    expect(hasRecipeCriteria({ ...EMPTY_RECIPE_PARAMS, ordem: "quick" })).toBe(false);
    expect(hasRecipeCriteria({ ...EMPTY_RECIPE_PARAMS, q: "x" })).toBe(true);
  });

  it("o evento recipe.catalog_filter leva só os NOMES (nunca a dieta, o alérgeno ou o texto)", () => {
    const names = catalogFilterNames(p);
    expect(names).toEqual(["q", "cat", "tempo", "dieta", "sem", "ordem"]);
    expect(names.join(",")).not.toMatch(/vegan|egg|gluten|ovo/);
  });
});

describe("recipe_catalog: argumentos e cursor", () => {
  it("listas vazias e padrões viram undefined (sem filtro no banco)", () => {
    expect(recipeCatalogArgs(EMPTY_RECIPE_PARAMS)).toEqual({
      p_query: undefined,
      p_categories: undefined,
      p_max_minutes: undefined,
      p_difficulty: undefined,
      p_diets: undefined,
      p_exclude_allergens: undefined,
      p_creator: undefined,
      p_sort: "relevance",
      p_cursor: undefined,
      p_limit: 24,
    });
  });

  it("filtros, chef e cursor chegam como a função espera", () => {
    const args = recipeCatalogArgs(parseRecipeCatalogParams({ cat: "almoco", tempo: "15", sem: ["egg"], dieta: "vegan" }), { creator: "c1", cursor: "24", limit: 12 });
    expect(args).toMatchObject({ p_categories: ["almoco"], p_max_minutes: 15, p_exclude_allergens: ["egg"], p_diets: ["vegan"], p_creator: "c1", p_cursor: "24", p_limit: 12 });
  });

  it("próxima página só quando a atual veio cheia; o cursor é o da última linha", () => {
    expect(nextRecipeCursor([{ cursor: "1" }, { cursor: "2" }], 2)).toBe("2");
    expect(nextRecipeCursor([{ cursor: "1" }], 2)).toBeNull();
    expect(nextRecipeCursor([], 2)).toBeNull();
  });
});

describe("card público da receita", () => {
  const row = {
    id: "g2",
    slug: "omelete-g2",
    title: "Omelete",
    cover_url: null,
    pillar: "gastronomy" as const,
    access_level: "free" as const,
    difficulty: "beginner" as const,
    required_module: null,
    creator: { slug: "erick-jacquin", name: "Érick Jacquin", avatar_url: null, is_fictional: false },
  };

  it("alérgenos só quando declarados; lixo fora da lista é descartado", () => {
    const declared = toRecipeCard({ ...row, details: { total_minutes: 30, servings: 8, diets: ["vegetarian", "keto"], allergens: ["milk", "egg"], allergens_declared: true } });
    expect(declared).toMatchObject({ totalMinutes: 30, servings: 8, allergensDeclared: true, allergens: ["milk", "egg"], diets: ["vegetarian"] });
    const unknown = toRecipeCard({ ...row, details: [{ total_minutes: 35, servings: 2, diets: [], allergens: ["egg"], allergens_declared: false }] });
    expect(unknown).toMatchObject({ allergensDeclared: false, allergens: [] });
    expect(toRecipeCard({ ...row, details: null })).toMatchObject({ totalMinutes: null, servings: null, allergensDeclared: false });
  });

  it("mantém a ordem do catálogo e descarta o que a RLS escondeu", () => {
    expect(orderByIds([{ id: "b" }, { id: "a" }], ["a", "x", "b"]).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("formata o tempo em horas e minutos", () => {
    expect(splitMinutes(35)).toEqual({ h: 0, m: 35 });
    expect(splitMinutes(65)).toEqual({ h: 1, m: 5 });
    expect(splitMinutes(120)).toEqual({ h: 2, m: 0 });
  });
});
