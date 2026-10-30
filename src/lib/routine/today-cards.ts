// Hoje em 3 cards (Seu dia, Sua noite, Evolução), cada um abrindo telas em sequência. Regras puras
// (sem Supabase/React): quais cards aparecem, o resumo de cada um e o estado na URL
// (?secao=dia&tela=2; regras genéricas em lib/screen-cards.ts).
import { parseScreenState, type ParamsLike, type ScreenState } from "@/lib/screen-cards";

/** Ordem pedida pelo dono: Seu dia, Sua noite, Evolução. */
export const TODAY_CARD_KEYS = ["dia", "noite", "evolucao"] as const;
export type TodayCardKey = (typeof TODAY_CARD_KEYS)[number];

export function isTodayCardKey(value: string | null | undefined): value is TodayCardKey {
  return (TODAY_CARD_KEYS as readonly string[]).includes(value ?? "");
}

/**
 * Estado do relógio para os cards: "metrics" = relógio com dados (demo, exemplo ou real);
 * "connect"/"syncing" = cards abrem o estado de conectar/sincronizar; "hidden" = sem os cards do
 * relógio (app das lojas com relógio simulado). A Evolução aparece sempre.
 */
export type WatchCardsState = "metrics" | "connect" | "syncing" | "hidden";

/** Cards na ordem fixa; Seu dia e Sua noite só sem "hidden" e com alguma tela. */
export function todayCardKeys(watch: WatchCardsState, screens: Partial<Record<TodayCardKey, number>>): TodayCardKey[] {
  return TODAY_CARD_KEYS.filter((key) => {
    if (key === "evolucao") return true;
    if (watch === "hidden") return false;
    return (screens[key] ?? 0) > 0;
  });
}

export function parseTodayCardState(params: ParamsLike, counts: Partial<Record<TodayCardKey, number>>): ScreenState<TodayCardKey> | null {
  return isTodayCardKey(params.get("secao")) ? parseScreenState(params, counts) : null;
}

// ---------------------------------------------------------------- resumos (teasers)

/** Partes do resumo; o texto de cada uma vem das mensagens (quem chama formata). */
export type TeaserPart =
  | { kind: "steps"; value: number }
  | { kind: "load"; value: number }
  | { kind: "workouts"; n: number }
  | { kind: "stress"; value: number }
  | { kind: "sleep"; minutes: number }
  | { kind: "bodyBattery"; value: number }
  | { kind: "readiness"; value: number }
  | { kind: "disposition"; band: string }
  | { kind: "streak"; days: number }
  | { kind: "programSteps"; done: number; total: number }
  | { kind: "completions"; n: number };

const MAX_PARTS = 2;

/** Seu dia: passos e carga do dia; na falta, treinos de hoje e o estresse médio. Até 2 partes. */
export function dayTeaserParts(input: { steps: number | null; load: number | null; workouts: number; stressAvg: number | null }): TeaserPart[] {
  const parts: TeaserPart[] = [];
  if (input.steps !== null) parts.push({ kind: "steps", value: Math.round(input.steps) });
  if (input.load !== null) parts.push({ kind: "load", value: Math.round(input.load) });
  if (input.workouts > 0) parts.push({ kind: "workouts", n: input.workouts });
  if (input.stressAvg !== null) parts.push({ kind: "stress", value: Math.round(input.stressAvg) });
  return parts.slice(0, MAX_PARTS);
}

/** Sua noite: duração do sono e o índice da manhã (Body Battery, índice da marca ou Disposição). */
export function nightTeaserParts(input: { asleepMin: number | null; bodyBattery: number | null; readiness: number | null; disposition: string | null }): TeaserPart[] {
  const parts: TeaserPart[] = [];
  if (input.asleepMin !== null) parts.push({ kind: "sleep", minutes: input.asleepMin });
  if (input.bodyBattery !== null) parts.push({ kind: "bodyBattery", value: Math.round(input.bodyBattery) });
  else if (input.readiness !== null) parts.push({ kind: "readiness", value: Math.round(input.readiness) });
  else if (input.disposition) parts.push({ kind: "disposition", band: input.disposition });
  return parts.slice(0, MAX_PARTS);
}

/** Evolução: sequência e os passos dos programas (sem programa, os conteúdos concluídos). */
export function evolutionTeaserParts(input: { streak: number; programDone: number; programTotal: number; completions: number }): TeaserPart[] {
  const parts: TeaserPart[] = [{ kind: "streak", days: Math.max(0, Math.floor(input.streak)) }];
  if (input.programTotal > 0) parts.push({ kind: "programSteps", done: Math.min(input.programDone, input.programTotal), total: input.programTotal });
  else parts.push({ kind: "completions", n: input.completions });
  return parts;
}

/** Junta as partes já traduzidas com " · " (partes vazias somem). */
export function joinTeaser(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

/** Telas da Evolução: resumo, programas e (se houver) a comparação com o Hero. */
export type EvolutionScreenKey = "resumo" | "programas" | "comparacao";
export function evolutionScreenKeys(hasComparison: boolean): EvolutionScreenKey[] {
  return hasComparison ? ["resumo", "programas", "comparacao"] : ["resumo", "programas"];
}
