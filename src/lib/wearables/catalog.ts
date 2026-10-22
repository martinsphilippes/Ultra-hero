// Catálogo canônico das métricas do Hoje (docs/decisions/hoje-relogio.md §13.1–13.3).
// Regra do responsável: só entra o que o relógio/anel mede sozinho pelo uso — automático (A),
// num treino iniciado ou detectado no relógio (T) ou calculado por nós a partir disso (C).
// Medidas sob demanda, funções médicas reguladas e qualquer dado digitado NÃO estão aqui de
// propósito (o teste tests/unit/wearables-catalog.test.ts falha se aparecerem).
// Nomes por idioma: messages/<locale>/wearables.json → metrics.<código>.

export const WATCH_MODELS = ["apple_s12", "apple_se3", "garmin_fenix", "garmin_vivo", "galaxy", "pixel", "oura", "whoop", "polar"] as const;
/** Colunas da matriz §13.3 (um modelo representa a família da coluna). */
export type WatchModelId = (typeof WATCH_MODELS)[number];

export type WatchBrand = "apple" | "garmin" | "samsung" | "google" | "oura" | "whoop" | "polar";

export type MetricCategory = "readiness" | "sleep" | "heart" | "activity" | "workout" | "breathing" | "temperature" | "stress" | "environment" | "safety";
/** A = automático; T = treino iniciado/detectado no relógio; C = calculado pelo Ultra Hero. */
export type MetricMode = "A" | "T" | "C";
/** v1 = no card do Hoje; v1d = só no detalhe. */
export type MetricStatus = "v1" | "v1d";
export type MetricUnit =
  | "count"
  | "min"
  | "h"
  | "bpm"
  | "ms"
  | "pct"
  | "kcal"
  | "m"
  | "c"
  | "c_delta"
  | "db"
  | "ml_kg_min"
  | "s_per_km"
  | "rpm"
  | "years"
  | "clock"
  | "score"
  | "ratio"
  | "points";
export type MetricAgg = "sum" | "avg" | "min" | "max" | "last" | "night" | "session" | "week" | "computed";
/** Bloco do Hoje e rota do detalhe (/profile/today/[seção]). */
export type TodaySectionId = "readiness" | "sleep" | "vitals" | "activity" | "workouts" | "stress" | "environment" | "safety";

export type MetricDef = {
  code: string;
  category: MetricCategory;
  section: TodaySectionId;
  unit: MetricUnit;
  agg: MetricAgg;
  mode: MetricMode;
  status: MetricStatus;
  /** Modelos (colunas da §13.3) que medem e entregam por API, ou permitem o cálculo. */
  models: readonly WatchModelId[];
  /** Faixa plausível (RN-12); fora dela o valor seria descartado na ingestão. */
  plaus?: readonly [number, number];
  /** Índice da marca: mostra escala e rótulo originais, nunca normalizados. */
  vendorScore?: boolean;
  /** Meta do próprio relógio: não tem "faixa habitual" (é fixa, não medida). */
  goal?: boolean;
};

const ALL = WATCH_MODELS;
const APPLE = ["apple_s12", "apple_se3"] as const;
const GARMIN = ["garmin_fenix", "garmin_vivo"] as const;
const without = (...ids: WatchModelId[]) => ALL.filter((m) => !ids.includes(m));

function m(code: string, category: MetricCategory, section: TodaySectionId, unit: MetricUnit, agg: MetricAgg, mode: MetricMode, status: MetricStatus, models: readonly WatchModelId[], extra: Partial<MetricDef> = {}): MetricDef {
  return { code, category, section, unit, agg, mode, status, models, ...extra };
}

