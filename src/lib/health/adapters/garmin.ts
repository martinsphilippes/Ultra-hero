// Adaptador Garmin Health API (push/ping, §9.4). Puro: payload bruto → lote normalizado.
// Campos da §13.2; os nomes vêm da documentação da Health API (acesso só com cadastro no Garmin
// Connect Developer Program) e do esquema do Open Wearables [OW] — reconferir no portal.
// Lista permitida por tipo de resumo (RN-02b): água (hydrationInMilliliters), calorias ingeridas
// (consumedCalories), metas de calorias, composição corporal (bodyComps), ciclo (mct), pressão,
// leituras sob demanda (onDemandReadings / pulseox) e atividades manuais ou enviadas pela web
// (manual / isWebUpload) NUNCA entram — tests/unit/health-adapters.test.ts falha se entrarem.

import type { MetricCode } from "@/lib/wearables/catalog";
import { emptyBatch, type DailyInput, type NormalizedBatch, type SleepInput, type WorkoutInput } from "../types";
import { canonicalSport, get, isoAt, isYmd, localDateAt, mean, num, pickAllowed, round, str } from "./common";

export const GARMIN_NORMALIZER_VERSION = 1;

/** Códigos que este adaptador grava (tests/unit/health-adapters.test.ts confere com as fixtures). Define
 * as categorias oferecidas no consentimento e o que "Sobre seus dados" diz que a marca mede. */
export const GARMIN_INGESTED_CODES = [
  "steps", "wheelchair_pushes", "wheelchair_distance_m", "distance_m", "active_kcal", "basal_kcal", "intensity_min_moderate", "intensity_min_vigorous",
  "intensity_goal_week_min", "floors_climbed", "floors_descended", "floors_goal", "steps_goal", "hr_min", "hr_avg", "hr_max", "hr_resting",
  "stress_avg", "stress_max", "stress_rest_min", "stress_low_min", "stress_medium_min", "stress_high_min",
  "body_battery_charged", "body_battery_drained", "body_battery_high", "body_battery_low", "body_battery_now",
  "sleep_asleep_min", "sleep_deep_min", "sleep_light_min", "sleep_rem_min", "sleep_awake_min", "sleep_in_bed_min", "sleep_efficiency_pct",
  "sleep_score_vendor", "sleep_start_local", "sleep_end_local", "resp_rate_sleep", "spo2_night_avg", "spo2_night_min",
  "hrv_night", "resp_rate_day_avg", "skin_temp_delta_c", "vo2max", "fitness_age",
] as const satisfies readonly MetricCode[];

/** Tipos de resumo que registramos no portal. Os demais (bodyComps, mct, bloodPressures, pulseox, epochs, activityDetails, manuallyUpdatedActivities, moveiq, healthSnapshot) não são lidos. */
export const GARMIN_KINDS = ["dailies", "sleeps", "activities", "hrv", "respiration", "skinTemp", "stressDetails", "userMetrics", "deregistrations", "userPermissionsChange"] as const;
export type GarminKind = (typeof GARMIN_KINDS)[number];

const BASE = ["userId", "summaryId", "calendarDate", "startTimeInSeconds", "startTimeOffsetInSeconds", "durationInSeconds"] as const;

export const GARMIN_ALLOWED: Record<GarminKind, readonly string[]> = {
  dailies: [
    ...BASE,
    "steps",
    "pushes",
    "distanceInMeters",
    "pushDistanceInMeters",
    "activeKilocalories",
    "bmrKilocalories",
    "moderateIntensityDurationInSeconds",
    "vigorousIntensityDurationInSeconds",
    "intensityDurationGoalInSeconds",
    "floorsClimbed",
    "floorsDescended",
    "floorsClimbedGoal",
    "stepsGoal",
    "dailyStepGoal",
    "minHeartRateInBeatsPerMinute",
    "averageHeartRateInBeatsPerMinute",
    "maxHeartRateInBeatsPerMinute",
    "restingHeartRateInBeatsPerMinute",
    "averageStressLevel",
    "maxStressLevel",
    "restStressDurationInSeconds",
    "lowStressDurationInSeconds",
    "mediumStressDurationInSeconds",
    "highStressDurationInSeconds",
    "bodyBatteryChargedValue",
    "bodyBatteryDrainedValue",
    "bodyBatteryHighestValue",
    "bodyBatteryLowestValue",
    "bodyBatteryMostRecentValue",
  ],
  sleeps: [
    ...BASE,
    "deepSleepDurationInSeconds",
    "lightSleepDurationInSeconds",
    "remSleepInSeconds",
    "awakeDurationInSeconds",
    "validation",
    "timeOffsetSleepRespiration",
    "timeOffsetSleepSpo2",
    "overallSleepScore.value",
  ],
  activities: [
    ...BASE,
    "activityId",
    "activityType",
    "deviceName",
    "manual",
    "isWebUpload",
    "averageHeartRateInBeatsPerMinute",
    "maxHeartRateInBeatsPerMinute",
    "averageSpeedInMetersPerSecond",
    "activeKilocalories",
    "distanceInMeters",
    "totalElevationGainInMeters",
    "averageRunCadenceInStepsPerMinute",
    "averageBikeCadenceInRoundsPerMinute",
  ],
  hrv: [...BASE, "lastNightAvg"],
  respiration: [...BASE, "timeOffsetEpochToBreaths"],
  skinTemp: [...BASE, "avgDeviationCelsius"],
  stressDetails: [...BASE, "timeOffsetBodyBatteryValues"],
  userMetrics: [...BASE, "vo2Max", "fitnessAge"],
  deregistrations: ["userId"],
  userPermissionsChange: ["userId"],
};

