import { describe, expect, it } from "vitest";
import type { ProgramConcept } from "@/lib/programs/concept";
import {
  CONCEPT_SECTION_KEYS,
  cardForConceptSection,
  cardSearch,
  conceptScreens,
  firstSentence,
  isNutritionContent,
  isNutritionProduct,
  mergeUnique,
  nutritionProductsAllowed,
  nutritionScreens,
  nutritionVisible,
  parseCardState,
} from "@/lib/programs/program-cards";

// Página do programa em até 5 cards: seções do conceito → card, regra do Nutricional e estado na URL.

const concept: ProgramConcept = {
  idea: "Eu sou um começo de dia que cabe em dez minutos. Antes de abrir o celular.",
  for_who: "Para quem acorda já correndo.",
  not_for: "Não é um plano de treino.",
  outcomes: ["Um ritual de 10 minutos"],
  method: [
    { title: "Monte o ritual", text: "Comece pelo vídeo do ritual." },
    { title: "Desacelere", text: "Respire." },
    { title: "Prepare a noite", text: "Use o guia." },
  ],
  rhythm: { sessions_per_week: 7, minutes_per_day: 10, note: null },
  needs: [],
  care: "Conteúdo educativo; não substitui orientação profissional.",
};

const params = (query: string) => new URLSearchParams(query);

describe("seções do conceito → cards", () => {
  it("conceito → como funciona no Conceito; ritmo → cuidados no Prepare-se", () => {
    expect(CONCEPT_SECTION_KEYS.map((key) => [key, cardForConceptSection(key)])).toEqual([
      ["idea", "conceito"],
      ["for_who", "conceito"],
      ["outcomes", "conceito"],
      ["method", "conceito"],
      ["rhythm", "prepare-se"],
      ["needs", "prepare-se"],
      ["care", "prepare-se"],
    ]);
  });

  it("conceito completo: 4 telas no Conceito e 3 no Prepare-se, na ordem do programa", () => {
    expect(conceptScreens(concept, "Descrição antiga.", 1)).toEqual({ conceito: ["idea", "for_who", "outcomes", "method"], "prepare-se": ["rhythm", "needs", "care"] });
  });

  it("ritmo sem chips nem nota some; semanas da versão bastam para mostrar o ritmo", () => {
    const noRhythm = { ...concept, rhythm: { sessions_per_week: null, minutes_per_day: null, note: null } };
    expect(conceptScreens(noRhythm, null, null)["prepare-se"]).toEqual(["needs", "care"]);
    expect(conceptScreens(noRhythm, null, 3)["prepare-se"]).toEqual(["rhythm", "needs", "care"]);
    expect(conceptScreens({ ...noRhythm, rhythm: { ...noRhythm.rhythm, note: "Todas as manhãs." } }, null, null)["prepare-se"][0]).toBe("rhythm");
  });

  it("sem conceito: a descrição vira a única tela do Conceito; sem nada, nenhum dos dois", () => {
    expect(conceptScreens(null, "  Sobre.  ", 2)).toEqual({ conceito: ["description"], "prepare-se": [] });
    expect(conceptScreens(null, "  ", 2)).toEqual({ conceito: [], "prepare-se": [] });
    expect(conceptScreens(null, null)).toEqual({ conceito: [], "prepare-se": [] });
  });

  it("resumo do card: primeira frase, cortada no limite", () => {
    expect(firstSentence(concept.idea)).toBe("Eu sou um começo de dia que cabe em dez minutos.");
    expect(firstSentence("Sem ponto final")).toBe("Sem ponto final");
    expect(firstSentence("  Quebra\n de linha!  Depois.")).toBe("Quebra de linha!");
    expect(firstSentence("a".repeat(200), 20)).toBe(`${"a".repeat(19)}…`);
    expect(firstSentence(null)).toBe("");
  });
});