export const METRICS = [
  // ------------------------------------------------------------ índices do dia
  m("readiness_vendor", "readiness", "readiness", "score", "last", "A", "v1", ["oura", "whoop", "polar"], { vendorScore: true }),
  m("body_battery_now", "readiness", "readiness", "score", "last", "A", "v1", GARMIN, { plaus: [5, 100], vendorScore: true }),
  m("body_battery_high", "readiness", "readiness", "score", "max", "A", "v1", GARMIN, { plaus: [5, 100], vendorScore: true }),
  m("body_battery_low", "readiness", "readiness", "score", "min", "A", "v1", GARMIN, { plaus: [5, 100], vendorScore: true }),
  m("body_battery_charged", "readiness", "readiness", "points", "sum", "A", "v1", GARMIN, { plaus: [0, 100], vendorScore: true }),
  m("body_battery_drained", "readiness", "readiness", "points", "sum", "A", "v1", GARMIN, { plaus: [0, 100], vendorScore: true }),
  m("day_strain", "readiness", "readiness", "score", "last", "A", "v1", ["whoop"], { plaus: [0, 21], vendorScore: true }),
  m("cardio_load_vendor", "readiness", "workouts", "score", "sum", "A", "v1d", ["polar"], { vendorScore: true }),
  m("disposition_uh", "readiness", "readiness", "score", "computed", "C", "v1", without("galaxy"), { plaus: [0, 100] }),
  m("night_vitals_uh", "readiness", "vitals", "count", "computed", "C", "v1", ALL, { plaus: [0, 5] }),
  m("cardio_load_day_uh", "readiness", "workouts", "points", "computed", "C", "v1", ALL, { plaus: [0, 1500] }),
  m("training_load_acute_7d", "readiness", "workouts", "points", "computed", "C", "v1d", ALL, { plaus: [0, 1500] }),
  m("training_load_chronic_28d", "readiness", "workouts", "points", "computed", "C", "v1d", ALL, { plaus: [0, 1500] }),
  m("load_ratio", "readiness", "workouts", "ratio", "computed", "C", "v1d", ALL, { plaus: [0, 5] }),

  // ------------------------------------------------------------ sono
  m("sleep_asleep_min", "sleep", "sleep", "min", "night", "A", "v1", ALL, { plaus: [0, 1200] }),
  m("sleep_deep_min", "sleep", "sleep", "min", "night", "A", "v1", ALL, { plaus: [0, 1200] }),
  m("sleep_light_min", "sleep", "sleep", "min", "night", "A", "v1", ALL, { plaus: [0, 1200] }),
  m("sleep_rem_min", "sleep", "sleep", "min", "night", "A", "v1", ALL, { plaus: [0, 1200] }),
  m("sleep_awake_min", "sleep", "sleep", "min", "night", "A", "v1", ALL, { plaus: [0, 1200] }),
  m("sleep_start_local", "sleep", "sleep", "clock", "night", "A", "v1", ALL, { plaus: [0, 1440] }),
  m("sleep_end_local", "sleep", "sleep", "clock", "night", "A", "v1", ALL, { plaus: [0, 1440] }),
  m("sleep_score_vendor", "sleep", "sleep", "score", "night", "A", "v1", [...GARMIN, "oura", "whoop", "polar"], { plaus: [0, 100], vendorScore: true }),
  // Apple: "na cama" vem do iPhone, não do relógio — escondido.
  m("sleep_in_bed_min", "sleep", "sleep", "min", "night", "A", "v1d", [...GARMIN, "pixel", "oura", "whoop"], { plaus: [0, 1200] }),
  m("sleep_efficiency_pct", "sleep", "sleep", "pct", "night", "A", "v1d", ALL, { plaus: [0, 100] }),
  m("sleep_regularity", "sleep", "sleep", "score", "computed", "C", "v1d", ALL, { plaus: [0, 100] }),
  m("nap_count", "sleep", "sleep", "count", "sum", "A", "v1d", [...APPLE, ...GARMIN, "galaxy", "oura", "whoop"], { plaus: [0, 6] }),
  m("nap_min", "sleep", "sleep", "min", "sum", "A", "v1d", [...APPLE, ...GARMIN, "galaxy", "oura", "whoop"], { plaus: [0, 300] }),
  m("sleep_hr_lowest", "sleep", "sleep", "bpm", "min", "A", "v1d", ALL, { plaus: [25, 240] }),

  // ------------------------------------------------------------ coração
  m("hr_resting", "heart", "vitals", "bpm", "last", "A", "v1", without("galaxy"), { plaus: [30, 120] }),
  m("hrv_night", "heart", "vitals", "ms", "night", "A", "v1", without("galaxy"), { plaus: [3, 300] }),
  m("vo2max", "heart", "workouts", "ml_kg_min", "last", "T", "v1", [...APPLE, ...GARMIN, "galaxy", "pixel", "oura"], { plaus: [10, 95] }),
  // FC/VFC/respiração do dia ficam no detalhe de Atividade: "Sinais da noite" só tem leituras do sono.
  m("hr_avg", "heart", "activity", "bpm", "avg", "A", "v1d", ALL, { plaus: [25, 240] }),
  m("hr_min", "heart", "activity", "bpm", "min", "A", "v1d", ALL, { plaus: [25, 240] }),
  m("hr_max", "heart", "activity", "bpm", "max", "A", "v1d", ALL, { plaus: [25, 240] }),
  m("hr_walking_avg", "heart", "activity", "bpm", "last", "A", "v1d", APPLE, { plaus: [25, 240] }),
  m("hrv_day_avg", "heart", "activity", "ms", "avg", "A", "v1d", [...APPLE, "pixel"], { plaus: [3, 300] }),
  m("hr_recovery_1min", "heart", "workouts", "bpm", "last", "T", "v1d", APPLE, { plaus: [0, 100] }),
  m("fitness_age", "heart", "workouts", "years", "last", "A", "v1d", GARMIN, { plaus: [15, 100] }),
  m("hr_zone1_min", "heart", "workouts", "min", "sum", "A", "v1d", without("oura"), { plaus: [0, 1440] }),
  m("hr_zone2_min", "heart", "workouts", "min", "sum", "A", "v1d", without("oura"), { plaus: [0, 1440] }),
  m("hr_zone3_min", "heart", "workouts", "min", "sum", "A", "v1d", without("oura"), { plaus: [0, 1440] }),
  m("hr_zone4_min", "heart", "workouts", "min", "sum", "A", "v1d", without("oura"), { plaus: [0, 1440] }),
  m("hr_zone5_min", "heart", "workouts", "min", "sum", "A", "v1d", without("oura"), { plaus: [0, 1440] }),

  // ------------------------------------------------------------ atividade
  m("steps", "activity", "activity", "count", "sum", "A", "v1", without("whoop"), { plaus: [0, 100_000] }),
  // Galaxy pelo Health Connect: distância e kcal só existem dentro de exercícios.
  m("distance_m", "activity", "activity", "m", "sum", "A", "v1", [...APPLE, ...GARMIN, "pixel", "oura", "polar"], { plaus: [0, 200_000] }),
  m("active_kcal", "activity", "activity", "kcal", "sum", "A", "v1", without("galaxy"), { plaus: [0, 10_000] }),
  m("basal_kcal", "activity", "activity", "kcal", "sum", "A", "v1d", [...APPLE, ...GARMIN], { plaus: [500, 5000] }),
  m("move_goal_kcal", "activity", "activity", "kcal", "last", "A", "v1", APPLE, { plaus: [10, 5000], goal: true }),
  m("exercise_goal_min", "activity", "activity", "min", "last", "A", "v1", APPLE, { plaus: [1, 240], goal: true }),
  m("stand_goal_h", "activity", "activity", "h", "last", "A", "v1", APPLE, { plaus: [1, 24], goal: true }),
  m("exercise_min", "activity", "activity", "min", "sum", "A", "v1", APPLE, { plaus: [0, 1440] }),
  m("stand_hours", "activity", "activity", "h", "sum", "A", "v1", APPLE, { plaus: [0, 24] }),
  m("stand_min", "activity", "activity", "min", "sum", "A", "v1d", APPLE, { plaus: [0, 1440] }),
  m("steps_goal", "activity", "activity", "count", "last", "A", "v1", GARMIN, { plaus: [100, 100_000], goal: true }),
  m("intensity_min_week", "activity", "activity", "min", "week", "A", "v1", GARMIN, { plaus: [0, 10_080] }),
  m("intensity_goal_week_min", "activity", "activity", "min", "last", "A", "v1", GARMIN, { plaus: [1, 10_080], goal: true }),
  m("intensity_min_moderate", "activity", "activity", "min", "sum", "A", "v1d", [...GARMIN, "oura"], { plaus: [0, 1440] }),
  m("intensity_min_vigorous", "activity", "activity", "min", "sum", "A", "v1d", [...GARMIN, "oura"], { plaus: [0, 1440] }),
  m("intensity_min_weighted", "activity", "activity", "min", "computed", "C", "v1", ["galaxy", "pixel", "oura", "whoop", "polar"], { plaus: [0, 2880] }),
  m("floors_climbed", "activity", "activity", "count", "sum", "A", "v1", [...APPLE, ...GARMIN], { plaus: [0, 500] }),
  m("floors_descended", "activity", "activity", "count", "sum", "A", "v1d", GARMIN, { plaus: [0, 500] }),
  m("floors_goal", "activity", "activity", "count", "last", "A", "v1d", GARMIN, { plaus: [1, 500], goal: true }),
  m("sedentary_min", "activity", "activity", "min", "sum", "A", "v1d", [...GARMIN, "oura"], { plaus: [0, 1440] }),
  m("wheelchair_pushes", "activity", "activity", "count", "sum", "A", "v1", APPLE, { plaus: [0, 100_000] }),
  m("wheelchair_distance_m", "activity", "activity", "m", "sum", "A", "v1", APPLE, { plaus: [0, 200_000] }),

  // ------------------------------------------------------------ treinos (iniciados ou detectados no relógio)
  m("workout_count", "workout", "workouts", "count", "sum", "T", "v1", ALL, { plaus: [0, 20] }),
  m("workout_min", "workout", "workouts", "min", "sum", "T", "v1", ALL, { plaus: [0, 1440] }),
  m("workout_kcal", "workout", "workouts", "kcal", "sum", "T", "v1", ALL, { plaus: [0, 10_000] }),
  m("workout_distance_m", "workout", "workouts", "m", "sum", "T", "v1", ALL, { plaus: [0, 400_000] }),
  m("workout_pace_s_per_km", "workout", "workouts", "s_per_km", "session", "T", "v1", ALL, { plaus: [60, 3600] }),

  // ------------------------------------------------------------ respiração / O₂ (Sinais da noite)
  m("resp_rate_sleep", "breathing", "vitals", "rpm", "night", "A", "v1", without("galaxy"), { plaus: [4, 40] }),
  m("spo2_night_avg", "breathing", "vitals", "pct", "night", "A", "v1", ["apple_s12", ...GARMIN, "galaxy", "pixel", "oura", "whoop"], { plaus: [70, 100] }),
  m("spo2_night_min", "breathing", "vitals", "pct", "night", "A", "v1", ["apple_s12", ...GARMIN, "galaxy", "pixel", "oura", "whoop"], { plaus: [70, 100] }),
  m("resp_rate_day_avg", "breathing", "activity", "rpm", "avg", "A", "v1d", GARMIN, { plaus: [4, 40] }),

  // ------------------------------------------------------------ temperatura (Sinais da noite)
  m("skin_temp_delta_c", "temperature", "vitals", "c_delta", "night", "A", "v1", [...APPLE, "garmin_fenix", "pixel", "oura", "whoop", "polar"], { plaus: [-5, 5] }),
  m("skin_temp_c", "temperature", "vitals", "c", "night", "A", "v1d", ["whoop"], { plaus: [25, 40] }),

  // ------------------------------------------------------------ estresse (Garmin e Oura)
  m("stress_avg", "stress", "stress", "score", "avg", "A", "v1", GARMIN, { plaus: [0, 100], vendorScore: true }),
  m("stress_max", "stress", "stress", "score", "max", "A", "v1d", GARMIN, { plaus: [0, 100], vendorScore: true }),
  m("stress_rest_min", "stress", "stress", "min", "sum", "A", "v1d", GARMIN, { plaus: [0, 1440] }),
  m("stress_low_min", "stress", "stress", "min", "sum", "A", "v1d", GARMIN, { plaus: [0, 1440] }),
  m("stress_medium_min", "stress", "stress", "min", "sum", "A", "v1d", GARMIN, { plaus: [0, 1440] }),
  m("stress_high_min", "stress", "stress", "min", "sum", "A", "v1", [...GARMIN, "oura"], { plaus: [0, 1440] }),
  m("recovery_high_min", "stress", "stress", "min", "sum", "A", "v1", ["oura"], { plaus: [0, 1440] }),

  // ------------------------------------------------------------ ambiente (uma linha em "Seu dia")
  m("env_noise_db_avg", "environment", "environment", "db", "avg", "A", "v1", APPLE, { plaus: [20, 120] }),
  m("env_noise_alerts", "environment", "environment", "count", "sum", "A", "v1d", APPLE, { plaus: [0, 50] }),
  m("daylight_min", "environment", "environment", "min", "sum", "A", "v1", ["apple_s12"], { plaus: [0, 1440] }),

  // ------------------------------------------------------------ segurança (só aparece se > 0)
  m("falls_detected", "safety", "safety", "count", "sum", "A", "v1", APPLE, { plaus: [0, 20] }),
] as const satisfies readonly MetricDef[];

