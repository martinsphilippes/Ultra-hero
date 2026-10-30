import { describe, expect, it } from "vitest";
import { hireAction } from "@/lib/professionals/rules";
import { PROGRAM_CARD_KEYS, mergeLinkedProducts, nutritionVisible, parseCardState, programNutritionContents } from "@/lib/programs/program-cards";
import { MAX_PROGRAM_PRODUCTS, nextPendingSlug, normalizeProgramProducts, pickProgramService, startAction, supportPlan } from "@/lib/programs/support";

// Etapa 4 (0059): produto e profissional ligados ao programa, card Apoio e nova regra do Nutricional.

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const U4 = "44444444-4444-4444-8444-444444444444";

describe("lista de produtos do programa (admin)", () => {
  it("até 3, na ordem, sem repetir; nota com espaços normalizados", () => {
    expect(normalizeProgramProducts([{ productId: U1, note: "  por   que  " }, { productId: U2 }])).toEqual({
      ok: true,
      items: [
        { productId: U1, note: "por que" },
        { productId: U2, note: "" },
      ],
    });
    expect(normalizeProgramProducts([])).toEqual({ ok: true, items: [] });
    expect(MAX_PROGRAM_PRODUCTS).toBe(3);
  });

  it("recusa mais de 3, repetido, id inválido e nota longa", () => {
    expect(normalizeProgramProducts([U1, U2, U3, U4].map((productId) => ({ productId })))).toEqual({ ok: false, error: "too_many_products" });
    expect(normalizeProgramProducts([{ productId: U1 }, { productId: U1.toUpperCase() }])).toEqual({ ok: false, error: "duplicate_product" });
    expect(normalizeProgramProducts([{ productId: "abc" }])).toEqual({ ok: false, error: "invalid_input" });
    expect(normalizeProgramProducts([{ productId: U1, note: "x".repeat(201) }])).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("o que aparece: Próximos passos e card Apoio", () => {
  it("produtos só com comércio ligado e fora do app das lojas; profissionais sempre que houver", () => {
    expect(supportPlan({ products: 2, professionals: 1, commerceEnabled: true, nativeApp: false })).toEqual({
      showProducts: true,
      showProfessionals: true,
      showActions: true,
      apoioScreens: ["products", "professionals"],
    });
    expect(supportPlan({ products: 2, professionals: 1, commerceEnabled: true, nativeApp: true }).apoioScreens).toEqual(["professionals"]);
    expect(supportPlan({ products: 2, professionals: 0, commerceEnabled: false, nativeApp: false })).toEqual({
      showProducts: false,
      showProfessionals: false,
      showActions: false,
      apoioScreens: [],
    });
    expect(supportPlan({ products: 0, professionals: 0, commerceEnabled: true, nativeApp: false }).showActions).toBe(false);
  });

  it("no app das lojas o profissional aparece sem Contratar (mesma trava dos profissionais)", () => {
    expect(hireAction({ nativeApp: true, commerceEnabled: true, loggedIn: true, ownService: false })).toBe("none");
    expect(hireAction({ nativeApp: false, commerceEnabled: true, loggedIn: false, ownService: false })).toBe("login");
    expect(hireAction({ nativeApp: false, commerceEnabled: true, loggedIn: true, ownService: false })).toBe("hire");
  });

  it("card Apoio faz parte dos cards do programa (5 no máximo) e fecha quando não tem telas", () => {
    expect(PROGRAM_CARD_KEYS).toEqual(["conceito", "prepare-se", "conteudo", "nutricional", "apoio"]);
    expect(parseCardState(new URLSearchParams("secao=apoio&tela=2"), { apoio: 2 })).toEqual({ card: "apoio", screen: 1 });
    expect(parseCardState(new URLSearchParams("secao=apoio&tela=1"), { conteudo: 1 })).toBeNull();
  });

  it("serviço mostrado: o escolhido pelo admin se ainda ativo, senão o 1º", () => {
    const services = [{ id: "a" }, { id: "b" }];
    expect(pickProgramService(services, "b")).toEqual({ id: "b" });
    expect(pickProgramService(services, "sumiu")).toEqual({ id: "a" });
    expect(pickProgramService(services, null)).toEqual({ id: "a" });
    expect(pickProgramService([], "b")).toBeNull();
  });

  it("Começar: entrar, participar, continuar ou rever", () => {
    expect(startAction({ loggedIn: false, enrollment: null })).toBe("login");
    expect(startAction({ loggedIn: true, enrollment: null })).toBe("enroll");
    expect(startAction({ loggedIn: true, enrollment: "abandoned" })).toBe("reenroll");
    expect(startAction({ loggedIn: true, enrollment: "active" })).toBe("continue");
    expect(startAction({ loggedIn: true, enrollment: "completed" })).toBe("review");
  });

  it("Continuar leva ao 1º obrigatório pendente, senão ao 1º pendente", () => {
    const items = [
      { slug: "a", required: false, done: false },
      { slug: "b", required: true, done: true },
      { slug: "c", required: true, done: false },
    ];
    expect(nextPendingSlug(items)).toBe("c");
    expect(nextPendingSlug(items.slice(0, 2))).toBe("a");
    expect(nextPendingSlug([{ slug: null, required: true, done: false }])).toBeNull();
  });
});

describe("Nutricional: nova regra (Etapa 4)", () => {
  const recipe = (id: string) => ({ id, type: "recipe" as const, pillar: "gastronomy" as const });
  const video = (id: string, pillar: "nutrition" | "training") => ({ id, type: "video" as const, pillar });

  it("só conteúdos do programa e os PRÓPRIOS do herói; indicadas pelo herói não entram", () => {
    // a consulta do herói traz só creator_id = herói; as indicadas (creator_recipe_links) não são passadas
    const contents = programNutritionContents({ programContents: [video("t", "training"), recipe("p1")], heroOwnContents: [recipe("h1"), recipe("p1"), video("h2", "nutrition")] }, 8);
    expect(contents.map((c) => c.id)).toEqual(["p1", "h1", "h2"]);
    expect(programNutritionContents({ programContents: [video("t", "training")], heroOwnContents: [] }, 8)).toEqual([]);
  });

  it("programa sem nutrição e herói sem receita própria: some, mesmo que o herói indique receitas", () => {
    const contents = programNutritionContents({ programContents: [video("t", "training")], heroOwnContents: [] }, 8);
    expect(nutritionVisible({ contents: contents.length, products: 0, productsAllowed: true })).toBe(false);
  });

  it("produto de comida ligado ao programa basta para mostrar (onde o comércio vale) e vem primeiro", () => {
    const linked = [{ product: { id: "kit" } }];
    const hero = [{ product: { id: "marmita" } }, { product: { id: "kit" } }];
    const merged = mergeLinkedProducts(linked, hero, 8);
    expect(merged.map((p) => p.product.id)).toEqual(["kit", "marmita"]);
    expect(mergeLinkedProducts(linked, hero, 1).map((p) => p.product.id)).toEqual(["kit"]);
    expect(nutritionVisible({ contents: 0, products: merged.length, productsAllowed: true })).toBe(true);
    expect(nutritionVisible({ contents: 0, products: merged.length, productsAllowed: false })).toBe(false);
  });
});
