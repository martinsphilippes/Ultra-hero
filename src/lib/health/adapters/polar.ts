// Adaptador Polar AccessLink v3 (https://www.polar.com/accesslink-api/). A notificação traz o
// evento (EXERCISE, SLEEP, ACTIVITY_SUMMARY…) e a URL do recurso; o servidor busca com o token
// da pessoa (só em www.polaraccesslink.com) e normaliza aqui. Puro.
// Lista permitida (RN-02b): nota do sono dada pela pessoa (sleep_rating), meta de sono,
// esforço percebido (RPE/perceived load), percentuais de macronutrientes, nome/clube e treinos
// sem aparelho (lançados à mão no Flow) NUNCA entram.

import type { MetricCode } from "@/lib/wearables/catalog";
import { emptyBatch, type DailyInput, type NormalizedBatch } from "../types";
import { canonicalSport, get, isYmd, isoDurationSeconds, isoOffset, localDateAt, num, pickAllowed, round, str } from "./common";

export const POLAR_NORMALIZER_VERSION = 1;

/** Códigos que este adaptador grava (tests/unit/health-adapters.test.ts confere com as fixtures). Define
 * as categorias oferecidas no consentimento e o que "Sobre seus dados" diz que a marca mede. */
export const POLAR_INGESTED_CODES = [
  "readiness_vendor", "hr_resting", "hrv_night", "resp_rate_sleep", "sleep_asleep_min", "sleep_deep_min", "sleep_light_min", "sleep_rem_min",
  "sleep_awake_min", "sleep_score_vendor", "sleep_start_local", "sleep_end_local", "steps", "active_kcal", "distance_m",
] as const satisfies readonly MetricCode[];

export const POLAR_KINDS = ["exercise", "sleep", "nightly_recharge", "activity"] as const;
export type PolarKind = (typeof POLAR_KINDS)[number];

export const POLAR_ALLOWED: Record<PolarKind, readonly string[]> = {
  exercise: [
    "id",
    "device",
    "start_time",
    "start_time_utc_offset",
    "duration",
    "calories",
    "distance",
    "heart_rate.average",
    "heart_rate.maximum",
    "sport",
    "detailed_sport_info",
    "heart_rate_zones",
  ],
  sleep: ["date", "sleep_start_time", "sleep_end_time", "light_sleep", "deep_sleep", "rem_sleep", "total_interruption_duration", "sleep_score"],
  nightly_recharge: ["date", "heart_rate_avg", "heart_rate_variability_avg", "breathing_rate_avg", "nightly_recharge_status", "ans_charge"],
  activity: ["start_time", "steps", "active_calories", "distance_from_steps"],
};

/** Eventos de notificação que tratamos (PING só confirma a inscrição). */
export const POLAR_EVENTS = ["EXERCISE", "SLEEP", "ACTIVITY_SUMMARY", "PING"] as const;

export function parsePolarNotification(body: unknown): { providerUserId: string; event: (typeof POLAR_EVENTS)[number]; entityId: string | null; date: string | null; url: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const event = str(b.event, 40);
  if (!event || !(POLAR_EVENTS as readonly string[]).includes(event)) return null;
  if (event === "PING") return { providerUserId: "", event: "PING", entityId: null, date: null, url: null };
  const userId = num(b.user_id) !== undefined ? String(num(b.user_id)) : str(b.user_id, 128);
  if (!userId) return null;
  return {
    providerUserId: userId,
    event: event as (typeof POLAR_EVENTS)[number],
    entityId: str(b.entity_id, 200) ?? null,
    date: isYmd(b.date) ? b.date : null,
    url: str(b.url, 2000) ?? null,
  };
}

/** Status 1–6 do Nightly Recharge com os rótulos originais da Polar [CP]. */
const RECHARGE_LABELS = ["", "very_poor", "poor", "compromised", "ok", "good", "very_good"] as const;

const sec2min = (v: unknown) => {
  const n = num(v);
  return n === undefined ? undefined : round(n / 60);
};

