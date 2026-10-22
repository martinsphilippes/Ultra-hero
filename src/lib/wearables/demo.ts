// "Relógio simulado" das contas de demonstração (§9.9). Função pura e determinística por
// conta + data local: nada é gravado no banco, nada vai para analytics, nenhum dado real entra.
// Só emite métricas que o modelo simulado de fato mede (catálogo ∩ coluna da matriz, RN-22) e
// mantém coerência entre elas: noite ruim → VFC menor, FC de repouso maior, Disposição menor.

import { isMetricCode, MODEL_INFO, modelMeasures, NIGHT_VITALS_COMPONENTS, type MetricCode, type WatchModelId } from "./catalog";
import { baseline, disposition, edwardsTrimp, nightVitals, sleepEfficiency, sleepRegularity, trainingLoad, type Baseline, type DispositionResult, type NightVitalsResult } from "./derived";

export type DemoPersonaKey = "admin" | "creator" | "seller" | "premium" | "free" | "example";
export type Sport = "run" | "trail_run" | "walk" | "cycle" | "strength";

type Persona = {
  key: DemoPersonaKey;
  model: WatchModelId;
  /** Nome comercial do modelo simulado (nome próprio, não traduzido). */
  deviceName: string;
  rhr0: number;
  hrv0: number;
  sleepNeedMin: number;
  steps0: number;
  vo2: number;
  /** Hora de acordar habitual, em minutos desde a meia-noite. */
  wakeMin: number;
  /** Dias de treino (0 = domingo). */
  trainingDays: readonly number[];
  sports: readonly Sport[];
  workoutStartMin: number;
  episodeOffset: number;
  moveGoalKcal: number;
};

// Persona por conta demo (coerente com a matriz §13.3). "example" é a prévia "Ver um exemplo" das
// contas reais: nunca se mistura ao perfil da pessoa.
export const DEMO_PERSONAS: Record<DemoPersonaKey, Persona> = {
  premium: { key: "premium", model: "apple_s12", deviceName: "Apple Watch Series 12", rhr0: 56, hrv0: 52, sleepNeedMin: 450, steps0: 8600, vo2: 44, wakeMin: 390, trainingDays: [1, 3, 5, 6], sports: ["run", "strength", "walk"], workoutStartMin: 1110, episodeOffset: 3, moveGoalKcal: 520 },
  free: { key: "free", model: "garmin_vivo", deviceName: "Garmin vívoactive 6", rhr0: 61, hrv0: 38, sleepNeedMin: 450, steps0: 7000, vo2: 39, wakeMin: 420, trainingDays: [2, 4, 6], sports: ["walk", "cycle", "run"], workoutStartMin: 1080, episodeOffset: 11, moveGoalKcal: 450 },
  creator: { key: "creator", model: "garmin_fenix", deviceName: "Garmin fēnix 9", rhr0: 50, hrv0: 68, sleepNeedMin: 465, steps0: 10500, vo2: 52, wakeMin: 360, trainingDays: [1, 2, 4, 5, 6], sports: ["run", "trail_run", "strength"], workoutStartMin: 400, episodeOffset: 17, moveGoalKcal: 700 },
  seller: { key: "seller", model: "galaxy", deviceName: "Galaxy Watch9", rhr0: 63, hrv0: 40, sleepNeedMin: 440, steps0: 6500, vo2: 38, wakeMin: 405, trainingDays: [2, 5], sports: ["walk", "cycle"], workoutStartMin: 1140, episodeOffset: 7, moveGoalKcal: 420 },
  admin: { key: "admin", model: "apple_se3", deviceName: "Apple Watch Series 11", rhr0: 59, hrv0: 42, sleepNeedMin: 450, steps0: 8000, vo2: 41, wakeMin: 375, trainingDays: [1, 4], sports: ["walk", "strength"], workoutStartMin: 1095, episodeOffset: 20, moveGoalKcal: 480 },
  example: { key: "example", model: "apple_s12", deviceName: "Apple Watch Series 12", rhr0: 58, hrv0: 47, sleepNeedMin: 450, steps0: 7800, vo2: 42, wakeMin: 400, trainingDays: [1, 3, 6], sports: ["run", "walk", "strength"], workoutStartMin: 1100, episodeOffset: 5, moveGoalKcal: 500 },
};

