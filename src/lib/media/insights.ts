// Insights do publipost (0111, D1): espelho puro de public.deliverable_insights_state (testado no vitest).
// Marcos: 24 h (1ª leitura, medida a partir do dia seguinte à publicação) e 7 dias (2ª leitura); carência de 2 dias
// em cada marco antes de virar "atrasado". A leitura de 7 dias cobre a de 24 h.

export const INSIGHT_STATES = ["waiting", "due_24h", "late_24h", "due_7d", "late_7d", "done"] as const;
export type InsightState = (typeof INSIGHT_STATES)[number];
export const isInsightState = (v: unknown): v is InsightState => typeof v === "string" && (INSIGHT_STATES as readonly string[]).includes(v);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function insightsState(publishedAt: string | null, now: Date, has24: boolean, has7: boolean): InsightState {
  if (!publishedAt) return "waiting";
  if (has7) return "done";
  const age = now.getTime() - new Date(publishedAt).getTime();
  if (age < DAY) return "waiting";
  if (!has24 && age < 7 * DAY) return age < 3 * DAY ? "due_24h" : "late_24h";
  if (age < 7 * DAY) return "waiting";
  return age < 9 * DAY ? "due_7d" : "late_7d";
}

export const isInsightLate = (s: InsightState) => s === "late_24h" || s === "late_7d";
/** Marco da situação: "24h" ou "7d" (nulo quando não há o que enviar). */
export const insightMark = (s: InsightState): "24h" | "7d" | null => (s === "due_24h" || s === "late_24h" ? "24h" : s === "due_7d" || s === "late_7d" ? "7d" : null);