export type MetricCode = (typeof METRICS)[number]["code"];

const BY_CODE = new Map<string, MetricDef>(METRICS.map((d) => [d.code, d]));

export function metricDef(code: string): MetricDef | null {
  return BY_CODE.get(code) ?? null;
}

export function isMetricCode(code: string): code is MetricCode {
  return BY_CODE.has(code);
}

/** O modelo mede (e entrega) esta métrica? Se não, ela fica escondida — nunca vira zero (RN-04). */
export function modelMeasures(model: WatchModelId, code: string): boolean {
  return BY_CODE.get(code)?.models.includes(model) ?? false;
}

export function metricsForModel(model: WatchModelId): MetricDef[] {
  return METRICS.filter((d) => (d.models as readonly WatchModelId[]).includes(model));
}

export function metricsForSection(section: TodaySectionId): MetricDef[] {
  return METRICS.filter((d) => d.section === section);
}

// ---------------------------------------------------------------- modelos (§13.3)
export type SyncAppKey = "appleHealth" | "garminConnect" | "samsungHealth" | "fitbit" | "oura" | "whoop" | "polarFlow";

export type WatchModelInfo = {
  id: WatchModelId;
  brand: WatchBrand;
  /** Índice da marca que sai por API: vira o principal do card (RN-08b). */
  vendorIndex: "body_battery" | "readiness_vendor" | null;
  /** A marca tem índice próprio que não compartilha (nota fixa no card). */
  hiddenIndexNote: "garmin" | "apple_readiness" | null;
  /** Método da VFC (RN-09: nunca misturar). */
  hrvMethod: "sdnn" | "rmssd";
  /** Caminho técnico para ler o dado real (fases futuras). */
  path: "native_ios" | "native_android" | "oauth";
  /** App da marca onde a pessoa sincroniza: chave de wearables.syncApps (o nome muda por idioma, ex.: Saúde/Health/Salud). */
  syncApp: SyncAppKey;
};

