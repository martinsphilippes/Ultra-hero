import { describe, expect, it } from "vitest";
import {
  categoriesByCreator,
  creatorsForCategory,
  HERO_CATEGORY_MAX,
  HERO_PAGE_MAX,
  HERO_PAGE_SIZE,
  heroPageSlice,
  parseCategoryParam,
  parsePageParam,
  personalitiesHref,
  resolveCategory,
  validateCategorySelection,
  visibleCategories,
  type HeroCategory,
  type HeroCategoryLink,
} from "@/lib/heroes/categories";

// Seed da 0049: 4 atletas em Esporte, Anitta em Música + Arte e Entretenimento, Jacquin em Gastronomia.
const categories: HeroCategory[] = [
  { id: "c-arte", slug: "arte-e-entretenimento", name: { "pt-BR": "Arte e Entretenimento" }, sortOrder: 40 },
  { id: "c-esporte", slug: "esporte", name: { "pt-BR": "Esporte" }, sortOrder: 10 },
  { id: "c-gastro", slug: "gastronomia", name: { "pt-BR": "Gastronomia" }, sortOrder: 30 },
  { id: "c-musica", slug: "musica", name: { "pt-BR": "Música" }, sortOrder: 20 },
  { id: "c-moda", slug: "moda", name: { "pt-BR": "Moda" }, sortOrder: 50 },
];
const creators = [{ id: "neymar" }, { id: "medina" }, { id: "fonseca" }, { id: "ronaldinho" }, { id: "anitta" }, { id: "jacquin" }];
const links: HeroCategoryLink[] = [
  { creatorId: "neymar", categoryId: "c-esporte", position: 1 },
  { creatorId: "medina", categoryId: "c-esporte", position: 1 },
  { creatorId: "fonseca", categoryId: "c-esporte", position: 1 },
  { creatorId: "ronaldinho", categoryId: "c-esporte", position: 1 },
  { creatorId: "anitta", categoryId: "c-arte", position: 2 },
  { creatorId: "anitta", categoryId: "c-musica", position: 1 },
  { creatorId: "jacquin", categoryId: "c-gastro", position: 1 },
  // Hero suspenso (fora da lista visível) numa categoria só dele
  { creatorId: "suspenso", categoryId: "c-moda", position: 1 },
];
const visibleIds = creators.map((c) => c.id);

describe("parseCategoryParam", () => {
  it("aceita slug válido e normaliza para minúsculas", () => {
    expect(parseCategoryParam("esporte")).toBe("esporte");
    expect(parseCategoryParam(" Arte-e-Entretenimento ")).toBe("arte-e-entretenimento");
    expect(parseCategoryParam(["musica", "esporte"])).toBe("musica");
  });
  it("vazio, 'todos' e lixo viram null (Todos)", () => {
    expect(parseCategoryParam(undefined)).toBeNull();
    expect(parseCategoryParam(null)).toBeNull();
    expect(parseCategoryParam("")).toBeNull();
    expect(parseCategoryParam("todos")).toBeNull();
    expect(parseCategoryParam("TODOS")).toBeNull();
    expect(parseCategoryParam("../admin")).toBeNull();
    expect(parseCategoryParam("a b")).toBeNull();
    expect(parseCategoryParam("-esporte")).toBeNull();
  });
});

describe("visibleCategories", () => {
  it("na ordem do admin, só com Hero visível, com a contagem", () => {
    const visible = visibleCategories(categories, links, visibleIds);
    expect(visible.map((c) => [c.slug, c.count])).toEqual([
      ["esporte", 4],
      ["musica", 1],
      ["gastronomia", 1],
      ["arte-e-entretenimento", 1],
    ]);
  });
  it("esconde a categoria cujo único Hero não está visível (suspenso)", () => {
    expect(visibleCategories(categories, links, visibleIds).some((c) => c.slug === "moda")).toBe(false);
    expect(visibleCategories(categories, links, [...visibleIds, "suspenso"]).at(-1)?.slug).toBe("moda");
  });
  it("sem a 0049 (listas vazias): nenhuma categoria, só Todos", () => {
    expect(visibleCategories([], [], visibleIds)).toEqual([]);
    expect(visibleCategories(categories, [], visibleIds)).toEqual([]);
  });
  it("empate de ordem: desempata pelo slug", () => {
    const tied = [
      { id: "b", slug: "b-cat", name: {}, sortOrder: 10 },
      { id: "a", slug: "a-cat", name: {}, sortOrder: 10 },
    ];
    const tiedLinks = [
      { creatorId: "neymar", categoryId: "a", position: 1 },
      { creatorId: "neymar", categoryId: "b", position: 2 },
    ];
    expect(visibleCategories(tied, tiedLinks, ["neymar"]).map((c) => c.slug)).toEqual(["a-cat", "b-cat"]);
  });
});

