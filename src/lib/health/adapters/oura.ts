// Adaptador Oura API v2 (https://cloud.ouraring.com/v2/docs). O webhook só avisa (data_type +
// object_id); o servidor busca o documento com o token da pessoa e normaliza aqui. Puro.
// Lista permitida por tipo (RN-02b): tags e anotações (enhanced_tag, tag), rótulos digitados
// (label), dados pessoais (peso, altura, idade) e treinos com source = "manual" NUNCA entram.

import { emptyBatch, type DailyInput, type NormalizeContext, type NormalizedBatch } from "../types";
import { canonicalSport, get, isoOffset, isYmd, num, pickAllowed, round, str } from "./common";

export const OURA_NORMALIZER_VERSION = 1;

/** Tipos inscritos no webhook (data_type). heartrate/session/tag/enhanced_tag/rest_mode_period não. */
export const OURA_KINDS = ["daily_readiness", "daily_sleep", "sleep", "daily_activity", "daily_spo2", "daily_stress", "workout"] as const;
export type OuraKind = (typeof OURA_KINDS)[number];

export const OURA_ALLOWED: Record<OuraKind, readonly string[]> = {
  daily_readiness: ["id", "day", "score", "temperature_deviation", "timestamp"],
  daily_sleep: ["id", "day", "score", "timestamp"],
  sleep: [
    "id",
    "day",
    "type",
    "bedtime_start",
    "bedtime_end",
    "total_sleep_duration",
    "deep_sleep_duration",
    "light_sleep_duration",
    "rem_sleep_duration",
    "awake_time",
    "time_in_bed",
    "latency",
    "efficiency",
    "lowest_heart_rate",
    "average_hrv",
    "average_breath",
  ],
  daily_activity: ["id", "day", "steps", "active_calories", "equivalent_walking_distance", "medium_activity_time", "high_activity_time", "sedentary_time", "timestamp"],
  daily_spo2: ["id", "day", "spo2_percentage.average"],
  daily_stress: ["id", "day", "stress_high", "recovery_high"],
  workout: ["id", "day", "activity", "calories", "distance", "start_datetime", "end_datetime", "source"],
};

export function isOuraKind(value: string): value is OuraKind {
  return (OURA_KINDS as readonly string[]).includes(value);
}

/** Corpo do webhook da Oura: { event_type, data_type, object_id, user_id, event_time }. */
export function parseOuraNotification(body: unknown): { providerUserId: string; kind: OuraKind; objectId: string; eventType: "create" | "update" | "delete"; eventTime: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const userId = str(b.user_id, 128);
  const kind = str(b.data_type, 40);
  const objectId = str(b.object_id, 200);
  const eventType = b.event_type;
  if (!userId || !kind || !objectId || !isOuraKind(kind)) return null;
  if (eventType !== "create" && eventType !== "update" && eventType !== "delete") return null;
  return { providerUserId: userId, kind, objectId, eventType, eventTime: str(b.event_time, 40) ?? null };
}

const minutes = (s: unknown) => {
  const v = num(s);
  return v === undefined ? undefined : round(v / 60);
};

