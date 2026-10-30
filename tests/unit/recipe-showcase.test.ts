import { describe, expect, it } from "vitest";
import {
  NUTRITIONIST_ACTION,
  cardActionVisibility,
  createBumpLimiter,
  effectiveChef,
  parseRecipeActionEvent,
  parseShowcaseSlug,
  parseSignerChoice,
  recipeActionVisibility,
  recipeSignature,
  showcaseRecipeHref,
  signerChoiceValue,
} from "@/lib/recipes/showcase";

// Alimentação completa (0051): assinatura, ações visíveis e validação do contador de toques.

const jacquin = { slug: "erick-jacquin", name: "Érick Jacquin", avatar_url: null };
const neymar = { slug: "neymar", name: "Neymar", avatar_url: null };
const anitta = { slug: "anitta", name: "Anitta", avatar_url: null };
const CREATOR = "0b7e3c1a-1111-4abc-8def-000000000001";
const CONTENT = "0b7e3c1a-2222-4abc-8def-000000000002";

describe("quem assina", () => {
  it("sem escolha do admin, o autor assina (como antes da 0051)", () => {
    expect(effectiveChef(jacquin, undefined)).toBe(jacquin);
  });
  it("escolha do admin vence; chef nulo = sem chef", () => {
    expect(effectiveChef(neymar, { chef: jacquin })).toBe(jacquin);
    expect(effectiveChef(jacquin, { chef: null })).toBeNull();
  });
});

describe("linha de assinatura", () => {
  it("receita do próprio chef na vitrine dele: só 'Receita de'", () => {
    expect(recipeSignature({ author: jacquin, signer: undefined, showcaseHero: jacquin })).toEqual({ kind: "chef", chef: jacquin, hero: null });
    // sem vitrine na URL, o herói é o autor
    expect(recipeSignature({ author: jacquin, signer: undefined }).kind).toBe("chef");
  });
  it("receita de um chef na vitrine de outro herói: 'Receita de · indicada por'", () => {
    expect(recipeSignature({ author: jacquin, signer: undefined, showcaseHero: anitta })).toEqual({ kind: "chefIndicated", chef: jacquin, hero: anitta });
  });
  it("autor que não é chef e chef escolhido pelo admin: indicada pelo autor", () => {
    expect(recipeSignature({ author: neymar, signer: { chef: jacquin } })).toEqual({ kind: "chefIndicated", chef: jacquin, hero: neymar });
  });
  it("chef escolhido = herói da vitrine: só 'Receita de'", () => {
    expect(recipeSignature({ author: neymar, signer: { chef: jacquin }, showcaseHero: jacquin }).kind).toBe("chef");
  });
  it("sem chef: 'Indicada por' o herói da vitrine (ou o autor)", () => {
    expect(recipeSignature({ author: neymar, signer: { chef: null } })).toEqual({ kind: "indicated", chef: null, hero: neymar });
    expect(recipeSignature({ author: neymar, signer: { chef: null }, showcaseHero: anitta })).toEqual({ kind: "indicated", chef: null, hero: anitta });
  });
  it("sem autor e sem chef: nada", () => {
    expect(recipeSignature({ author: null, signer: { chef: null } }).kind).toBe("none");
  });
});

describe("ações visíveis", () => {
  const ready = { purchasable: true };
  it("receita aberta com ingredientes e produto comprável: as três ações", () => {
    expect(recipeActionVisibility({ recipeOpen: true, hasIngredients: true, readyProduct: ready, commerceEnabled: true })).toEqual({
      fazer: true,
      comprarPronto: true,
      listaCompras: true,
      nutricionista: NUTRITIONIST_ACTION,
    });
  });
  it("receita fechada: Comprar pronto continua (não depende da etapa); Fazer e Lista somem", () => {
    const v = recipeActionVisibility({ recipeOpen: false, hasIngredients: true, readyProduct: ready, commerceEnabled: true });
    expect(v.fazer).toBe(false);
    expect(v.listaCompras).toBe(false);
    expect(v.comprarPronto).toBe(true);
  });
  it("sem ingredientes, sem produto, produto não comprável ou comércio desligado", () => {
    expect(recipeActionVisibility({ recipeOpen: true, hasIngredients: false, readyProduct: null, commerceEnabled: true }).listaCompras).toBe(false);
    expect(recipeActionVisibility({ recipeOpen: true, hasIngredients: true, readyProduct: null, commerceEnabled: true }).comprarPronto).toBe(false);
    expect(recipeActionVisibility({ recipeOpen: true, hasIngredients: true, readyProduct: { purchasable: false }, commerceEnabled: true }).comprarPronto).toBe(false);
    expect(recipeActionVisibility({ recipeOpen: true, hasIngredients: true, readyProduct: ready, commerceEnabled: false }).comprarPronto).toBe(false);
  });
  it("nutricionista: só 'em breve' até a Etapa 3", () => {
    expect(NUTRITIONIST_ACTION).toBe("soon");
  });
  it("cards da vitrine: Fazer e Lista sempre; Comprar pronto só com produto comprável", () => {
    expect(cardActionVisibility({ readyProduct: null, commerceEnabled: true })).toEqual({ fazer: true, comprarPronto: false, listaCompras: true, nutricionista: null });
    expect(cardActionVisibility({ readyProduct: ready, commerceEnabled: true }).comprarPronto).toBe(true);
    expect(cardActionVisibility({ readyProduct: ready, commerceEnabled: false }).comprarPronto).toBe(false);
  });
});