describe("resolveCategory e creatorsForCategory", () => {
  const visible = visibleCategories(categories, links, visibleIds);
  it("slug conhecido seleciona; desconhecido ou escondido cai em Todos", () => {
    expect(resolveCategory("musica", visible)?.id).toBe("c-musica");
    expect(resolveCategory("nao-existe", visible)).toBeNull();
    expect(resolveCategory("moda", visible)).toBeNull();
    expect(resolveCategory(null, visible)).toBeNull();
  });
  it("filtra os Heros mantendo a ordem editorial", () => {
    expect(creatorsForCategory(creators, links, "c-esporte").map((c) => c.id)).toEqual(["neymar", "medina", "fonseca", "ronaldinho"]);
    expect(creatorsForCategory(creators, links, "c-arte").map((c) => c.id)).toEqual(["anitta"]);
    expect(creatorsForCategory(creators, links, null)).toHaveLength(6);
  });
});

describe("categoriesByCreator", () => {
  it("selos na ordem da posição, no máximo 2, só de categorias conhecidas", () => {
    const map = categoriesByCreator(links, categories);
    expect(map.get("anitta")?.map((c) => c.slug)).toEqual(["musica", "arte-e-entretenimento"]);
    expect(map.get("jacquin")?.map((c) => c.slug)).toEqual(["gastronomia"]);
    // categoria inativa (fora da lista) não vira selo
    const onlyActive = categoriesByCreator(links, categories.filter((c) => c.id !== "c-musica"));
    expect(onlyActive.get("anitta")?.map((c) => c.slug)).toEqual(["arte-e-entretenimento"]);
    const extra = [...links, { creatorId: "anitta", categoryId: "c-esporte", position: 3 }];
    expect(categoriesByCreator(extra, categories).get("anitta")).toHaveLength(HERO_CATEGORY_MAX);
  });
});

describe("personalitiesHref", () => {
  it("Todos é a aba sem parâmetro; categoria vai em ?categoria=", () => {
    expect(personalitiesHref(null)).toBe("/personalities");
    expect(personalitiesHref("esporte")).toBe("/personalities?categoria=esporte");
  });

  it("página > 1 vai em ?pagina= (com a categoria); 1 e lixo ficam fora; teto de páginas", () => {
    expect(personalitiesHref(null, 1)).toBe("/personalities");
    expect(personalitiesHref(null, 2)).toBe("/personalities?pagina=2");
    expect(personalitiesHref("musica", 3)).toBe("/personalities?categoria=musica&pagina=3");
    expect(personalitiesHref(null, 0)).toBe("/personalities");
    expect(personalitiesHref(null, 1.5)).toBe("/personalities");
    expect(personalitiesHref(null, 999)).toBe(`/personalities?pagina=${HERO_PAGE_MAX}`);
  });
});

describe("parsePageParam", () => {
  it("inteiro de 1 ao teto; lixo vira 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam([" 3 ", "9"])).toBe(3);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("2.5")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("9999")).toBe(HERO_PAGE_MAX);
    expect(parsePageParam("1e9")).toBe(1);
  });
});

describe("heroPageSlice (Ver mais da aba Hero)", () => {
  const heroes = Array.from({ length: 261 }, (_, i) => i);

  it("mostra blocos de HERO_PAGE_SIZE e aponta a próxima página até mostrar todos", () => {
    expect(HERO_PAGE_SIZE).toBe(48);
    expect(heroPageSlice(heroes, 1)).toEqual({ shown: heroes.slice(0, 48), nextPage: 2 });
    expect(heroPageSlice(heroes, 5).shown).toHaveLength(240);
    expect(heroPageSlice(heroes, 5).nextPage).toBe(6);
    expect(heroPageSlice(heroes, 6)).toEqual({ shown: heroes, nextPage: null });
    expect(heroPageSlice(heroes, 50)).toEqual({ shown: heroes, nextPage: null });
  });

  it("lista curta: tudo de uma vez, sem Ver mais; página inválida conta como 1", () => {
    expect(heroPageSlice([1, 2, 3], 1)).toEqual({ shown: [1, 2, 3], nextPage: null });
    expect(heroPageSlice([], 1)).toEqual({ shown: [], nextPage: null });
    expect(heroPageSlice(heroes, 0)).toEqual({ shown: heroes.slice(0, 48), nextPage: 2 });
  });

  it("no teto de páginas não oferece mais", () => {
    const many = Array.from({ length: HERO_PAGE_SIZE * HERO_PAGE_MAX + 5 }, (_, i) => i);
    expect(heroPageSlice(many, HERO_PAGE_MAX).nextPage).toBeNull();
  });
});

describe("validateCategorySelection (máximo de 2)", () => {
  it("aceita 0, 1 ou 2 categorias diferentes, na ordem dada", () => {
    expect(validateCategorySelection([])).toEqual({ ok: true, ids: [] });
    expect(validateCategorySelection(["a"])).toEqual({ ok: true, ids: ["a"] });
    expect(validateCategorySelection(["b", "a"])).toEqual({ ok: true, ids: ["b", "a"] });
  });
  it("recusa mais de 2 e repetição", () => {
    expect(validateCategorySelection(["a", "b", "c"])).toEqual({ ok: false, error: "too_many" });
    expect(validateCategorySelection(["a", "a"])).toEqual({ ok: false, error: "duplicate" });
  });
});