export function normalizeOura(kind: OuraKind, input: unknown, _ctx: NormalizeContext, deleted = false): NormalizedBatch {
  const batch = emptyBatch("oura", OURA_NORMALIZER_VERSION);
  const p = pickAllowed(input, OURA_ALLOWED[kind]);
  const day = isYmd(p.day) ? p.day : undefined;
  const id = str(p.id);
  if (deleted && id) {
    if (kind === "sleep") batch.deletions.push({ kind: "sleep", ext: id });
    if (kind === "workout") batch.deletions.push({ kind: "workout", ext: id });
    return batch;
  }
  if (!day) return batch;
  const at = str(p.timestamp, 40);
  const daily = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
    if (value !== undefined) batch.daily.push({ date: day, code, value, at, ...extra });
  };

  switch (kind) {
    case "daily_readiness":
      // Readiness Oura: escala original 0–100, nunca normalizada (RN-08)
      daily("readiness_vendor", num(p.score), { vendor: true, scale: "oura_readiness" });
      daily("skin_temp_delta_c", num(p.temperature_deviation) !== undefined ? round(num(p.temperature_deviation)!, 2) : undefined);
      break;
    case "daily_sleep":
      daily("sleep_score_vendor", num(p.score), { vendor: true, scale: "oura_sleep_score" });
      break;
    case "sleep": {
      const type = str(p.type, 20);
      if (type === "deleted") {
        if (id) batch.deletions.push({ kind: "sleep", ext: id });
        return batch;
      }
      const start = str(p.bedtime_start, 40);
      const end = str(p.bedtime_end, 40);
      if (!id || !start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return batch;
      // long_sleep = noite principal; late_nap/rest/sleep curto = cochilo (§5.5)
      const main = type === "long_sleep";
      const asleep = minutes(p.total_sleep_duration);
      const wake = new Date(Date.parse(end)).toISOString();
      batch.sleep.push({
        ext: id,
        date: day,
        start: new Date(Date.parse(start)).toISOString(),
        end: wake,
        tz: isoOffset(end) ?? undefined,
        main,
        nap: !main,
        inBed: minutes(p.time_in_bed),
        asleep,
        deep: minutes(p.deep_sleep_duration),
        light: minutes(p.light_sleep_duration),
        rem: minutes(p.rem_sleep_duration),
        awake: minutes(p.awake_time),
        latency: minutes(p.latency),
        eff: num(p.efficiency),
        lowestHr: num(p.lowest_heart_rate),
      });
      if (!main) {
        // cochilos não viram métricas da noite
        return batch;
      }
      const nightly = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
        if (value !== undefined) batch.daily.push({ date: day, code, value, at: wake, ...extra });
      };
      nightly("sleep_asleep_min", asleep);
      nightly("sleep_deep_min", minutes(p.deep_sleep_duration));
      nightly("sleep_light_min", minutes(p.light_sleep_duration));
      nightly("sleep_rem_min", minutes(p.rem_sleep_duration));
      nightly("sleep_awake_min", minutes(p.awake_time));
      nightly("sleep_in_bed_min", minutes(p.time_in_bed));
      nightly("sleep_efficiency_pct", num(p.efficiency));
      nightly("sleep_hr_lowest", num(p.lowest_heart_rate));
      // FC de repouso da Oura ≈ menor FC do sono [CP]; VFC em RMSSD (RN-09)
      nightly("hr_resting", num(p.lowest_heart_rate));
      nightly("hrv_night", num(p.average_hrv), { method: "rmssd" });
      nightly("resp_rate_sleep", num(p.average_breath) !== undefined ? round(num(p.average_breath)!, 1) : undefined);
      const offset = isoOffset(start) ?? 0;
      const noon = (iso: string) => ((((Math.round(Date.parse(iso) / 60000 + offset) % 1440) - 720) % 1440) + 1440) % 1440;
      nightly("sleep_start_local", noon(start));
      nightly("sleep_end_local", noon(end));
      break;
    }
    case "daily_activity":
      daily("steps", num(p.steps));
      daily("active_kcal", num(p.active_calories));
      daily("distance_m", num(p.equivalent_walking_distance));
      daily("intensity_min_moderate", minutes(p.medium_activity_time));
      daily("intensity_min_vigorous", minutes(p.high_activity_time));
      daily("sedentary_min", minutes(p.sedentary_time));
      break;
    case "daily_spo2":
      daily("spo2_night_avg", num(get(p, "spo2_percentage.average")) !== undefined ? round(num(get(p, "spo2_percentage.average"))!, 1) : undefined);
      break;
    case "daily_stress":
      daily("stress_high_min", minutes(p.stress_high));
      daily("recovery_high_min", minutes(p.recovery_high));
      break;
    case "workout": {
      // treino registrado à mão no app Oura não entra (RN-20)
      const source = str(p.source, 40);
      if (!id || source === "manual") return batch;
      const start = str(p.start_datetime, 40);
      const end = str(p.end_datetime, 40);
      if (!start || !end) return batch;
      const s = Date.parse(start);
      const e = Date.parse(end);
      if (!(e > s)) return batch;
      batch.workouts.push({
        ext: id,
        date: day,
        sport: canonicalSport(p.activity),
        // detectado pelo anel (e só confirmado na tela) ou iniciado com FC no app
        origin: source === "workout_heart_rate" ? "started_on_device" : "auto_detected",
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        dur: Math.round((e - s) / 1000),
        dist: num(p.distance),
        kcal: num(p.calories),
      });
      break;
    }
  }
  return batch;
}