export const MODEL_INFO: Record<WatchModelId, WatchModelInfo> = {
  apple_s12: { id: "apple_s12", brand: "apple", vendorIndex: null, hiddenIndexNote: "apple_readiness", hrvMethod: "sdnn", path: "native_ios", syncApp: "appleHealth" },
  apple_se3: { id: "apple_se3", brand: "apple", vendorIndex: null, hiddenIndexNote: null, hrvMethod: "sdnn", path: "native_ios", syncApp: "appleHealth" },
  garmin_fenix: { id: "garmin_fenix", brand: "garmin", vendorIndex: "body_battery", hiddenIndexNote: "garmin", hrvMethod: "rmssd", path: "oauth", syncApp: "garminConnect" },
  garmin_vivo: { id: "garmin_vivo", brand: "garmin", vendorIndex: "body_battery", hiddenIndexNote: "garmin", hrvMethod: "rmssd", path: "oauth", syncApp: "garminConnect" },
  galaxy: { id: "galaxy", brand: "samsung", vendorIndex: null, hiddenIndexNote: null, hrvMethod: "rmssd", path: "native_android", syncApp: "samsungHealth" },
  pixel: { id: "pixel", brand: "google", vendorIndex: null, hiddenIndexNote: null, hrvMethod: "rmssd", path: "oauth", syncApp: "fitbit" },
  oura: { id: "oura", brand: "oura", vendorIndex: "readiness_vendor", hiddenIndexNote: null, hrvMethod: "rmssd", path: "oauth", syncApp: "oura" },
  whoop: { id: "whoop", brand: "whoop", vendorIndex: "readiness_vendor", hiddenIndexNote: null, hrvMethod: "rmssd", path: "oauth", syncApp: "whoop" },
  polar: { id: "polar", brand: "polar", vendorIndex: "readiness_vendor", hiddenIndexNote: null, hrvMethod: "rmssd", path: "oauth", syncApp: "polarFlow" },
};

