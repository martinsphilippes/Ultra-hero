// Roteiros de entrega (0107): vocabulário fechado, espelho dos checks do banco (lógica pura, testável).

/** Setores fixos da operação Groscove (raias do PDF "Nosso processo de entrega"). */
export const SECTORS = ["gestor", "estrategia", "operacao", "comunicacao"] as const;
export type Sector = (typeof SECTORS)[number];

/** Prazo da etapa: n dias úteis | mesmo dia da anterior | recorrente (um ciclo de n dias úteis). */
export const DUE_RULES = ["business_days", "same_day", "recurring"] as const;
export type DueRule = (typeof DUE_RULES)[number];

/** Recorrência de uma etapa (ciclos gerados na Fase 3). */
export const STEP_RECURRENCES = ["daily", "weekly", "biweekly", "monthly"] as const;
export type StepRecurrence = (typeof STEP_RECURRENCES)[number];

/** Recorrência do serviço (contrato com ciclos, Fase 3). */
export const SERVICE_RECURRENCES = ["none", "weekly", "biweekly", "monthly"] as const;
export type ServiceRecurrence = (typeof SERVICE_RECURRENCES)[number];

/** Quem pode ser cliente do serviço: marca, Hero ou os dois. */
export const CLIENT_KINDS = ["brand", "talent", "both"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Marcos das etapas (ganchos das Fases 2 e 3: sala, diária, demo, guia de uso, feedback, clipping, insights…). */
export const MILESTONES = [
  "client_entry",
  "briefing",
  "nda",
  "opening",
  "production_day",
  "client_feedback",
  "demo",
  "delivery",
  "usage_guide",
  "presentation",
  "first_result",
  "go_live",
  "insights",
  "clipping",
  "closing",
] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Filtros do painel "Hoje no meu setor". */
export const TODAY_SCOPES = ["sector", "mine", "all"] as const;
export type TodayScope = (typeof TODAY_SCOPES)[number];

export type RoadmapStatus = "on_time" | "late" | "done";

const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
export const isSector = (v: unknown): v is Sector => has(SECTORS, v);
export const isDueRule = (v: unknown): v is DueRule => has(DUE_RULES, v);
export const isStepRecurrence = (v: unknown): v is StepRecurrence => has(STEP_RECURRENCES, v);
export const isServiceRecurrence = (v: unknown): v is ServiceRecurrence => has(SERVICE_RECURRENCES, v);
export const isClientKind = (v: unknown): v is ClientKind => has(CLIENT_KINDS, v);
export const isMilestone = (v: unknown): v is Milestone => has(MILESTONES, v);
export const isTodayScope = (v: unknown): v is TodayScope => has(TODAY_SCOPES, v);

/** Cliente do negócio a partir do que foi escolhido (marca, Hero ou os dois). */
export function clientKindOf(hasBrand: boolean, hasTalent: boolean): ClientKind | null {
  if (hasBrand && hasTalent) return "both";
  if (hasBrand) return "brand";
  if (hasTalent) return "talent";
  return null;
}

/** O serviço aceita esse cliente? ("both" aceita marca, Hero ou os dois.) */
export function serviceFitsClient(service: ClientKind, client: ClientKind | null): boolean {
  if (!client) return false;
  if (service === "both") return true;
  return client === service || client === "both";
}