export const DEMO_EMAIL_KIND: Record<string, Exclude<DemoPersonaKey, "example">> = {
  "admin@demo.ultrahero.app": "admin",
  "heroi@demo.ultrahero.app": "creator",
  "fornecedor@demo.ultrahero.app": "seller",
  "premium@demo.ultrahero.app": "premium",
  "gratuito@demo.ultrahero.app": "free",
};

/**
 * Persona da conta: só para contas demo (marcador em app_metadata, gravável só pelo servidor).
 * Contas demo criadas pelo admin (fora da lista fixa) usam a persona do papel.
 */
export function demoPersonaFor(input: { isDemo: boolean; email: string | null | undefined; roles: readonly string[] }): Exclude<DemoPersonaKey, "example"> | null {
  if (!input.isDemo) return null;
  const byEmail = input.email ? DEMO_EMAIL_KIND[input.email.toLowerCase()] : undefined;
  if (byEmail) return byEmail;
  if (input.roles.includes("admin")) return "admin";
  if (input.roles.includes("creator")) return "creator";
  if (input.roles.includes("seller")) return "seller";
  return "free";
}

// ---------------------------------------------------------------- aleatoriedade determinística
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = { u: () => number; n: (sd?: number) => number; int: (min: number, max: number) => number };

function rngFor(key: string): Rng {
  const u = mulberry32(fnv1a32(key));
  return {
    u,
    // Box-Muller: normal com média 0
    n: (sd = 1) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()) * sd,
    int: (min, max) => min + Math.floor(u() * (max - min + 1)),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- datas YYYY-MM-DD (aritmética em UTC)
export function dayIndexOf(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}
export function ymdOf(dayIndex: number): string {
  return new Date(dayIndex * 86_400_000).toISOString().slice(0, 10);
}
function weekdayOfIndex(dayIndex: number): number {
  return new Date(dayIndex * 86_400_000).getUTCDay();
}

// ---------------------------------------------------------------- um dia bruto (só depende da sua semente)
export type DemoWorkout = {
  sport: Sport;
  startMin: number;
  durationMin: number;
  distanceM: number | null;
  kcal: number;
  avgHr: number;
  maxHr: number;
  zonesMin: [number, number, number, number, number];
  hrRecovery1min: number;
  trimp: number;
  steps: number;
};

type RawDay = {
  date: string;
  dayIndex: number;
  episode: boolean;
  sleepQ: number;
  wakeMin: number;
  sleepStartClock: number;
  asleep: number;
  deep: number;
  light: number;
  rem: number;
  awake: number;
  latency: number;
  hrvNight: number;
  hrvSamples: number;
  spo2Samples: number;
  rhr: number;
  resp: number;
  spo2Avg: number;
  spo2Min: number;
  tempDelta: number;
  sleepScore: number;
  lowestHr: number;
  napCount: number;
  napMin: number;
  bgSteps: number;
  bgModerate: number;
  bgVigorous: number;
  bgExercise: number;
  standFull: number;
  floorsFull: number;
  floorsDownFull: number;
  bgZones: [number, number, number, number, number];
  basalFull: number;
  stressAvg: number;
  stressMax: number;
  bbHigh: number;
  bbCharged: number;
  bbDrainFull: number;
  noiseDb: number;
  noiseAlerts: number;
  daylightFull: number;
  workout: DemoWorkout | null;
};

/** Treino do dia: só depende da semente do dia (não encadeia o dia anterior). */
function workoutFor(persona: Persona, dayIndex: number): DemoWorkout | null {
  const rng = rngFor(`${persona.key}:workout:${ymdOf(dayIndex)}`);
  if (!persona.trainingDays.includes(weekdayOfIndex(dayIndex)) || rng.u() > 0.85) return null;
  const sport = persona.sports[rng.int(0, persona.sports.length - 1)];
  const durationMin = sport === "strength" ? rng.int(35, 55) : sport === "walk" ? rng.int(35, 70) : rng.int(30, 75);
  const startMin = persona.workoutStartMin + rng.int(-20, 25);
  const speeds: Record<Sport, number> = { run: 1000 / (rng.int(300, 380) / 60), trail_run: 1000 / (rng.int(390, 480) / 60), walk: 1000 / (rng.int(560, 690) / 60), cycle: rng.int(320, 450), strength: 0 };
  const distanceM = sport === "strength" ? null : Math.round(speeds[sport] * durationMin);
  const intensity = { run: 0.75, trail_run: 0.8, walk: 0.35, cycle: 0.6, strength: 0.45 }[sport];
  const z5 = Math.round(durationMin * intensity * 0.06);
  const z4 = Math.round(durationMin * intensity * 0.3);
  const z3 = Math.round(durationMin * intensity * 0.5);
  const z2 = Math.round(durationMin * (1 - intensity) * 0.7);
  const z1 = Math.max(0, durationMin - z2 - z3 - z4 - z5);
  const zonesMin: DemoWorkout["zonesMin"] = [z1, z2, z3, z4, z5];
  const avgHr = Math.round(persona.rhr0 + 50 + 75 * intensity + rng.n(3));
  const steps = Math.round(durationMin * ({ run: 165, trail_run: 150, walk: 115, cycle: 0, strength: 12 } as const)[sport]);
  return {
    sport,
    startMin,
    durationMin,
    distanceM,
    kcal: Math.round(durationMin * (4 + 8 * intensity) + rng.n(15)),
    avgHr,
    maxHr: Math.round(avgHr + 14 + 12 * intensity + rng.u() * 6),
    zonesMin,
    hrRecovery1min: Math.round(clamp(22 + rng.n(5), 8, 45)),
    trimp: edwardsTrimp(zonesMin),
    steps,
  };
}

function isEpisode(persona: Persona, dayIndex: number): boolean {
  // a cada ~23 dias, 3 dias de "corpo pedindo pausa"
  return (((dayIndex + persona.episodeOffset) % 23) + 23) % 23 < 3;
}

const LOAD_MEAN = 55;
const LOAD_SD = 50;

function rawDay(persona: Persona, dayIndex: number): RawDay {
  const date = ymdOf(dayIndex);
  const rng = rngFor(`${persona.key}:${date}`);
  const weekday = weekdayOfIndex(dayIndex);
  const episode = isEpisode(persona, dayIndex);
  const prev = workoutFor(persona, dayIndex - 1);
  const loadPrev = prev?.trimp ?? 0;
  const zLoad = (loadPrev - LOAD_MEAN) / LOAD_SD;
  const lateHeavy = prev !== null && prev.trimp > 100 && prev.startMin >= 18 * 60;
  // a noite que termina num sábado ou domingo é a de sexta/sábado
  const weekendNight = weekday === 6 || weekday === 0;

  // Qualidade da noite: pior depois de treino pesado e tardio e nas noites de sexta/sábado.
  const sleepQ = rng.n(0.8) - 0.35 * (lateHeavy ? 1 : 0) - 0.5 * (weekendNight ? 1 : 0);
  // episódio: dorme mais (+40 min), mas com corpo carregado (VFC↓, FC rep.↑, temp.↑)
  const asleep = Math.round(clamp(persona.sleepNeedMin + 35 * sleepQ + (rng.u() * 40 - 20) + (episode ? 25 : 0) - (weekendNight ? 25 : 0), 300, 560));
  const awakePct = 0.03 + rng.u() * 0.05;
  const awake = Math.round(asleep * awakePct + (sleepQ < -0.8 ? 10 : 0));
  const deep = Math.round(asleep * (0.15 + rng.u() * 0.07 + 0.01 * clamp(sleepQ, -1, 1)));
  const rem = Math.round(asleep * (0.2 + rng.u() * 0.05));
  const light = asleep - deep - rem;
  const wakeMin = Math.round(persona.wakeMin + clamp(rng.n(15), -40, 40) + (weekendNight ? 45 : 0));
  const sleepStartClock = (((wakeMin - asleep - awake) % 1440) + 1440) % 1440;

  const hrvNight = round1(persona.hrv0 * Math.exp(0.12 * sleepQ - 0.06 * zLoad - 0.2 * (episode ? 1 : 0) + rng.n(0.05)));
  const rhr = Math.round(persona.rhr0 - 1.5 * sleepQ + 1.2 * zLoad + 4 * (episode ? 1 : 0) + rng.n(0.8));
  // Apple SE 3 e Series 9–11 medem a VFC poucas vezes por noite (RN-21: < 2 leituras → escondida)
  const hrvSamples = persona.model === "apple_se3" ? [0, 1, 2, 2, 3, 3, 3][rng.int(0, 6)] : rng.int(4, 9);
  const spo2Samples = rng.int(3, 9);
  const spo2Avg = Math.round(clamp(96.2 + rng.n(0.6) - (episode ? 0.6 : 0), 92, 99));
  const tempDelta = round1(clamp(rng.n(0.12) + (episode ? 0.3 + rng.u() * 0.3 : 0), -1.5, 1.5));

  const bgSteps = Math.round(clamp(persona.steps0 * (1 + rng.n(0.18)) * (weekday === 0 ? 0.8 : 1), 1500, 25000));
  const stressAvg = Math.round(clamp(32 - 6 * sleepQ + 6 * (episode ? 1 : 0) + rng.n(4), 12, 70));
  const bbHigh = Math.round(clamp(80 + 9 * sleepQ - 12 * (episode ? 1 : 0) + rng.n(4), 25, 100));
  const bbCharged = Math.round(clamp(48 + 10 * sleepQ - 6 * (episode ? 1 : 0) + rng.n(5), 10, 80));

  return {
    date,
    dayIndex,
    episode,
    sleepQ,
    wakeMin,
    sleepStartClock,
    asleep,
    deep,
    light,
    rem,
    awake,
    latency: rng.int(5, 22),
    hrvNight,
    hrvSamples,
    spo2Samples,
    rhr,
    resp: round1(clamp(14 + 0.8 * (episode ? 1 : 0) - 0.15 * sleepQ + rng.n(0.3), 10, 20)),
    spo2Avg,
    spo2Min: Math.round(clamp(spo2Avg - rng.int(2, 5), 85, spo2Avg)),
    tempDelta,
    sleepScore: Math.round(clamp(74 + 10 * sleepQ + 0.05 * (asleep - persona.sleepNeedMin) + rng.n(3), 30, 98)),
    lowestHr: Math.round(clamp(rhr - rng.int(3, 7), 35, 110)),
    napCount: weekendNight && rng.u() < 0.25 ? 1 : 0,
    napMin: 0,
    bgSteps,
    bgModerate: rng.int(6, 24),
    bgVigorous: rng.int(0, 4),
    bgExercise: rng.int(4, 18),
    standFull: rng.int(9, 13),
    floorsFull: rng.int(4, 16),
    floorsDownFull: 0,
    bgZones: [rng.int(40, 95), rng.int(8, 30), rng.int(0, 8), rng.int(0, 3), 0],
    basalFull: Math.round(1640 + rng.n(25)),
    stressAvg,
    stressMax: Math.round(clamp(stressAvg + 35 + rng.n(8), stressAvg, 99)),
    bbHigh,
    bbCharged,
    bbDrainFull: Math.round(clamp(52 + stressAvg / 4 + rng.n(6), 25, 90)),
    noiseDb: Math.round(clamp(63 + rng.n(3.5), 48, 82)),
    noiseAlerts: rng.u() < 0.08 ? 1 : 0,
    daylightFull: Math.round(clamp(55 + rng.n(30) + (weekendNight ? 25 : 0), 5, 240)),
    workout: workoutFor(persona, dayIndex),
  };
}

// Cochilo e andares descidos dependem da mesma semente, sem mudar a sequência acima.
function finishRaw(raw: RawDay): RawDay {
  const rng = rngFor(`${raw.date}:extra`);
  return { ...raw, napMin: raw.napCount ? rng.int(18, 45) : 0, floorsDownFull: Math.max(0, raw.floorsFull + rng.int(-2, 2)) };
}

// ---------------------------------------------------------------- valores do dia até um horário
const BEDTIME_MIN = 22 * 60 + 30;

/** Fração do dia ativo já vivida (0 antes de acordar, 1 depois das 22:30). */
function dayFraction(raw: RawDay, atMin: number): number {
  if (atMin <= raw.wakeMin) return 0;
  return clamp((atMin - raw.wakeMin) / (BEDTIME_MIN - raw.wakeMin), 0, 1);
}

type DayValues = Partial<Record<MetricCode, number>>;

/** Métricas de "Seu dia" acumuladas até `atMin` (minutos desde a meia-noite local). */
function dayValues(persona: Persona, raw: RawDay, atMin: number, weekBefore: number): { values: DayValues; workout: DemoWorkout | null } {
  const f = dayFraction(raw, atMin);
  const w = raw.workout && atMin >= raw.workout.startMin + raw.workout.durationMin ? raw.workout : null;
  const foot = w && (w.sport === "run" || w.sport === "trail_run" || w.sport === "walk");
  const steps = Math.round(raw.bgSteps * f + (w?.steps ?? 0));
  const moderate = Math.round(raw.bgModerate * f + (w ? (w.sport === "walk" || w.sport === "strength" ? w.durationMin * 0.8 : w.durationMin * 0.25) : 0));
  const vigorous = Math.round(raw.bgVigorous * f + (w ? (w.sport === "walk" || w.sport === "strength" ? w.durationMin * 0.05 : w.durationMin * 0.7) : 0));
  const zones = raw.bgZones.map((z, i) => Math.round(z * f + (w ? w.zonesMin[i] : 0))) as DemoWorkout["zonesMin"];
  const activeKcal = Math.round(raw.bgSteps * f * 0.034 + 60 * f + (w?.kcal ?? 0));
  const awakeSoFar = Math.max(0, Math.min(atMin, BEDTIME_MIN) - raw.wakeMin);
  const bbNow = Math.round(clamp(raw.bbHigh - raw.bbDrainFull * f - (w ? w.trimp / 6 : 0), 5, 100));
  const stressMinutes = Math.round(awakeSoFar * 0.85);
  // Distribuição do tempo coerente com a média do dia (média baixa → quase tudo em repouso/baixo).
  const highF = clamp((raw.stressAvg - 20) / 250, 0.01, 0.2);
  const mediumF = clamp((raw.stressAvg - 10) / 150, 0.04, 0.35);
  const lowF = 0.35;
  const restF = Math.max(0, 1 - highF - mediumF - lowF);

  const v: DayValues = {
    steps,
    distance_m: Math.round(raw.bgSteps * f * 0.72 + (foot && w?.distanceM ? w.distanceM : 0)),
    active_kcal: activeKcal,
    basal_kcal: Math.round(raw.basalFull * (atMin / 1440)),
    move_goal_kcal: persona.moveGoalKcal,
    exercise_goal_min: 30,
    stand_goal_h: 12,
    exercise_min: Math.round(raw.bgExercise * f + (w?.durationMin ?? 0)),
    stand_hours: Math.min(Math.round(raw.standFull * f), Math.floor(awakeSoFar / 60) + 1),
    stand_min: Math.round(raw.standFull * f * 9),
    steps_goal: 8000,
    intensity_min_moderate: moderate,
    intensity_min_vigorous: vigorous,
    intensity_min_week: weekBefore + moderate + 2 * vigorous,
    intensity_goal_week_min: 150,
    intensity_min_weighted: moderate + 2 * vigorous,
    floors_climbed: Math.round(raw.floorsFull * f + (w?.sport === "trail_run" ? 18 : 0)),
    floors_descended: Math.round(raw.floorsDownFull * f + (w?.sport === "trail_run" ? 17 : 0)),
    floors_goal: 10,
    sedentary_min: Math.round(awakeSoFar * 0.62),
    hr_avg: Math.round(raw.rhr + 13 + (w ? 4 : 0)),
    hr_min: raw.lowestHr,
    hr_max: w ? w.maxHr : Math.round(raw.rhr + 55),
    hr_walking_avg: Math.round(raw.rhr + 36),
    hrv_day_avg: round1(raw.hrvNight * 0.72),
    hr_zone1_min: zones[0],
    hr_zone2_min: zones[1],
    hr_zone3_min: zones[2],
    hr_zone4_min: zones[3],
    hr_zone5_min: zones[4],
    cardio_load_day_uh: edwardsTrimp(zones),
    resp_rate_day_avg: round1(raw.resp + 2.1),
    stress_avg: raw.stressAvg,
    stress_max: raw.stressMax,
    stress_rest_min: Math.round(stressMinutes * restF),
    stress_low_min: Math.round(stressMinutes * lowF),
    stress_medium_min: Math.round(stressMinutes * mediumF),
    stress_high_min: Math.round(stressMinutes * highF),
    body_battery_now: bbNow,
    body_battery_high: raw.bbHigh,
    body_battery_low: Math.min(bbNow, Math.max(5, raw.bbHigh - raw.bbCharged)),
    body_battery_charged: raw.bbCharged,
    body_battery_drained: Math.max(0, raw.bbHigh - bbNow),
    env_noise_db_avg: f > 0 ? raw.noiseDb : undefined,
    env_noise_alerts: f > 0.5 ? raw.noiseAlerts : 0,
    daylight_min: Math.round(raw.daylightFull * f),
    falls_detected: 0,
    workout_count: w ? 1 : 0,
    workout_min: w?.durationMin ?? 0,
    workout_kcal: w?.kcal ?? 0,
  };
  if (w?.distanceM) v.workout_distance_m = w.distanceM;
  if (w && foot && w.distanceM) v.workout_pace_s_per_km = Math.round((w.durationMin * 60) / (w.distanceM / 1000));
  if (w && MODEL_INFO[persona.model].brand === "apple") v.hr_recovery_1min = w.hrRecovery1min;
  return { values: v, workout: w };
}

/** Métricas de "Sua noite" (sessão que termina na manhã de `raw.date`). */
function nightValues(persona: Persona, raw: RawDay): DayValues {
  const v: DayValues = {
    sleep_asleep_min: raw.asleep,
    sleep_deep_min: raw.deep,
    sleep_light_min: raw.light,
    sleep_rem_min: raw.rem,
    sleep_awake_min: raw.awake,
    sleep_start_local: (raw.sleepStartClock - 720 + 1440) % 1440,
    sleep_end_local: (raw.wakeMin - 720 + 1440) % 1440,
    sleep_score_vendor: raw.sleepScore,
    sleep_in_bed_min: raw.asleep + raw.awake + raw.latency,
    sleep_efficiency_pct: sleepEfficiency(raw.asleep, raw.awake),
    nap_count: raw.napCount,
    nap_min: raw.napMin,
    sleep_hr_lowest: raw.lowestHr,
    hr_resting: raw.rhr,
    resp_rate_sleep: raw.resp,
    spo2_night_avg: raw.spo2Avg,
    spo2_night_min: raw.spo2Min,
    skin_temp_delta_c: raw.tempDelta,
  };
  // RN-21: VFC noturna só com 2+ leituras dentro da sessão
  if (raw.hrvSamples >= 2) v.hrv_night = raw.hrvNight;
  return v;
}

// ---------------------------------------------------------------- foto do dia
export type MetricPoint = {
  code: MetricCode;
  value: number;
  /** Data local da amostra (a noite pertence ao dia em que a pessoa acorda). */
  date: string;
  /** Horário da amostra em minutos desde a meia-noite local ("58 às 07:42"). */
  at: number;
  sampleCount?: number;
  method?: "sdnn" | "rmssd";
};

export type HistoryDay = { date: string; partial: boolean; values: DayValues };

export type WatchSnapshot = {
  persona: DemoPersonaKey;
  model: WatchModelId;
  deviceName: string;
  date: string;
  /** "Dados até HH:MM": última sincronização simulada, em minutos desde a meia-noite. */
  syncedAt: number;
  night: { date: string; isToday: boolean; startClock: number; endClock: number } | null;
  /** Só métricas que o modelo mede (escondidas, nunca zero). */
  values: Partial<Record<MetricCode, MetricPoint>>;
  workouts: (DemoWorkout & { endMin: number })[];
  lastWorkoutDate: string | null;
  /** Últimos 30 dias (hoje parcial), para as tendências de 7/30 dias. */
  history: HistoryDay[];
  baselines: Partial<Record<MetricCode, Baseline | null>>;
  disposition: DispositionResult | null;
  nightVitals: NightVitalsResult | null;
};

export const HISTORY_DAYS = 30;
const GENERATED_DAYS = HISTORY_DAYS + 30; // 30 visíveis + linha de base de 28 dias para cada um

const MIN_SPREAD: Partial<Record<MetricCode, number>> = {
  hr_resting: 1,
  hrv_night: 2,
  resp_rate_sleep: 0.3,
  spo2_night_avg: 0.5,
  skin_temp_delta_c: 0.1,
  sleep_asleep_min: 15,
  cardio_load_day_uh: 10,
  steps: 400,
  stress_avg: 2,
  body_battery_high: 3,
  disposition_uh: 3,
};

function measured(model: WatchModelId, values: DayValues): DayValues {
  const out: DayValues = {};
  for (const [code, value] of Object.entries(values)) {
    if (typeof value === "number" && Number.isFinite(value) && isMetricCode(code) && modelMeasures(model, code)) out[code] = value;
  }
  return out;
}

/**
 * Gera o Hoje simulado para `persona` na data local `date` ("YYYY-MM-DD"), com o relógio
 * sincronizado até pouco antes de `nowMin` (minutos desde a meia-noite local).
 * Mesma entrada → mesma saída. Nada é guardado.
 */
export function generateWatchDay(personaKey: DemoPersonaKey, date: string, nowMin: number): WatchSnapshot {
  const persona = DEMO_PERSONAS[personaKey];
  const model = persona.model;
  const todayIndex = dayIndexOf(date);
  const lag = rngFor(`${persona.key}:sync:${date}`).int(2, 18);
  const syncedAt = clamp(Math.round(nowMin) - lag, 0, 1439);

  const raws: RawDay[] = [];
  for (let i = todayIndex - GENERATED_DAYS + 1; i <= todayIndex; i++) raws.push(finishRaw(rawDay(persona, i)));
  const today = raws[raws.length - 1];
  // A noite de hoje só existe depois que o relógio sincronizou após o despertar.
  const nightIsToday = syncedAt >= today.wakeMin + 5;

  // Valores brutos por dia (noite + dia), já filtrados pelo que o modelo mede.
  const series: HistoryDay[] = [];
  let weekAccum = 0;
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    const isToday = i === raws.length - 1;
    if (weekdayOfIndex(raw.dayIndex) === 1) weekAccum = 0; // semana da Garmin começa na segunda
    const { values: day } = dayValues(persona, raw, isToday ? syncedAt : 1440, weekAccum);
    weekAccum += (day.intensity_min_moderate ?? 0) + 2 * (day.intensity_min_vigorous ?? 0);
    const night = isToday && !nightIsToday ? {} : nightValues(persona, raw);
    series.push({ date: raw.date, partial: isToday, values: { ...night, ...day } });
  }

  // Derivados (mesmas funções da ingestão futura), dia a dia, contra os 28 dias anteriores.
  const loads: number[] = [];
  const midpoints: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i].values;
    const prior = series.slice(Math.max(0, i - 28), i).filter((d) => !d.partial).map((d) => d.values);
    if (typeof v.cardio_load_day_uh === "number") loads.push(v.cardio_load_day_uh);
    const tl = trainingLoad(loads);
    v.training_load_acute_7d = tl.acute;
    v.training_load_chronic_28d = tl.chronic;
    if (tl.ratio !== null) v.load_ratio = tl.ratio;
    if (typeof v.sleep_start_local === "number" && typeof v.sleep_asleep_min === "number" && typeof v.sleep_awake_min === "number") {
      midpoints.push(v.sleep_start_local + (v.sleep_asleep_min + v.sleep_awake_min) / 2);
      const regularity = sleepRegularity(midpoints);
      if (regularity !== null) v.sleep_regularity = regularity;
    }
    // Índices só para os dias visíveis (os 30 anteriores servem de linha de base).
    if (i < series.length - HISTORY_DAYS) {
      series[i] = { ...series[i], values: measured(model, v) };
      continue;
    }
    const filtered = measured(model, v);
    // os dias anteriores já foram filtrados pelo que o modelo mede
    const hist = (code: MetricCode) => prior.map((p) => p[code] ?? null);
    const disp = disposition({
      hrvNight: filtered.hrv_night,
      hrvHistory: hist("hrv_night"),
      restingHr: filtered.hr_resting,
      restingHrHistory: hist("hr_resting"),
      asleepMin: filtered.sleep_asleep_min,
      asleepHistory: hist("sleep_asleep_min"),
      efficiencyPct: filtered.sleep_efficiency_pct,
      efficiencyHistory: hist("sleep_efficiency_pct"),
      loadRatio: filtered.load_ratio,
      tempDelta: filtered.skin_temp_delta_c,
    });
    if (disp) v.disposition_uh = disp.score;
    const vitals = nightVitals(NIGHT_VITALS_COMPONENTS.map((code) => ({ code, value: filtered[code], history: hist(code), minSpread: MIN_SPREAD[code] })));
    if (vitals && vitals.total > 0) v.night_vitals_uh = vitals.within;
    series[i] = { ...series[i], values: measured(model, v) };
  }

  const history = series.slice(-HISTORY_DAYS);
  const todayValues = series[series.length - 1].values;
  const priorFull = series.slice(-29, -1).map((d) => d.values);
  const nightRaw = nightIsToday ? today : raws[raws.length - 2];
  // Antes da sincronização da manhã, "Sua noite" mostra a última noite disponível, com a data dela.
  const nightSource = nightIsToday ? todayValues : series[series.length - 2].values;
  const nightPrior = (nightIsToday ? series.slice(-29, -1) : series.slice(-30, -2)).map((d) => d.values);
  const nightDate = nightRaw.date;

  // Pontos com horário: noite às HH:MM do despertar, dia até a sincronização, treinos no fim.
  const hrvMethod = MODEL_INFO[model].hrvMethod;
  const values: Partial<Record<MetricCode, MetricPoint>> = {};
  const nightCodes = new Set<string>(Object.keys(nightValues(persona, nightRaw)));
  ["disposition_uh", "night_vitals_uh", "sleep_regularity"].forEach((c) => nightCodes.add(c));
  const { workout } = dayValues(persona, today, syncedAt, 0);
  for (const [code, value] of Object.entries(nightSource)) {
    if (!nightCodes.has(code) || !isMetricCode(code) || typeof value !== "number") continue;
    values[code] = { code, value, date: nightDate, at: nightRaw.wakeMin, ...(code === "hrv_night" ? { sampleCount: nightRaw.hrvSamples, method: hrvMethod } : {}), ...(code.startsWith("spo2_night") ? { sampleCount: nightRaw.spo2Samples } : {}) };
  }
  for (const [code, value] of Object.entries(todayValues)) {
    if (nightCodes.has(code) || !isMetricCode(code) || typeof value !== "number") continue;
    const at = code.startsWith("workout_") && workout ? workout.startMin + workout.durationMin : syncedAt;
    values[code] = { code, value, date, at };
  }

  // VO₂máx: atualizado só depois de um treino (último treino dos 14 dias anteriores ou de hoje).
  let lastWorkoutDate: string | null = null;
  for (let i = raws.length - 1; i >= Math.max(0, raws.length - 15); i--) {
    const w = raws[i].workout;
    if (w && (i < raws.length - 1 || syncedAt >= w.startMin + w.durationMin)) {
      lastWorkoutDate = raws[i].date;
      if (modelMeasures(model, "vo2max")) {
        const vo2 = persona.vo2 + 1.2 * Math.sin(raws[i].dayIndex / 45);
        values.vo2max = { code: "vo2max", value: MODEL_INFO[model].brand === "apple" ? round1(vo2) : Math.round(vo2), date: raws[i].date, at: w.startMin + w.durationMin };
      }
      break;
    }
  }
  if (modelMeasures(model, "fitness_age")) {
    values.fitness_age = { code: "fitness_age", value: Math.round(clamp(38 - (persona.vo2 - 44) * 0.8, 20, 70)), date, at: syncedAt };
  }

  const baselines: Partial<Record<MetricCode, Baseline | null>> = {};
  for (const code of Object.keys(values) as MetricCode[]) {
    const prior = nightCodes.has(code) ? nightPrior : priorFull;
    baselines[code] = baseline(prior.map((p) => p[code] ?? null), MIN_SPREAD[code] ?? 0);
  }

  // Índices da noite mostrada (para o card e o detalhe "ver nosso cálculo").
  const histOf = (code: MetricCode) => nightPrior.map((p) => p[code] ?? null);
  const disp = disposition({
    hrvNight: nightSource.hrv_night,
    hrvHistory: histOf("hrv_night"),
    restingHr: nightSource.hr_resting,
    restingHrHistory: histOf("hr_resting"),
    asleepMin: nightSource.sleep_asleep_min,
    asleepHistory: histOf("sleep_asleep_min"),
    efficiencyPct: nightSource.sleep_efficiency_pct,
    efficiencyHistory: histOf("sleep_efficiency_pct"),
    loadRatio: todayValues.load_ratio,
    tempDelta: nightSource.skin_temp_delta_c,
  });
  const vitals = nightVitals(NIGHT_VITALS_COMPONENTS.map((code) => ({ code, value: nightSource[code], history: histOf(code), minSpread: MIN_SPREAD[code] })));

  return {
    persona: personaKey,
    model,
    deviceName: persona.deviceName,
    date,
    syncedAt,
    night: nightSource.sleep_asleep_min !== undefined ? { date: nightDate, isToday: nightIsToday, startClock: nightRaw.sleepStartClock, endClock: nightRaw.wakeMin } : null,
    values,
    workouts: workout ? [{ ...workout, endMin: workout.startMin + workout.durationMin }] : [],
    lastWorkoutDate,
    history,
    baselines,
    disposition: modelMeasures(model, "disposition_uh") ? disp : null,
    nightVitals: vitals,
  };
}