export function isGarminKind(value: string): value is GarminKind {
  return (GARMIN_KINDS as readonly string[]).includes(value);
}

/** Treino lançado à mão/enviado pela web ou sono digitado/ajustado à mão (RN-20). */
export function isManualGarminItem(kind: GarminKind, r: Record<string, unknown>): boolean {
  if (kind === "activities") return r.manual === true || r.isWebUpload === true;
  if (kind === "sleeps") {
    const validation = typeof r.validation === "string" ? r.validation.toUpperCase() : "";
    return validation === "MANUAL" || validation === "AUTO_MANUAL";
  }
  return false;
}

export type GarminItem = { providerUserId: string; kind: GarminKind; eventId: string | null; payload: Record<string, unknown>; callbackURL: string | null };

/**
 * Divide um POST da Garmin ({ "dailies": [...], "sleeps": [...] }) em itens por pessoa e por
 * resumo. Tipos não registrados são ignorados sem ler o conteúdo. Ping: item com callbackURL.
 */
export function splitGarminBody(body: unknown): GarminItem[] {
  const items: GarminItem[] = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) return items;
  for (const [kind, list] of Object.entries(body as Record<string, unknown>)) {
    if (!isGarminKind(kind) || !Array.isArray(list)) continue;
    for (const raw of list.slice(0, 500)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const userId = str(r.userId, 128);
      if (!userId) continue;
      const callbackURL = str(r.callbackURL, 2000) ?? null;
      // digitado à mão ou enviado pela web nunca entra, nem no inbox bruto (RN-20; mesmos critérios do normalizador)
      if (!callbackURL && isManualGarminItem(kind, r)) continue;
      const summaryId = str(r.summaryId, 200) ?? null;
      items.push({ providerUserId: userId, kind, eventId: summaryId ? `${kind}:${summaryId}` : null, payload: callbackURL ? {} : pickAllowed(r, GARMIN_ALLOWED[kind]), callbackURL });
    }
  }
  return items;
}

function dateOf(p: Record<string, unknown>): string | undefined {
  const cal = p.calendarDate;
  if (isYmd(cal)) return cal;
  const start = num(p.startTimeInSeconds);
  if (start === undefined) return undefined;
  return localDateAt(start * 1000, (num(p.startTimeOffsetInSeconds) ?? 0) / 60);
}

/** Fim do período coberto pelo resumo: o "às HH:MM" que mostramos. */
function endIso(p: Record<string, unknown>): string | undefined {
  const start = num(p.startTimeInSeconds);
  if (start === undefined) return undefined;
  return isoAt((start + (num(p.durationInSeconds) ?? 0)) * 1000);
}

const minutes = (s: unknown) => {
  const v = num(s);
  return v === undefined ? undefined : round(v / 60);
};

function samples(map: unknown): { offset: number; value: number }[] {
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.entries(map as Record<string, unknown>)
    .map(([k, v]) => ({ offset: Number(k), value: num(v) }))
    .filter((s): s is { offset: number; value: number } => Number.isFinite(s.offset) && s.value !== undefined)
    .sort((a, b) => a.offset - b.offset);
}

/**
 * Normaliza UM resumo já reduzido à lista permitida. `kind` é o tipo do resumo da Garmin.
 * Deregistração e mudança de permissão não geram dado (a rota trata o estado da conexão).
 */
