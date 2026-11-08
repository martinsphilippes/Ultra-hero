// Plano de projetos da Groscove (0137): ordem oficial, nota, prioridade, 5W2H e as 5 etapas com 6 microetapas.
// Lógica pura, usada pelas telas e pelos testes.

export const PRIORITIES = ["urgent", "important", "structural", "circumstantial"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_STATUSES = ["active", "paused", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STEP_STATUSES = ["todo", "doing", "done"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** As 5 etapas padrão da Groscove, na ordem. */
export const STAGES = [1, 2, 3, 4, 5] as const;
export const STAGE_KEYS = ["structuring", "planning", "preparation", "execution", "conclusion"] as const;

/** Campos da ficha 5W2H, na ordem do PDF. */
export const PLAN_FIELDS = ["what", "why", "where", "when", "who", "how", "how_much"] as const;
export type PlanField = (typeof PLAN_FIELDS)[number];
export type Plan = Partial<Record<PlanField, string>>;

export function isPriority(v: unknown): v is Priority {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);
}
export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}
export function isStepStatus(v: unknown): v is StepStatus {
  return typeof v === "string" && (STEP_STATUSES as readonly string[]).includes(v);
}

/** Próxima situação ao tocar na microetapa: a fazer → em andamento → concluída → a fazer. */
export function nextStepStatus(s: StepStatus): StepStatus {
  return s === "todo" ? "doing" : s === "doing" ? "done" : "todo";
}

/** Percentual concluído (0–100, inteiro), como no "0 / 30 · 0%" do PDF. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(done, total) / total) * 100);
}

/** Nota no formato do PDF: "4,17" (vírgula no português). */
export function formatScore(score: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(score);
}

/** Contagem por prioridade para os filtros da lista. */
export function countByPriority<T extends { priority: Priority }>(items: readonly T[]): Record<Priority, number> {
  const out = { urgent: 0, important: 0, structural: 0, circumstantial: 0 } as Record<Priority, number>;
  for (const i of items) out[i.priority] += 1;
  return out;
}

/** JSON do banco → ficha 5W2H (só os campos conhecidos, em texto). */
export function parsePlan(v: unknown): Plan {
  const out: Plan = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const k of PLAN_FIELDS) {
    const val = (v as Record<string, unknown>)[k];
    if (typeof val === "string") out[k] = val;
  }
  return out;
}
