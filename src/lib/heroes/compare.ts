// "Você vs Hero" (0056): indicadores que a pessoa realmente tem, comparados com a REFERÊNCIA que a
// equipe definiu para o herói (nunca dado medido do herói). Puro: usado no servidor e nos testes.
// As chaves, unidades e faixas espelham o check de public.creator_reference_metrics.

import type { HistoryDay, WatchSnapshot } from "@/lib/wearables/demo";

export const COMPARE_METRICS = ["sleep_hours", "steps_day", "workouts_week", "cardio_load_day", "active_days_week", "contents_week", "recipes_week"] as const;
export type CompareMetricKey = (typeof COMPARE_METRICS)[number];

/** De onde vem o valor da pessoa: relógio (demo ou real) ou o uso do app. */
export type CompareSource = "watch" | "app";

export type CompareMetricDef = {
  key: CompareMetricKey;
  unit: "h" | "steps" | "workouts" | "points" | "days" | "contents" | "recipes";
  source: CompareSource;
  /** Teto aceito pelo banco (o mínimo é > 0). */
  max: number;
  /** Casas decimais ao mostrar. */
  decimals: number;
  /** Seção do Hoje onde o card também aparece (/profile/today/[seção]). */
  todaySection: "sleep" | "activity" | "workouts" | null;
};

export const COMPARE_METRIC_DEFS: Record<CompareMetricKey, CompareMetricDef> = {
  sleep_hours: { key: "sleep_hours", unit: "h", source: "watch", max: 14, decimals: 1, todaySection: "sleep" },
  steps_day: { key: "steps_day", unit: "steps", source: "watch", max: 60000, decimals: 0, todaySection: "activity" },
  workouts_week: { key: "workouts_week", unit: "workouts", source: "watch", max: 21, decimals: 0, todaySection: "workouts" },
  cardio_load_day: { key: "cardio_load_day", unit: "points", source: "watch", max: 1500, decimals: 0, todaySection: "workouts" },
  active_days_week: { key: "active_days_week", unit: "days", source: "app", max: 7, decimals: 0, todaySection: null },
  contents_week: { key: "contents_week", unit: "contents", source: "app", max: 100, decimals: 0, todaySection: null },
  recipes_week: { key: "recipes_week", unit: "recipes", source: "app", max: 50, decimals: 0, todaySection: null },
};

export function isCompareMetricKey(value: string): value is CompareMetricKey {
  return (COMPARE_METRICS as readonly string[]).includes(value);
}

/** Valor digitado pelo admin → número válido para o indicador; vazio = sem comparação (null). */
export function parseReferenceInput(key: CompareMetricKey, raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim().replace(",", ".");
  if (text === "") return { ok: true, value: null };
  const value = Number(text);
  const def = COMPARE_METRIC_DEFS[key];
  if (!Number.isFinite(value) || value <= 0 || value > def.max) return { ok: false };
  // o banco guarda numeric(10,2)
  return { ok: true, value: Math.round(value * 100) / 100 };
}

// ---------------------------------------------------------------- comparação
export type CompareStatus = "below" | "near" | "above";

export type Comparison = {
  /** Percentual da referência alcançado (inteiro, sem teto), ex.: 85. */
  pct: number;
  /** Largura das barras (0–100), relativas ao maior dos dois. */
  userBar: number;
  refBar: number;
  status: CompareStatus;
};

/** "Perto" = entre 90% e 110% da referência. */
export const NEAR_LOW = 90;
export const NEAR_HIGH = 110;

export function compareValues(user: number, reference: number): Comparison | null {
  if (!Number.isFinite(user) || !Number.isFinite(reference) || reference <= 0 || user < 0) return null;
  const pct = Math.round((user / reference) * 100);
  const top = Math.max(user, reference);
  const bar = (v: number) => (top > 0 ? Math.max(0, Math.min(100, Math.round((v / top) * 100))) : 0);
  const status: CompareStatus = pct < NEAR_LOW ? "below" : pct > NEAR_HIGH ? "above" : "near";
  return { pct, userBar: bar(user), refBar: bar(reference), status };
}

/** Percentual mostrado na frase: acima de 999% vira "999%+" (evita números absurdos). */
export function displayPct(pct: number): string {
  return pct > 999 ? "999+" : String(Math.max(0, pct));
}

// ---------------------------------------------------------------- valores da pessoa
export type UserMetricValues = Partial<Record<CompareMetricKey, number>>;

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const nums = (days: HistoryDay[], code: string) =>
  days.map((d) => (d.values as Record<string, unknown>)[code]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

/** Janela de 7 dias do relógio: sono das 7 últimas noites; passos e carga em dias completos; treinos somados. */
export function watchMetrics(snapshot: Pick<WatchSnapshot, "history">): UserMetricValues {
  const last7 = snapshot.history.slice(-7);
  const complete = snapshot.history.filter((d) => !d.partial).slice(-7);
  const out: UserMetricValues = {};
  const sleep = avg(nums(last7, "sleep_asleep_min"));
  if (sleep !== null) out.sleep_hours = sleep / 60;
  const steps = avg(nums(complete, "steps"));
  if (steps !== null) out.steps_day = steps;
  const load = avg(nums(complete, "cardio_load_day_uh"));
  if (load !== null) out.cardio_load_day = load;
  const workouts = nums(last7, "workout_count");
  if (workouts.length > 0) out.workouts_week = workouts.reduce((a, b) => a + b, 0);
  return out;
}

/** Uso do app nos últimos 7 dias: dias ativos (sequência), conteúdos e receitas concluídos. */
export function appMetrics(input: { activeDates: string[]; today: string; completions: { completedAt: string; type: string | null }[]; now?: Date }): UserMetricValues {
  const todayMs = Date.parse(`${input.today}T00:00:00Z`);
  const from = todayMs - 6 * 86_400_000;
  const days = new Set(
    input.activeDates.filter((d) => {
      const ms = Date.parse(`${d}T00:00:00Z`);
      return ms >= from && ms <= todayMs;
    }),
  );
  const since = (input.now ?? new Date()).getTime() - 7 * 86_400_000;
  const recent = input.completions.filter((c) => Date.parse(c.completedAt) >= since);
  return {
    active_days_week: days.size,
    contents_week: recent.length,
    recipes_week: recent.filter((c) => c.type === "recipe").length,
  };
}

export type CompareRow = {
  key: CompareMetricKey;
  user: number | null;
  reference: number;
  comparison: Comparison | null;
};

/**
 * Linhas a mostrar: só indicadores com referência do herói. Sem valor da pessoa (sem relógio, por
 * exemplo) a linha vem com user null e a tela explica o que falta, em vez de mostrar zero.
 */
export function compareRows(references: Partial<Record<CompareMetricKey, number>>, user: UserMetricValues, only?: readonly CompareMetricKey[]): CompareRow[] {
  return COMPARE_METRICS.filter((key) => (only ? only.includes(key) : true))
    .filter((key) => typeof references[key] === "number" && (references[key] as number) > 0)
    .map((key) => {
      const reference = references[key] as number;
      const value = user[key];
      const mine = typeof value === "number" && Number.isFinite(value) ? value : null;
      return { key, user: mine, reference, comparison: mine === null ? null : compareValues(mine, reference) };
    });
}

/** Indicadores do card de uma seção do Hoje. */
export function metricsForTodaySection(section: string): CompareMetricKey[] {
  return COMPARE_METRICS.filter((key) => COMPARE_METRIC_DEFS[key].todaySection === section);
}
