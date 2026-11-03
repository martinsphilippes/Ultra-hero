import { describe, expect, it } from "vitest";
import { agencyErrorCode } from "@/lib/agency/error-codes";
import {
  buildSuggestItems,
  checkSuggestLimits,
  cleanHeroName,
  filterAndSortCasting,
  followersLabel,
  fold,
  mergePlatformPages,
  MAX_NEW_PER_SAVE,
  MAX_SUGGEST,
  newFichaCount,
  normalizeProfileRef,
  normalizeQuery,
  parseHeroSearch,
  sameTypedName,
  scopeBadge,
  validateTypedHero,
  type PlatformHero,
  type SuggestItem,
} from "@/lib/deals/hero-suggest";
import type { Reason } from "@/lib/deals/vocab";

const met = (code: Reason["code"], ok: boolean): Reason => ({ code, met: ok, detail: [] });

describe("busca local e ordenação do casting", () => {
  const list = [
    { id: "a", name: "Zélia", slug: "zelia", reasons: [met("segment", true), met("region", false)] },
    { id: "b", name: "Bruno", slug: "bruno-fit", reasons: [met("segment", true), met("region", true)] },
    { id: "c", name: "Ana", slug: null, reasons: [met("segment", true), met("region", true)] },
    { id: "d", name: "Caio", slug: "caio", reasons: [] },
  ];
  it("ordena por critérios atendidos e depois pelo nome", () => {
    expect(filterAndSortCasting(list, "").map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("filtra por nome ou endereço, sem acento nem caixa", () => {
    expect(filterAndSortCasting(list, "ZELIA").map((x) => x.id)).toEqual(["a"]);
    expect(filterAndSortCasting(list, "bruno-fit").map((x) => x.id)).toEqual(["b"]);
    expect(filterAndSortCasting(list, "zz")).toEqual([]);
  });
  it("não muda a lista original", () => {
    const copy = [...list];
    filterAndSortCasting(list, "");
    expect(list).toEqual(copy);
  });
  it("fold e normalizeQuery", () => {
    expect(fold("Hérói AÇÃO")).toBe("heroi acao");
    expect(normalizeQuery("  ana \n  souza\t")).toBe("ana souza");
    expect(normalizeQuery("x".repeat(100))).toHaveLength(60);
  });
});

describe("selos", () => {
  it("só 'no casting' e 'fora do casting' são selecionáveis", () => {
    expect(scopeBadge("casting")).toMatchObject({ selectable: true, variant: "success" });
    expect(scopeBadge("outside")).toMatchObject({ selectable: true, variant: "info" });
    expect(scopeBadge("other_agency")).toMatchObject({ selectable: false, variant: "warning" });
    expect(scopeBadge("person_in_casting")).toMatchObject({ selectable: false });
  });
  it("seguidores em forma compacta", () => {
    expect(followersLabel(null, "pt-BR")).toBeNull();
    expect(followersLabel(0, "pt-BR")).toBeNull();
    expect(followersLabel(1500, "en")).toBe("1.5K");
  });
});

describe("parseHeroSearch", () => {
  const row = { id: "h1", slug: "s", name: "Herói", avatar_url: " ", headline: "x", pillars: ["training", 3, "routine"], followers: 1200, scope: "outside", socials: { instagram: "@a", youtube: "", site: null } };
  it("lê a página e o has_more", () => {
    const page = parseHeroSearch({ items: [row], has_more: true });
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({ id: "h1", avatarUrl: null, pillars: ["training", "routine"], followers: 1200, scope: "outside", socials: { instagram: "@a", youtube: null, site: null } });
  });
  it("selo desconhecido vira indisponível e linha malformada some", () => {
    const page = parseHeroSearch({ items: [{ ...row, scope: "qualquer" }, { id: 1 }, null], has_more: "sim" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.scope).toBe("other_agency");
    expect(page.hasMore).toBe(false);
  });
  it("entrada que não é objeto devolve lista vazia", () => {
    expect(parseHeroSearch(null)).toEqual({ items: [], hasMore: false });
    expect(parseHeroSearch("x")).toEqual({ items: [], hasMore: false });
  });
  it("mergePlatformPages não repete herói", () => {
    const a = parseHeroSearch({ items: [row] }).items;
    const b = parseHeroSearch({ items: [row, { ...row, id: "h2" }] }).items;
    expect(mergePlatformPages(a, b as PlatformHero[]).map((h) => h.id)).toEqual(["h1", "h2"]);
  });
});

describe("herói digitado", () => {
  it("limpa o nome como o banco: sem < > nem controle, espaços únicos", () => {
    expect(cleanHeroName("  Ana   <Souza>\n")).toBe("Ana Souza");
    expect(cleanHeroName("<>")).toBe("");
  });
  it("nome obrigatório de 2 a 80; perfil e e-mail opcionais", () => {
    expect(validateTypedHero({ name: "", profile: "", email: "" })).toEqual({ ok: false, errors: { name: "required" } });
    expect(validateTypedHero({ name: " <> ", profile: "", email: "" })).toEqual({ ok: false, errors: { name: "required" } });
    expect(validateTypedHero({ name: "A", profile: "", email: "" })).toEqual({ ok: false, errors: { name: "invalid" } });
    expect(validateTypedHero({ name: "x".repeat(81), profile: "", email: "" })).toEqual({ ok: false, errors: { name: "invalid" } });
    expect(validateTypedHero({ name: "Ana Souza", profile: "", email: "" })).toEqual({ ok: true, value: { name: "Ana Souza", profile: null, email: null } });
  });
  it("perfil: @, usuário solto ou link; recusa o resto; e-mail em minúsculas", () => {
    expect(validateTypedHero({ name: "Ana", profile: "@ana.souza", email: " ANA@Exemplo.com " })).toEqual({ ok: true, value: { name: "Ana", profile: "@ana.souza", email: "ana@exemplo.com" } });
    expect(validateTypedHero({ name: "Ana", profile: "javascript:alert(1)", email: "" })).toMatchObject({ ok: false, errors: { profile: "invalid" } });
    expect(validateTypedHero({ name: "Ana", profile: "", email: "sem-arroba" })).toMatchObject({ ok: false, errors: { email: "invalid" } });
    expect(validateTypedHero({ name: "", profile: "<x>", email: "x" })).toMatchObject({ ok: false, errors: { name: "required", profile: "invalid", email: "invalid" } });
  });
  it("normalizeProfileRef", () => {
    expect(normalizeProfileRef("")).toBeNull();
    expect(normalizeProfileRef("@ana")).toBe("@ana");
    expect(normalizeProfileRef("ana_fit")).toBe("@ana_fit");
    expect(normalizeProfileRef("instagram.com/ana")).toBe("https://instagram.com/ana");
    expect(normalizeProfileRef("https://youtube.com/@ana")).toBe("https://youtube.com/@ana");
    expect(normalizeProfileRef("http://a b.com")).toBeNull();
    expect(normalizeProfileRef("https://x.com/" + "a".repeat(250))).toBeNull();
    expect(normalizeProfileRef("ana..x")).toBeNull();
  });
  it("mesmo nome sem caixa nem acento", () => {
    expect(sameTypedName("Ana  Souza", "ana souza")).toBe(true);
    expect(sameTypedName("João", "Joao")).toBe(true);
    expect(sameTypedName("Ana", "Anna")).toBe(false);
  });
});

describe("lista enviada à RPC e limites", () => {
  const r = [met("segment", true)];
  it("monta fichas, heróis de fora e digitados sem repetir", () => {
    const items = buildSuggestItems({
      talents: [{ id: "t1", reasons: r }, { id: "t1", reasons: [] }],
      heroes: [{ id: "h1" }, { id: "h1" }],
      typed: [{ name: "Ana", profile: "@ana", email: null }, { name: "ana", profile: null, email: null }, { name: "Beto", profile: null, email: "b@x.com" }],
    });
    expect(items).toEqual([
      { kind: "talent", talentId: "t1", reasons: r },
      { kind: "hero", creatorId: "h1", reasons: [] },
      { kind: "typed", name: "Ana", profile: "@ana", reasons: [] },
      { kind: "typed", name: "Beto", email: "b@x.com", reasons: [] },
    ]);
    expect(newFichaCount(items)).toBe(3);
  });
  it("limites: 30 por negócio e 10 fichas novas por salvamento", () => {
    const talents = (n: number): SuggestItem[] => Array.from({ length: n }, (_, i) => ({ kind: "talent", talentId: `t${i}`, reasons: [] }));
    const heroes = (n: number): SuggestItem[] => Array.from({ length: n }, (_, i) => ({ kind: "hero", creatorId: `h${i}`, reasons: [] }));
    expect(checkSuggestLimits(talents(MAX_SUGGEST))).toBe("ok");
    expect(checkSuggestLimits(talents(MAX_SUGGEST + 1))).toBe("too_many");
    expect(checkSuggestLimits(heroes(MAX_NEW_PER_SAVE))).toBe("ok");
    expect(checkSuggestLimits(heroes(MAX_NEW_PER_SAVE + 1))).toBe("too_many_new");
    expect(checkSuggestLimits([...talents(20), ...heroes(10)])).toBe("ok");
  });
});

describe("códigos de erro da 0093", () => {
  it("reconhece os códigos novos na mensagem da RPC", () => {
    expect(agencyErrorCode({ message: "invalid_hero_name" })).toBe("invalid_hero_name");
    expect(agencyErrorCode({ message: "invalid_profile_ref" })).toBe("invalid_profile_ref");
    expect(agencyErrorCode({ message: "too_many_new_talents" })).toBe("too_many_new_talents");
    expect(agencyErrorCode({ message: "creator_already_in_casting" })).toBe("creator_already_in_casting");
  });
});
