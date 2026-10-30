// Página do programa em 4 cards (Conceito, Prepare-se, Conteúdo, Nutricional), cada um abrindo telas
// em sequência. Regras puras (sem Supabase/React): quais seções do conceito vão para qual card, quando
// o Nutricional aparece e o estado na URL (?secao=conceito&tela=2).
import type { ContentType, Pillar } from "@/lib/supabase/helpers";
import { rhythmChips, type ProgramConcept } from "./concept";

export const PROGRAM_CARD_KEYS = ["conceito", "prepare-se", "conteudo", "nutricional"] as const;
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

/** O card Nutricional só aparece com algum material: conteúdos nutricionais ou produtos permitidos. */
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

export const CARD_PARAM = "secao";
export const SCREEN_PARAM = "tela";

export type CardState = { card: ProgramCardKey; /** índice 0-based */ screen: number };
type ParamsLike = { get(name: string): string | null };

/**
 * Lê ?secao=…&tela=N (N começa em 1). Card inexistente ou sem telas = fechado (null); tela fora do
 * intervalo ou inválida vai para a mais próxima (sem tela = a primeira).
 */
export function parseCardState(params: ParamsLike, counts: Partial<Record<ProgramCardKey, number>>): CardState | null {
  const card = params.get(CARD_PARAM);
  if (!isProgramCardKey(card)) return null;
  const total = counts[card] ?? 0;
  if (total <= 0) return null;
  const raw = Number.parseInt(params.get(SCREEN_PARAM) ?? "", 10);
  const n = Number.isFinite(raw) ? raw : 1;
  return { card, screen: Math.min(Math.max(n, 1), total) - 1 };
}

/** Query string com o estado (ou sem ele, para fechar), preservando os outros parâmetros. */
export function cardSearch(current: string | URLSearchParams, state: CardState | null): string {
  const params = new URLSearchParams(current);
  params.delete(CARD_PARAM);
  params.delete(SCREEN_PARAM);
  if (state) {
    params.set(CARD_PARAM, state.card);
    params.set(SCREEN_PARAM, String(state.screen + 1));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