/** Marcas do card "Conectar relógio" (todas "em breve": nenhuma conexão real existe ainda). */
export const CONNECT_BRANDS = ["garmin", "apple", "samsung", "google", "oura", "whoop", "polar"] as const satisfies readonly WatchBrand[];

/** Seções na ordem fixa do Hoje: "Sua noite" e "Seu dia até agora" (§6.2). */
export const NIGHT_SECTIONS = ["readiness", "sleep", "vitals"] as const satisfies readonly TodaySectionId[];
export const DAY_SECTIONS = ["activity", "workouts", "stress", "environment", "safety"] as const satisfies readonly TodaySectionId[];
/** Seções com página de detalhe (segurança só aparece no Hoje quando há evento). */
export const DETAIL_SECTIONS = ["readiness", "sleep", "vitals", "activity", "workouts", "stress", "environment"] as const satisfies readonly TodaySectionId[];
export type DetailSectionId = (typeof DETAIL_SECTIONS)[number];

export function isDetailSection(value: string): value is DetailSectionId {
  return (DETAIL_SECTIONS as readonly string[]).includes(value);
}

/** Componentes de "Sinais da noite" (§13.4), na ordem de exibição. */
export const NIGHT_VITALS_COMPONENTS = ["hr_resting", "hrv_night", "resp_rate_sleep", "spo2_night_avg", "skin_temp_delta_c"] as const satisfies readonly MetricCode[];

// ---------------------------------------------------------------- o que fica de fora (texto de "Sobre seus dados")
// Só identificadores de texto; NÃO são métricas e nunca entram no catálogo acima.
export const EXCLUDED_REGULATED = ["ecg", "irregularRhythm", "afib", "hypertension", "apnea", "highLowHr", "estimatedBp"] as const;
export const EXCLUDED_ON_DEMAND = ["spo2Spot", "healthSnapshot", "bodyComposition"] as const;
export const EXCLUDED_MANUAL = ["water", "food", "weight", "mood", "cycle", "effort", "caffeine", "glucose"] as const;
export const VENDOR_ONLY_BRANDS = ["apple", "garmin", "samsung", "google", "whoop", "oura"] as const satisfies readonly WatchBrand[];