describe("card Nutricional", () => {
  it("conteúdo nutricional: pilar nutrição ou receita de qualquer pilar", () => {
    expect(isNutritionContent({ type: "video", pillar: "nutrition" })).toBe(true);
    expect(isNutritionContent({ type: "recipe", pillar: "gastronomy" })).toBe(true);
    expect(isNutritionContent({ type: "guide", pillar: "routine" })).toBe(false);
    expect(isNutritionContent({ type: "workout", pillar: "training" })).toBe(false);
  });

  it("produto nutricional: categoria de comida (is_food)", () => {
    expect(isNutritionProduct({ category: { is_food: true } })).toBe(true);
    expect(isNutritionProduct({ category: { is_food: false } })).toBe(false);
    expect(isNutritionProduct({ category: {} })).toBe(false);
    expect(isNutritionProduct({ category: null })).toBe(false);
  });

  it("produtos só com o comércio ligado e fora do app das lojas", () => {
    expect(nutritionProductsAllowed({ commerceEnabled: true, nativeApp: false })).toBe(true);
    expect(nutritionProductsAllowed({ commerceEnabled: false, nativeApp: false })).toBe(false);
    expect(nutritionProductsAllowed({ commerceEnabled: true, nativeApp: true })).toBe(false);
  });

  it("aparece só com material: conteúdos ou produtos permitidos", () => {
    expect(nutritionVisible({ contents: 0, products: 0, productsAllowed: true })).toBe(false);
    expect(nutritionVisible({ contents: 2, products: 0, productsAllowed: false })).toBe(true);
    expect(nutritionVisible({ contents: 0, products: 3, productsAllowed: true })).toBe(true);
    // só produtos, mas sem comércio (ou no app): some
    expect(nutritionVisible({ contents: 0, products: 3, productsAllowed: false })).toBe(false);
  });

  it("telas: conteúdos, depois produtos", () => {
    expect(nutritionScreens({ contents: 2, products: 3, productsAllowed: true })).toEqual(["contents", "products"]);
    expect(nutritionScreens({ contents: 0, products: 3, productsAllowed: true })).toEqual(["products"]);
    expect(nutritionScreens({ contents: 2, products: 3, productsAllowed: false })).toEqual(["contents"]);
  });

  it("junta conteúdos do programa e do herói sem repetir, até o limite", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    expect(mergeUnique([[a, b], [b, c]], 10)).toEqual([a, b, c]);
    expect(mergeUnique([[a, b], [c]], 2)).toEqual([a, b]);
  });
});

describe("estado na URL (?secao=…&tela=N)", () => {
  const counts = { conceito: 4, "prepare-se": 3, conteudo: 1 };

  it("lê card e tela (1-based na URL, 0-based no estado)", () => {
    expect(parseCardState(params("secao=conceito&tela=2"), counts)).toEqual({ card: "conceito", screen: 1 });
    expect(parseCardState(params("secao=prepare-se"), counts)).toEqual({ card: "prepare-se", screen: 0 });
  });

  it("tela fora do intervalo ou inválida vai para a mais próxima", () => {
    expect(parseCardState(params("secao=conceito&tela=99"), counts)).toEqual({ card: "conceito", screen: 3 });
    expect(parseCardState(params("secao=conceito&tela=0"), counts)).toEqual({ card: "conceito", screen: 0 });
    expect(parseCardState(params("secao=conceito&tela=abc"), counts)).toEqual({ card: "conceito", screen: 0 });
  });

  it("card desconhecido ou sem telas (Nutricional oculto) = fechado", () => {
    expect(parseCardState(params(""), counts)).toBeNull();
    expect(parseCardState(params("secao=receitas&tela=1"), counts)).toBeNull();
    expect(parseCardState(params("secao=nutricional&tela=1"), counts)).toBeNull();
  });

  it("escreve o estado preservando outros parâmetros; null fecha", () => {
    expect(cardSearch("?ref=feed", { card: "conteudo", screen: 0 })).toBe("?ref=feed&secao=conteudo&tela=1");
    expect(cardSearch("?secao=conceito&tela=3&ref=feed", { card: "conceito", screen: 1 })).toBe("?ref=feed&secao=conceito&tela=2");
    expect(cardSearch("?secao=conceito&tela=3&ref=feed", null)).toBe("?ref=feed");
    expect(cardSearch("?secao=conceito&tela=3", null)).toBe("");
  });
});