describe("contador de toques: validação", () => {
  it("aceita só o formato exato e normaliza os ids", () => {
    expect(parseRecipeActionEvent({ creatorId: CREATOR.toUpperCase(), contentId: CONTENT, source: "alimentacao", action: "fazer" })).toEqual({
      creatorId: CREATOR,
      contentId: CONTENT,
      source: "alimentacao",
      action: "fazer",
    });
    expect(parseRecipeActionEvent({ creatorId: CREATOR, contentId: CONTENT, source: "receita", action: "comprar_pronto" })?.action).toBe("comprar_pronto");
    expect(parseRecipeActionEvent({ creatorId: CREATOR, contentId: CONTENT, source: "receita", action: "lista_compras" })?.source).toBe("receita");
  });
  it("recusa ação, origem ou ids fora do formato", () => {
    for (const bad of [
      null,
      "x",
      { creatorId: "neymar", contentId: CONTENT, source: "alimentacao", action: "fazer" },
      { creatorId: CREATOR, contentId: `${CONTENT}x`, source: "alimentacao", action: "fazer" },
      { creatorId: CREATOR, contentId: CONTENT, source: "produtos", action: "fazer" },
      { creatorId: CREATOR, contentId: CONTENT, source: "alimentacao", action: "contratar" },
      { creatorId: CREATOR, contentId: CONTENT, source: "alimentacao" },
    ]) {
      expect(parseRecipeActionEvent(bad)).toBeNull();
    }
  });
  it("ignora campos a mais (nada da pessoa passa adiante)", () => {
    const event = parseRecipeActionEvent({ creatorId: CREATOR, contentId: CONTENT, source: "alimentacao", action: "fazer", userId: "u", ip: "1.2.3.4" });
    expect(Object.keys(event ?? {}).sort()).toEqual(["action", "contentId", "creatorId", "source"]);
  });
  it("limite por janela", () => {
    const allow = createBumpLimiter(2, 1000);
    expect([allow(0), allow(10), allow(20)]).toEqual([true, true, false]);
    expect(allow(1000)).toBe(true);
  });
});

describe("vitrine na URL e escolha do admin", () => {
  it("slug do herói: só formato de slug", () => {
    expect(parseShowcaseSlug("neymar")).toBe("neymar");
    expect(parseShowcaseSlug(["Erick-Jacquin"])).toBe("erick-jacquin");
    expect(parseShowcaseSlug("../admin")).toBeNull();
    expect(parseShowcaseSlug(undefined)).toBeNull();
  });
  it("endereço da receita com a vitrine e a âncora da lista", () => {
    expect(showcaseRecipeHref("bowl-g1", null)).toBe("/content/bowl-g1");
    expect(showcaseRecipeHref("bowl-g1", "neymar", "lista-de-compras")).toBe("/content/bowl-g1?vitrine=neymar#lista-de-compras");
  });
  it("seletor 'quem assina' ↔ linha de recipe_signers", () => {
    expect(signerChoiceValue(null)).toBe("author");
    expect(signerChoiceValue({ chef_id: null })).toBe("none");
    expect(signerChoiceValue({ chef_id: CREATOR })).toBe(CREATOR);
    expect(parseSignerChoice("author")).toEqual({ mode: "author" });
    expect(parseSignerChoice("none")).toEqual({ mode: "none" });
    expect(parseSignerChoice(CREATOR)).toEqual({ mode: "hero", chefId: CREATOR });
    expect(parseSignerChoice("chef")).toBeNull();
  });
});
