// Contrato interno normalizado (docs/decisions/hoje-relogio.md §9.2). Os adaptadores de cada marca
// produzem este lote a partir do payload bruto; o banco (health.apply_batch) o grava. O lote NÃO
// carrega connectionId nem userId: o servidor resolve a conexão antes de gravar.

import type { MetricCode } from "@/lib/wearables/catalog";

/** Marcas web desta fase (Q3: sem app nativo; Q4: sem agregador). */
export const HEALTH_PROVIDERS = ["garmin", "oura", "whoop", "polar"] as const;
export type HealthProvider = (typeof HEALTH_PROVIDERS)[number];

export function isHealthProvider(value: string): value is HealthProvider {
  return (HEALTH_PROVIDERS as readonly string[]).includes(value);
}

/** Categorias de consentimento (enum health.category). */
export const HEALTH_CATEGORIES = ["readiness", "sleep", "heart", "activity", "workout", "breathing", "temperature", "stress", "environment", "safety"] as const;
export type HealthCategory = (typeof HEALTH_CATEGORIES)[number];

export function isHealthCategory(value: string): value is HealthCategory {
  return (HEALTH_CATEGORIES as readonly string[]).includes(value);
}

export type DailyInput = {
  /** Dia do usuário (YYYY-MM-DD) no fuso da amostra (RN-05). */
  date: string;
  code: MetricCode;
  value: number;
  /** Escala original do fabricante (índices da marca nunca são normalizados, RN-08). */
  scale?: string;
  label?: string;
  method?: "rmssd" | "sdnn";
  n?: number;
  /** Horário da amostra (ISO), mostrado como "às HH:MM". */
  at?: string;
  cov?: number;
  vendor?: boolean;
  device?: string;
  /** Quando a marca atualizou o dado (RN-10: o mais novo vence). */
  updated?: string;
};

export type SleepInput = {
  ext: string;
  /** Dia em que a pessoa acorda (RN-05). */
  date: string;
  start: string;
  end: string;
  tz?: number;
  main: boolean;
  nap: boolean;
  inBed?: number;
  asleep?: number;
  deep?: number;
  light?: number;
  rem?: number;
  awake?: number;
  latency?: number;
  eff?: number;
  score?: number;
  scoreScale?: string;
  lowestHr?: number;
  updated?: string;
};

export type WorkoutOrigin = "started_on_device" | "auto_detected";

export type WorkoutInput = {
  ext: string;
  date: string;
  /** Esporte canônico (todos os tipos; `other` quando a marca não diz). */
  sport: string;
  origin: WorkoutOrigin;
  start: string;
  end: string;
  dur: number;
  dist?: number;
  kcal?: number;
  avgHr?: number;
  maxHr?: number;
  /** Segundos em cada uma das 5 zonas de FC. */
  zones?: [number, number, number, number, number];
  elev?: number;
  speed?: number;
  cadence?: number;
  power?: number;
  /** Só esforço ESTIMADO pelo aparelho (WHOOP strain); nunca o informado pela pessoa. */
  effort?: number;
  effortScale?: string;
  updated?: string;
};

export type NormalizedBatch = {
  provider: HealthProvider;
  normalizerVersion: number;
  device?: string;
  daily: DailyInput[];
  sleep: SleepInput[];
  workouts: WorkoutInput[];
  deletions: { kind: "sleep" | "workout"; ext: string }[];
};

export function emptyBatch(provider: HealthProvider, normalizerVersion: number): NormalizedBatch {
  return { provider, normalizerVersion, daily: [], sleep: [], workouts: [], deletions: [] };
}

export type NormalizeContext = {
  /** Fuso de reserva (profiles.timezone) quando a amostra não traz o seu. */
  tzFallback: string;
};
