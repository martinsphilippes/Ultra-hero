import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import {
  choiceFromHeroInfo,
  choiceFromSearch,
  choiceFromTyped,
  fichaLinks,
  formActions,
  heroChoiceSchema,
  heroChoiceToDb,
  heroHasConsent,
  heroKey,
  heroPagePath,
  heroSelectable,
  mergeHeroPages,
  parseOpportunityHeroes,
  publishBlock,
  toHeroInfo,
  type OpportunityHero,
} from "@/lib/sponsorship/hero-pick";
import { sponsorshipSchema, toAgencySponsorshipDetail, toAgencySponsorships, toBrandSponsorships, SPONSORSHIP_STATUSES } from "@/lib/sponsorship/vocab";
import { validateTypedHero } from "@/lib/deals/hero-suggest";

const T1 = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";

const castingRow = { kind: "talent", talent_id: T1, creator_id: C1, slug: "ana", name: "Ana", avatar_url: "https://i/a.png", headline: "Corre", pillars: ["training", "routine"], followers: 1200, scope: "casting", consent: "active", socials: { instagram: "@ana" } };
const outsideRow = { kind: "hero", talent_id: null, creator_id: C1, slug: "beto", name: "Beto", avatar_url: null, headline: null, pillars: [], followers: null, scope: "outside", consent: null, socials: {} };

describe("busca de heróis da oportunidade", () => {
  it("lê a RPC com tolerância: linha ruim some, campos limpos", () => {
    const page = parseOpportunityHeroes({ items: [castingRow, outsideRow, { kind: "hero", name: "sem id", scope: "outside" }, { kind: "talent", talent_id: T1 }, null, { kind: "x", name: "Z", talent_id: T1 }], has_more: true });
    expect(page.items.map((h) => h.name)).toEqual(["Ana", "Beto"]);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({ kind: "talent", talentId: T1, creatorId: C1, consent: "active", followers: 1200, pillars: ["training", "routine"] });
    expect(page.items[0].socials.instagram).toBe("@ana");
    expect(page.items[1]).toMatchObject({ kind: "hero", talentId: null, consent: null, avatarUrl: null });
  });
  it("escopo desconhecido vira indisponível (nunca selecionável por engano)", () => {
    const [h] = parseOpportunityHeroes({ items: [{ ...outsideRow, scope: "qualquer" }] }).items;
    expect(h.scope).toBe("other_agency");
    expect(heroSelectable(h.scope)).toBe(false);
  });
  it("entrada que não é objeto devolve lista vazia", () => {
    expect(parseOpportunityHeroes(null)).toEqual({ items: [], hasMore: false });
    expect(parseOpportunityHeroes("x")).toEqual({ items: [], hasMore: false });
  });
  it("só casting e fora do casting são selecionáveis", () => {
    expect(heroSelectable("casting")).toBe(true);
    expect(heroSelectable("outside")).toBe(true);
    expect(heroSelectable("other_agency")).toBe(false);
    expect(heroSelectable("person_in_casting")).toBe(false);
  });
  it("junta a próxima página sem repetir (ficha e herói têm chaves diferentes)", () => {
    const { items } = parseOpportunityHeroes({ items: [castingRow, outsideRow] });
    expect(heroKey(items[0])).toBe(`t:${T1}`);
    expect(heroKey(items[1])).toBe(`h:${C1}`);
    const next: OpportunityHero[] = [items[1], { ...items[1], creatorId: "33333333-3333-4333-8333-333333333333", name: "Caio" }];
    expect(mergeHeroPages(items, next).map((h) => h.name)).toEqual(["Ana", "Beto", "Caio"]);
  });
});