export function normalizePolar(kind: PolarKind, input: unknown): NormalizedBatch {
  const batch = emptyBatch("polar", POLAR_NORMALIZER_VERSION);
  const p = pickAllowed(input, POLAR_ALLOWED[kind]);

  if (kind === "nightly_recharge") {
    const date = isYmd(p.date) ? p.date : undefined;
    if (!date) return batch;
    const daily = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
      if (value !== undefined) batch.daily.push({ date, code, value, ...extra });
    };
    const status = num(p.nightly_recharge_status);
    if (status !== undefined && status >= 1 && status <= 6) {
      daily("readiness_vendor", status, { vendor: true, scale: "polar_nightly_recharge_status", label: RECHARGE_LABELS[status] });
    }
    // FC média da noite como FC de repouso da Polar [CP]; VFC em RMSSD (RN-09)
    daily("hr_resting", num(p.heart_rate_avg));
    daily("hrv_night", num(p.heart_rate_variability_avg), { method: "rmssd" });
    daily("resp_rate_sleep", num(p.breathing_rate_avg) !== undefined ? round(num(p.breathing_rate_avg)!, 1) : undefined);
    return batch;
  }

  if (kind === "sleep") {
    const date = isYmd(p.date) ? p.date : undefined;
    const start = str(p.sleep_start_time, 40);
    const end = str(p.sleep_end_time, 40);
    if (!date || !start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return batch;
    const light = sec2min(p.light_sleep);
    const deep = sec2min(p.deep_sleep);
    const rem = sec2min(p.rem_sleep);
    const awake = sec2min(p.total_interruption_duration);
    const asleep = light !== undefined && deep !== undefined && rem !== undefined ? light + deep + rem : undefined;
    const score = num(p.sleep_score);
    const wake = new Date(Date.parse(end)).toISOString();
    const offset = isoOffset(end);
    batch.sleep.push({
      ext: `sleep:${date}`,
      date,
      start: new Date(Date.parse(start)).toISOString(),
      end: wake,
      tz: offset ?? undefined,
      main: true,
      nap: false,
      asleep,
      deep,
      light,
      rem,
      awake,
      eff: asleep !== undefined && awake !== undefined && asleep + awake > 0 ? round((asleep / (asleep + awake)) * 100) : undefined,
      score: score !== undefined ? round(score) : undefined,
      scoreScale: score !== undefined ? "polar_sleep_score" : undefined,
    });
    const nightly = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
      if (value !== undefined) batch.daily.push({ date, code, value, at: wake, ...extra });
    };
    nightly("sleep_asleep_min", asleep);
    nightly("sleep_deep_min", deep);
    nightly("sleep_light_min", light);
    nightly("sleep_rem_min", rem);
    nightly("sleep_awake_min", awake);
    nightly("sleep_score_vendor", score !== undefined ? round(score) : undefined, { vendor: true, scale: "polar_sleep_score" });
    const off = offset ?? 0;
    const noon = (iso: string) => ((((Math.round(Date.parse(iso) / 60000 + off) % 1440) - 720) % 1440) + 1440) % 1440;
    nightly("sleep_start_local", noon(start));
    nightly("sleep_end_local", noon(end));
    return batch;
  }

  if (kind === "activity") {
    const start = str(p.start_time, 40);
    const date = start && /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : undefined;
    if (!date || !isYmd(date)) return batch;
    const daily = (code: DailyInput["code"], value: number | undefined) => {
      if (value !== undefined) batch.daily.push({ date, code, value });
    };
    daily("steps", num(p.steps));
    daily("active_kcal", num(p.active_calories));
    daily("distance_m", num(p.distance_from_steps));
    return batch;
  }

  // exercise: só treino gravado num aparelho Polar (lançamento manual no Flow vem sem `device`)
  const id = str(p.id, 200) ?? (num(p.id) !== undefined ? String(num(p.id)) : undefined);
  const device = str(p.device, 80);
  const startLocal = str(p.start_time, 40);
  const dur = isoDurationSeconds(p.duration);
  if (!id || !device || !startLocal || !dur) return batch;
  // start_time é hora LOCAL sem fuso; o deslocamento vem à parte (minutos)
  const offset = num(p.start_time_utc_offset) ?? 0;
  const localMs = Date.parse(`${startLocal.slice(0, 19)}Z`);
  if (Number.isNaN(localMs)) return batch;
  const startUtc = localMs - offset * 60_000;
  const zonesRaw = Array.isArray(p.heart_rate_zones) ? (p.heart_rate_zones as unknown[]) : [];
  const zoneSeconds = [1, 2, 3, 4, 5].map((index) => {
    const z = zonesRaw.find((x) => x && typeof x === "object" && num((x as Record<string, unknown>).index) === index) as Record<string, unknown> | undefined;
    return z ? isoDurationSeconds(z["in-zone"]) ?? 0 : undefined;
  });
  batch.device = device;
  batch.workouts.push({
    ext: id,
    date: localDateAt(startUtc, offset),
    sport: canonicalSport(p.detailed_sport_info ?? p.sport),
    origin: "started_on_device",
    start: new Date(startUtc).toISOString(),
    end: new Date(startUtc + dur * 1000).toISOString(),
    dur,
    dist: num(p.distance),
    kcal: num(p.calories),
    avgHr: num(get(p, "heart_rate.average")),
    maxHr: num(get(p, "heart_rate.maximum")),
    zones: zoneSeconds.every((z) => z !== undefined) ? (zoneSeconds as [number, number, number, number, number]) : undefined,
  });
  return batch;
}
