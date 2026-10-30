// Página do programa em até 5 cards (Conceito, Prepare-se, Conteúdo, Nutricional, Apoio), cada um abrindo telas
// em sequência. Regras puras (sem Supabase/React): quais seções do conceito vão para qual card, quando
// o Nutricional aparece e o estado na URL (?secao=conceito&tela=2).
import type { ContentType, Pillar } from "@/lib/supabase/helpers";
import { CARD_PARAM, parseScreenState, screenSearch, type ParamsLike, type ScreenState } from "@/lib/screen-cards";
import { rhythmChips, type ProgramConcept } from "./concept";

export const PROGRAM_CARD_KEYS = ["conceito", "prepare-se", "conteudo", "nutricional", "apoio"] as const;
export type ProgramCardKey = (typeof PROGRAM_CARD_KEYS)[number];

export function isProgramCardKey(value: string | null | undefined): value is ProgramCardKey {
  return (PROGRAM_CARD_KEYS as readonly string[]).includes(value ?? "");
}

/**
 * Seções do conceito na ordem em que o programa se apresenta (a mesma da tela antiga):
 * ideia ("conceito") → para quem é → o que conquista → como funciona → ritmo → o que precisa → cuidados.
 * "Não é para" (not_for) não é seção própria: aparece dentro de "para quem é".
 */
export const CONCEPT_SECTION_KEYS = ["idea", "for_who", "outcomes", "method", "rhythm", "needs", "care"] as const;
export type ConceptSectionKey = (typeof CONCEPT_SECTION_KEYS)[number];

/** Última seção do card Conceito (conceito → como funciona); daí em diante é Prepare-se (ritmo → cuidados). */
const LAST_CONCEPT_SECTION: ConceptSectionKey = "method";

export function cardForConceptSection(key: ConceptSectionKey): "conceito" | "prepare-se" {
  return CONCEPT_SECTION_KEYS.indexOf(key) <= CONCEPT_SECTION_KEYS.indexOf(LAST_CONCEPT_SECTION) ? "conceito" : "prepare-se";
}

/** Tela de conceito: uma seção do conceito ou, sem conceito, a descrição antiga (fica no card Conceito). */
export type ConceptScreenKey = ConceptSectionKey | "description";

/** A seção tem o que mostrar? (lista vazia some; "precisa" e "cuidados" sempre têm texto). */
function hasSection(key: ConceptSectionKey, concept: ProgramConcept, estimatedWeeks: number | null | undefined): boolean {
  switch (key) {
    case "outcomes":
      return concept.outcomes.length > 0;
    case "method":
      return concept.method.length > 0;
    case "rhythm":
      return rhythmChips(estimatedWeeks, concept).length > 0 || Boolean(concept.rhythm.note);
    default:
      return true;
  }
}

export type ConceptScreens = { conceito: ConceptScreenKey[]; "prepare-se": ConceptScreenKey[] };

/**
 * Divide o conceito nos dois cards. Sem conceito, a descrição vira a única tela do Conceito e o
 * Prepare-se some (lista vazia); sem nenhum dos dois, os dois somem.
 */
export function conceptScreens(concept: ProgramConcept | null, description: string | null | undefined, estimatedWeeks?: number | null): ConceptScreens {
  const out: ConceptScreens = { conceito: [], "prepare-se": [] };
  if (!concept) {
    if (description?.trim()) out.conceito.push("description");
    return out;
  }
  for (const key of CONCEPT_SECTION_KEYS) {
    if (hasSection(key, concept, estimatedWeeks)) out[cardForConceptSection(key)].push(key);
  }
  return out;
}

/** Primeira frase (resumo do card), cortada com reticências se passar do limite. */
export function firstSentence(text: string | null | undefined, max = 140): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const match = /^(.+?[.!?…])(\s|$)/.exec(clean);
  const sentence = match ? match[1] : clean;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------- Nutricional

/** Conteúdo nutricional: pilar nutrição ou receita (de qualquer pilar). */
export function isNutritionContent(content: { type: ContentType; pillar: Pillar }): boolean {
  return content.pillar === "nutrition" || content.type === "recipe";
}

/** Produto nutricional: categoria de comida (product_categories.is_food: refeições, kits, suplementos, hidratação). */
export function isNutritionProduct(product: { category: { is_food?: boolean | null } | null }): boolean {
  return product.category?.is_food === true;
}

/**
 * Produtos só onde o comércio vale: kill switch ligado e fora do app das lojas (lá a compra
 * simulada não existe; ver lib/native-app/surface.ts).
 */
export function nutritionProductsAllowed({ commerceEnabled, nativeApp }: { commerceEnabled: boolean; nativeApp: boolean }): boolean {
  return commerceEnabled && !nativeApp;
}

/**
 * O card Nutricional só aparece com algum material: conteúdos nutricionais (do programa ou do próprio
 * herói como autor) ou produtos de comida permitidos (ligados ao programa ou ao herói).
 */
export function nutritionVisible({ contents, products, productsAllowed }: { contents: number; products: number; productsAllowed: boolean }): boolean {
  return contents > 0 || (productsAllowed && products > 0);
}

/** Telas do Nutricional: conteúdos, depois produtos (cada uma só se tiver itens). */
export type NutritionScreenKey = "contents" | "products";
export function nutritionScreens({ contents, products, productsAllowed }: { contents: number; products: number; productsAllowed: boolean }): NutritionScreenKey[] {
  const screens: NutritionScreenKey[] = [];
  if (contents > 0) screens.push("contents");
  if (productsAllowed && products > 0) screens.push("products");
  return screens;
}

/**
 * Conteúdos do Nutricional: os de nutrição/receitas do programa, depois os PRÓPRIOS do herói (autor).
 * Receitas só indicadas pelo herói (creator_recipe_links de outro autor) ficam de fora (Etapa 4).
 */
export function programNutritionContents<T extends { id: string; type: ContentType; pillar: Pillar }>(
  { programContents, heroOwnContents }: { programContents: readonly T[]; heroOwnContents: readonly T[] },
  limit: number,
): T[] {
  return mergeUnique([programContents.filter(isNutritionContent), heroOwnContents.filter(isNutritionContent)], limit);
}

/** Produtos do Nutricional: os ligados ao programa primeiro, depois os do herói, sem repetir. */
export function mergeLinkedProducts<T extends { product: { id: string } }>(linked: readonly T[], others: readonly T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...linked, ...others]) {
    if (out.length >= limit) break;
    if (seen.has(item.product.id)) continue;
    seen.add(item.product.id);
    out.push(item);
  }
  return out;
}

/**
 * Junta conteúdos sem repetir, na ordem das listas (primeiro os do programa, depois os do herói),
 * até o limite.
 */
export function mergeUnique<T extends { id: string }>(lists: readonly (readonly T[])[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (out.length >= limit) return out;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------- estado na URL
// (regras genéricas em lib/screen-cards.ts; aqui só a lista de cards do programa)

export { CARD_PARAM, SCREEN_PARAM } from "@/lib/screen-cards";

export type CardState = ScreenState<ProgramCardKey>;

/** Lê ?secao=…&tela=N só para os cards do programa (outro card = fechado). */
export function parseCardState(params: ParamsLike, counts: Partial<Record<ProgramCardKey, number>>): CardState | null {
  if (!isProgramCardKey(params.get(CARD_PARAM))) return null;
  return parseScreenState(params, counts);
}

/** Query string com o estado (ou sem ele, para fechar), preservando os outros parâmetros. */
export function cardSearch(current: string | URLSearchParams, state: CardState | null): string {
  return screenSearch(current, state);
}