describe("herói escolhido e o que vai para a RPC", () => {
  const { items } = parseOpportunityHeroes({ items: [castingRow, outsideRow] });
  it("ficha do casting: kind talent com o consentimento da ficha", () => {
    const c = choiceFromSearch(items[0]);
    expect(c).toMatchObject({ kind: "talent", talentId: T1, creatorId: C1, consent: "active" });
    expect(heroChoiceToDb(c)).toEqual({ kind: "talent", talent_id: T1 });
    expect(heroHasConsent(c)).toBe(true);
  });
  it("herói fora do casting: a ficha nasce ao salvar, sempre sem consentimento", () => {
    const c = choiceFromSearch(items[1]);
    expect(c).toMatchObject({ kind: "hero", talentId: null, creatorId: C1, consent: "none" });
    expect(heroChoiceToDb(c)).toEqual({ kind: "hero", creator_id: C1 });
    expect(heroHasConsent(c)).toBe(false);
  });
  it("herói digitado: nome limpo, perfil e e-mail opcionais, sem consentimento", () => {
    const checked = validateTypedHero({ name: "  Dani   <Souza> ", profile: "dani.souza", email: "Dani@Teste.COM" });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const c = choiceFromTyped(checked.value);
    expect(heroChoiceToDb(c)).toEqual({ kind: "typed", name: "Dani Souza", profile: "@dani.souza", email: "dani@teste.com" });
    expect(c.consent).toBe("none");
    expect(heroChoiceToDb(choiceFromTyped({ name: "Só Nome", profile: null, email: null }))).toEqual({ kind: "typed", name: "Só Nome", profile: "", email: "" });
  });
  it("herói que a oportunidade já tem volta como ficha do casting", () => {
    const info = toHeroInfo({ talent_id: T1, name: "Ana", has_hero: true, hero_active: true, creator_id: C1, slug: "ana", pillars: ["training"], consent: "none" });
    expect(choiceFromHeroInfo(info)).toMatchObject({ kind: "talent", talentId: T1, creatorId: C1, consent: "none", slug: "ana" });
  });
  it("schema: cada tipo exige o seu id; digitado exige nome válido", () => {
    const ok = choiceFromSearch(items[0]);
    expect(heroChoiceSchema.safeParse(ok).success).toBe(true);
    expect(heroChoiceSchema.safeParse({ ...ok, talentId: null }).success).toBe(false);
    expect(heroChoiceSchema.safeParse({ ...choiceFromSearch(items[1]), creatorId: null }).success).toBe(false);
    const typed = choiceFromTyped({ name: "Fulano", profile: null, email: null });
    expect(heroChoiceSchema.safeParse(typed).success).toBe(true);
    expect(heroChoiceSchema.safeParse({ ...typed, name: "F" }).success).toBe(false);
    expect(heroChoiceSchema.safeParse({ ...typed, email: "sem-arroba" }).success).toBe(false);
    expect(heroChoiceSchema.safeParse({ ...typed, profile: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("consentimento: só publicar exige; rascunho vale sem", () => {
  it("publishBlock", () => {
    expect(publishBlock(null)).toBe("no_hero");
    expect(publishBlock({ consent: "none" })).toBe("consent");
    expect(publishBlock({ consent: "revoked" })).toBe("consent");
    expect(publishBlock({ consent: "active" })).toBeNull();
    expect(publishBlock({ consent: "active" }, false)).toBe("inactive");
  });
  it("botões do formulário por situação", () => {
    expect(formActions("new")).toEqual({ saveDraft: true, publish: true, save: false });
    expect(formActions("draft")).toEqual({ saveDraft: true, publish: true, save: false });
    expect(formActions("open")).toEqual({ saveDraft: false, publish: false, save: true });
  });
  it("atalhos da ficha só existem com ficha (rascunho novo ainda não tem)", () => {
    expect(fichaLinks(T1)).toEqual({ ficha: `/agencia/casting/${T1}`, documents: `/agencia/casting/${T1}/documentos` });
    expect(fichaLinks(null)).toBeNull();
  });
  it("rascunho é uma situação da oportunidade", () => {
    expect(SPONSORSHIP_STATUSES).toContain("draft");
  });
});

describe("formulário: herói e publicar entram no schema", () => {
  const base = {
    id: null, title: "Maratona", description: "", location: "", date: "2026-11-20", endDate: "", startTime: "08:00", endTime: "13:00", allDay: false, expectedReach: "",
    perks: [], networks: ["instagram" as const], respondDate: "2026-11-15", respondTime: "18:00", audience: "all" as const, brandIds: [],
    tiers: [{ id: null, name: "Cota única", priceCents: null, perks: ["Logo na camiseta"], slots: 1 }],
    public: { targetAudience: "", targetAgeBands: [], targetStates: [], regionNote: "" },
    publish: false,
  };
  it("herói obrigatório; sem ele não passa", () => {
    const hero = choiceFromSearch(parseOpportunityHeroes({ items: [outsideRow] }).items[0]);
    expect(sponsorshipSchema.safeParse({ ...base, hero }).success).toBe(true);
    expect(sponsorshipSchema.safeParse({ ...base, hero: null }).success).toBe(false);
    expect(sponsorshipSchema.safeParse({ ...base, hero: undefined }).success).toBe(false);
    expect(sponsorshipSchema.safeParse({ ...base, hero, publish: undefined }).success).toBe(false);
  });
});

describe("leituras trazem o herói", () => {
  const hero = { talent_id: T1, name: "Ana", has_hero: true, hero_active: true, creator_id: C1, slug: "ana", avatar_url: "https://i/a.png", headline: "Corre", pillars: ["training"], consent: "active" };
  it("toHeroInfo tolera vazio e entrega endereço da página só com slug", () => {
    expect(toHeroInfo(null, "Fallback", T1)).toMatchObject({ name: "Fallback", talentId: T1, hasHero: false, heroActive: false, consent: "none", slug: null, pillars: [] });
    const info = toHeroInfo(hero);
    expect(info).toMatchObject({ hasHero: true, heroActive: true, consent: "active", creatorId: C1 });
    expect(heroPagePath(info)).toBe("/personalities/ana");
    expect(heroPagePath(toHeroInfo({ ...hero, slug: undefined }))).toBeNull();
  });
  it("lista e detalhe da agência (inclusive rascunho)", () => {
    const [row] = toAgencySponsorships([{ id: "o1", title: "M", status: "draft", talent_id: T1, talent_name: "Ana", hero }]);
    expect(row.status).toBe("draft");
    expect(row.hero.slug).toBe("ana");
    const d = toAgencySponsorshipDetail({ opportunity: { id: "o1", agency_id: "a", talent_id: T1, talent_name: "Ana", status: "draft", hero: { ...hero, consent: "none" } }, tiers: [], proposals: [], brands: [] });
    expect(d?.hero.consent).toBe("none");
    expect(d?.status).toBe("draft");
  });
  it("marca: herói com foto, nome, nicho e página; sem consentimento só o nome", () => {
    const [full, bare] = toBrandSponsorships([
      { id: "o1", title: "M", status: "open", talent: { id: T1, name: "Ana", in_catalog: true }, hero: { talent_id: T1, name: "Ana", has_hero: true, hero_active: true, creator_id: C1, slug: "ana", avatar_url: "https://i/a.png", pillars: ["training"] } },
      { id: "o2", title: "N", status: "open", talent: { id: T1, name: "Ana", in_catalog: false }, hero: { talent_id: T1, name: "Ana", has_hero: true, hero_active: true, pillars: [] } },
    ]);
    expect(full.hero).toMatchObject({ name: "Ana", slug: "ana", avatarUrl: "https://i/a.png", pillars: ["training"] });
    expect(bare.hero.slug).toBeNull();
    expect(heroPagePath(bare.hero)).toBeNull();
    expect(bare.hero.name).toBe("Ana");
    // sem a chave hero (RPC antiga): cai no nome da ficha
    expect(toBrandSponsorships([{ id: "o3", title: "X", status: "open", talent: { id: T1, name: "Sem hero" } }])[0].hero.name).toBe("Sem hero");
  });
});

describe("erros e textos", () => {
  it("herói inativo é um código conhecido e traduzido", () => {
    expect(AGENCY_ERROR_CODES).toContain("hero_inactive");
    expect(agencyErrorCode(new Error("hero_inactive"))).toBe("hero_inactive");
    expect(agencyErrorCode(new Error("consent_required"))).toBe("consent_required");
    for (const l of ["pt-BR", "en", "es"]) {
      const agency = JSON.parse(readFileSync(path.join(process.cwd(), "messages", l, "agency.json"), "utf8")) as { errors: Record<string, string> };
      expect(agency.errors.hero_inactive).toBeTruthy();
    }
  });
  it("os três idiomas têm a tela do herói e sem 'creator' nas telas da oportunidade", () => {
    for (const l of ["pt-BR", "en", "es"]) {
      const d = JSON.parse(readFileSync(path.join(process.cwd(), "messages", l, "sponsorship.json"), "utf8")) as { agency: { form: Record<string, unknown>; draft: Record<string, string> }; hero: Record<string, unknown>; status: Record<string, string>; brand: Record<string, string> };
      for (const k of ["hero", "heroHint", "heroLocked", "heroRequired", "consentNotice", "saveDraft", "publishDraft", "heroPicker"]) expect(d.agency.form[k], `${l} form.${k}`).toBeTruthy();
      expect(d.agency.form.talent).toBeUndefined();
      expect(d.agency.form.noTalents).toBeUndefined();
      expect(d.status.draft).toBeTruthy();
      expect(d.agency.draft.publish).toBeTruthy();
      expect(d.hero.seePage).toBeTruthy();
      expect(d.brand.seeCatalog).toBeTruthy();
    }
    // pt-BR: a tela da agência e da marca fala em herói (creator fica para login/pessoa/consulta)
    const pt = JSON.parse(readFileSync(path.join(process.cwd(), "messages", "pt-BR", "sponsorship.json"), "utf8")) as { agency: { form: { heroHint: string; consentNotice: string; tiers: { hintAdmin: string } }; description: string }; brand: { description: string } };
    expect(pt.agency.form.heroHint).toContain("herói");
    expect(pt.agency.form.consentNotice).toContain("Documentos");
    expect(pt.agency.form.consentNotice).toContain("Portal do Herói");
    expect(JSON.stringify([pt.agency.description, pt.brand.description, pt.agency.form.tiers.hintAdmin])).not.toMatch(/heroi/i);
  });
});