export function normalizeGarmin(kind: GarminKind, input: unknown): NormalizedBatch {
  const batch = emptyBatch("garmin", GARMIN_NORMALIZER_VERSION);
  // reaplica a lista permitida: o normalizador não confia em quem chamou
  const p = pickAllowed(input, GARMIN_ALLOWED[kind]);
  const date = dateOf(p);
  if (!date && kind !== "deregistrations" && kind !== "userPermissionsChange") return batch;
  const at = endIso(p);
  const daily = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
    if (value !== undefined) batch.daily.push({ date: date!, code, value, at, ...extra });
  };

  switch (kind) {
    case "dailies": {
      // Cadeira de rodas (§5.14): impulsos no lugar de passos quando o relógio os conta.
      daily("steps", num(p.steps));
      daily("wheelchair_pushes", num(p.pushes));
      daily("wheelchair_distance_m", num(p.pushDistanceInMeters));
      daily("distance_m", num(p.distanceInMeters));
      daily("active_kcal", num(p.activeKilocalories));
      daily("basal_kcal", num(p.bmrKilocalories));
      daily("intensity_min_moderate", minutes(p.moderateIntensityDurationInSeconds));
      daily("intensity_min_vigorous", minutes(p.vigorousIntensityDurationInSeconds));
      daily("intensity_goal_week_min", minutes(p.intensityDurationGoalInSeconds));
      daily("floors_climbed", num(p.floorsClimbed));
      daily("floors_descended", num(p.floorsDescended));
      daily("floors_goal", num(p.floorsClimbedGoal));
      daily("steps_goal", num(p.stepsGoal) ?? num(p.dailyStepGoal));
      daily("hr_min", num(p.minHeartRateInBeatsPerMinute));
      daily("hr_avg", num(p.averageHeartRateInBeatsPerMinute));
      daily("hr_max", num(p.maxHeartRateInBeatsPerMinute));
      daily("hr_resting", num(p.restingHeartRateInBeatsPerMinute));
      // estresse da Garmin: -1/-2 = sem leitura (sem zero fabricado)
      const stressAvg = num(p.averageStressLevel);
      daily("stress_avg", stressAvg !== undefined && stressAvg >= 0 ? stressAvg : undefined, { vendor: true, scale: "garmin_stress" });
      const stressMax = num(p.maxStressLevel);
      daily("stress_max", stressMax !== undefined && stressMax >= 0 ? stressMax : undefined, { vendor: true, scale: "garmin_stress" });
      daily("stress_rest_min", minutes(p.restStressDurationInSeconds));
      daily("stress_low_min", minutes(p.lowStressDurationInSeconds));
      daily("stress_medium_min", minutes(p.mediumStressDurationInSeconds));
      daily("stress_high_min", minutes(p.highStressDurationInSeconds));
      daily("body_battery_charged", num(p.bodyBatteryChargedValue), { vendor: true, scale: "garmin_body_battery" });
      daily("body_battery_drained", num(p.bodyBatteryDrainedValue), { vendor: true, scale: "garmin_body_battery" });
      daily("body_battery_high", num(p.bodyBatteryHighestValue), { vendor: true, scale: "garmin_body_battery" });
      daily("body_battery_low", num(p.bodyBatteryLowestValue), { vendor: true, scale: "garmin_body_battery" });
      daily("body_battery_now", num(p.bodyBatteryMostRecentValue), { vendor: true, scale: "garmin_body_battery" });
      break;
    }
    case "stressDetails": {
      // Body Battery com o horário da última amostra (mostrado "58 às 07:42", §5.7)
      const start = num(p.startTimeInSeconds);
      const bb = samples(p.timeOffsetBodyBatteryValues);
      if (start !== undefined && bb.length > 0) {
        const last = bb[bb.length - 1];
        const lastAt = isoAt((start + last.offset) * 1000);
        const values = bb.map((s) => s.value);
        daily("body_battery_now", last.value, { vendor: true, scale: "garmin_body_battery", at: lastAt, n: bb.length });
        daily("body_battery_high", Math.max(...values), { vendor: true, scale: "garmin_body_battery", at: lastAt });
        daily("body_battery_low", Math.min(...values), { vendor: true, scale: "garmin_body_battery", at: lastAt });
      }
      break;
    }
    case "sleeps": {
      // sono digitado ou ajustado à mão não entra (RN-20)
      if (isManualGarminItem("sleeps", p)) return batch;
      const start = num(p.startTimeInSeconds);
      const duration = num(p.durationInSeconds);
      if (start === undefined || duration === undefined || duration <= 0) return batch;
      const deep = minutes(p.deepSleepDurationInSeconds);
      const light = minutes(p.lightSleepDurationInSeconds);
      const rem = minutes(p.remSleepInSeconds);
      const awake = minutes(p.awakeDurationInSeconds);
      const asleep = [deep, light, rem].every((v) => v !== undefined) ? (deep ?? 0) + (light ?? 0) + (rem ?? 0) : undefined;
      const offsetMin = (num(p.startTimeOffsetInSeconds) ?? 0) / 60;
      const startMs = start * 1000;
      const endMs = (start + duration) * 1000;
      const score = num(get(p, "overallSleepScore.value"));
      const sleep: SleepInput = {
        ext: str(p.summaryId) ?? `sleep:${start}`,
        date: date!,
        start: isoAt(startMs),
        end: isoAt(endMs),
        tz: Math.round(offsetMin),
        main: true,
        nap: false,
        inBed: round(duration / 60),
        asleep,
        deep,
        light,
        rem,
        awake,
        eff: asleep !== undefined && awake !== undefined && asleep + awake > 0 ? round((asleep / (asleep + awake)) * 100) : undefined,
        score,
        scoreScale: score !== undefined ? "garmin_sleep_score" : undefined,
      };
      batch.sleep.push(sleep);
      const wake = isoAt(endMs);
      const nightly = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
        if (value !== undefined) batch.daily.push({ date: date!, code, value, at: wake, ...extra });
      };
      nightly("sleep_asleep_min", asleep);
      nightly("sleep_deep_min", deep);
      nightly("sleep_light_min", light);
      nightly("sleep_rem_min", rem);
      nightly("sleep_awake_min", awake);
      nightly("sleep_in_bed_min", sleep.inBed);
      nightly("sleep_efficiency_pct", sleep.eff);
      nightly("sleep_score_vendor", score, { vendor: true, scale: "garmin_sleep_score" });
      // horários em minutos desde o meio-dia local (mesma convenção do catálogo)
      const noonMinutes = (ms: number) => (((Math.round((ms / 60000 + offsetMin) % 1440) - 720) % 1440) + 1440) % 1440;
      nightly("sleep_start_local", noonMinutes(startMs));
      nightly("sleep_end_local", noonMinutes(endMs));
      // respiração e SpO₂ só DENTRO da sessão de sono (mínimo de 3 leituras); sob demanda é ignorado
      const resp = samples(p.timeOffsetSleepRespiration).map((s) => s.value);
      if (resp.length >= 3) nightly("resp_rate_sleep", round(mean(resp)!, 1), { n: resp.length });
      const spo2 = samples(p.timeOffsetSleepSpo2).map((s) => s.value);
      if (spo2.length >= 3) {
        nightly("spo2_night_avg", round(mean(spo2)!), { n: spo2.length });
        nightly("spo2_night_min", Math.min(...spo2), { n: spo2.length });
      }
      break;
    }
    case "activities": {
      // treino digitado ou enviado pela web (GPX de outro app) não entra (RN-20)
      if (isManualGarminItem("activities", p)) return batch;
      const start = num(p.startTimeInSeconds);
      const duration = num(p.durationInSeconds);
      if (start === undefined || duration === undefined || duration <= 0) return batch;
      const workout: WorkoutInput = {
        ext: str(p.summaryId) ?? String(num(p.activityId) ?? start),
        date: date!,
        sport: canonicalSport(p.activityType),
        origin: "started_on_device",
        start: isoAt(start * 1000),
        end: isoAt((start + duration) * 1000),
        dur: Math.round(duration),
        dist: num(p.distanceInMeters),
        kcal: num(p.activeKilocalories),
        avgHr: num(p.averageHeartRateInBeatsPerMinute),
        maxHr: num(p.maxHeartRateInBeatsPerMinute),
        speed: num(p.averageSpeedInMetersPerSecond),
        elev: num(p.totalElevationGainInMeters),
        cadence: num(p.averageRunCadenceInStepsPerMinute) ?? num(p.averageBikeCadenceInRoundsPerMinute),
      };
      batch.workouts.push(workout);
      const device = str(p.deviceName, 80);
      if (device) batch.device = device;
      break;
    }
    case "hrv":
      daily("hrv_night", num(p.lastNightAvg), { method: "rmssd" });
      break;
    case "respiration": {
      const breaths = samples(p.timeOffsetEpochToBreaths).map((s) => s.value);
      if (breaths.length >= 3) daily("resp_rate_day_avg", round(mean(breaths)!, 1), { n: breaths.length });
      break;
    }
    case "skinTemp":
      daily("skin_temp_delta_c", num(p.avgDeviationCelsius) !== undefined ? round(num(p.avgDeviationCelsius)!, 2) : undefined);
      break;
    case "userMetrics":
      daily("vo2max", num(p.vo2Max));
      daily("fitness_age", num(p.fitnessAge));
      break;
    case "deregistrations":
    case "userPermissionsChange":
      break;
  }
  return batch;
}
