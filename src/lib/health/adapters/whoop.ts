// Adaptador WHOOP API v2 (https://developer.whoop.com/api). O webhook só avisa (type + id); o
// servidor busca o recurso com o token da pessoa. Recovery chega amarrado ao sono e ao ciclo:
// o buscador monta { recovery, sleep, cycle } e este adaptador normaliza o conjunto. Puro.
// Lista permitida (RN-02b): medidas corporais (peso, altura, FC máx. configurada — escopo
// read:body_measurement nunca é pedido), nome/e-mail do perfil e textos livres NUNCA entram.

import type { MetricCode } from "@/lib/wearables/catalog";
import { emptyBatch, type DailyInput, type NormalizeContext, type NormalizedBatch } from "../types";
import { canonicalSport, get, localDateAt, localDateInZone, num, parseOffset, pickAllowed, round, str } from "./common";

export const WHOOP_NORMALIZER_VERSION = 1;

/** Códigos que este adaptador grava (tests/unit/health-adapters.test.ts confere com as fixtures). Define
 * as categorias oferecidas no consentimento e o que "Sobre seus dados" diz que a marca mede. */
export const WHOOP_INGESTED_CODES = [
  "readiness_vendor", "hr_resting", "hrv_night", "spo2_night_avg", "skin_temp_c", "day_strain", "hr_avg", "hr_max",
  "sleep_asleep_min", "sleep_deep_min", "sleep_light_min", "sleep_rem_min", "sleep_awake_min", "sleep_in_bed_min", "sleep_efficiency_pct",
  "sleep_score_vendor", "resp_rate_sleep", "sleep_start_local", "sleep_end_local",
] as const satisfies readonly MetricCode[];

export const WHOOP_KINDS = ["recovery", "sleep", "workout"] as const;
export type WhoopKind = (typeof WHOOP_KINDS)[number];

const TIMING = ["id", "start", "end", "timezone_offset", "updated_at", "score_state"] as const;

export const WHOOP_ALLOWED = {
  recovery: ["cycle_id", "sleep_id", "created_at", "updated_at", "score_state", "score.recovery_score", "score.resting_heart_rate", "score.hrv_rmssd_milli", "score.spo2_percentage", "score.skin_temp_celsius"],
  cycle: [...TIMING, "score.strain", "score.average_heart_rate", "score.max_heart_rate"],
  sleep: [
    ...TIMING,
    "nap",
    "score.stage_summary.total_in_bed_time_milli",
    "score.stage_summary.total_awake_time_milli",
    "score.stage_summary.total_light_sleep_time_milli",
    "score.stage_summary.total_slow_wave_sleep_time_milli",
    "score.stage_summary.total_rem_sleep_time_milli",
    "score.respiratory_rate",
    "score.sleep_performance_percentage",
    "score.sleep_efficiency_percentage",
  ],
  workout: [
    ...TIMING,
    "sport_name",
    "score.strain",
    "score.average_heart_rate",
    "score.max_heart_rate",
    "score.kilojoule",
    "score.distance_meter",
    "score.altitude_gain_meter",
    "score.zone_durations.zone_one_milli",
    "score.zone_durations.zone_two_milli",
    "score.zone_durations.zone_three_milli",
    "score.zone_durations.zone_four_milli",
    "score.zone_durations.zone_five_milli",
  ],
  profile: ["user_id"],
} as const satisfies Record<string, readonly string[]>;

/** Corpo do webhook WHOOP v2: { user_id, id, type: "recovery.updated" | "sleep.deleted" | …, trace_id }. */
export function parseWhoopNotification(body: unknown): { providerUserId: string; kind: WhoopKind; objectId: string; deleted: boolean; traceId: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const userId = num(b.user_id) !== undefined ? String(num(b.user_id)) : str(b.user_id, 128);
  const type = str(b.type, 40);
  const id = num(b.id) !== undefined ? String(num(b.id)) : str(b.id, 200);
  if (!userId || !type || !id) return null;
  const m = /^(recovery|sleep|workout)\.(updated|deleted)$/.exec(type);
  if (!m) return null;
  return { providerUserId: userId, kind: m[1] as WhoopKind, objectId: id, deleted: m[2] === "deleted", traceId: str(b.trace_id, 200) ?? null };
}

/** Dia local do fim (sono → dia em que acorda, RN-05), no deslocamento da própria amostra. */
function localEndDate(p: Record<string, unknown>, tzFallback: string): string | undefined {
  const end = str(p.end, 40);
  const t = end ? Date.parse(end) : Number.NaN;
  if (Number.isNaN(t)) return undefined;
  const offset = parseOffset(p.timezone_offset);
  return offset === null ? localDateInZone(t, tzFallback) : localDateAt(t, offset);
}

/**
 * Dia de um ciclo WHOOP: o ciclo começa quando a pessoa adormece, então ele pertence ao dia em que
 * ela ACORDA desse sono. Sem o sono em mãos, início + 12 h cai nesse dia para quem dorme à noite
 * [CP: quem dorme de dia pode cair no dia seguinte]. Nunca pelo `end` (início do sono seguinte).
 */
export function whoopCycleDate(c: Record<string, unknown>, tzFallback: string): string | undefined {
  const start = str(c.start, 40);
  const t = start ? Date.parse(start) : Number.NaN;
  if (Number.isNaN(t)) return undefined;
  const shifted = t + 12 * 3600_000;
  const offset = parseOffset(c.timezone_offset);
  return offset === null ? localDateInZone(shifted, tzFallback) : localDateAt(shifted, offset);
}

/**
 * Strain do dia e FC média/máxima do ciclo. Ciclo em andamento (sem `end`): o valor até agora, com o
 * horário da atualização da WHOOP; o tique e os treinos o atualizam e o valor final do dia anterior
 * entra na manhã seguinte (pipeline). Puro.
 */
export function normalizeWhoopCycle(input: unknown, ctx: NormalizeContext): NormalizedBatch {
  const batch = emptyBatch("whoop", WHOOP_NORMALIZER_VERSION);
  const c = pickAllowed(input, WHOOP_ALLOWED.cycle);
  const id = str(c.id, 200) ?? (num(c.id) !== undefined ? String(num(c.id)) : undefined);
  const date = whoopCycleDate(c, ctx.tzFallback);
  if (!id || !date || c.score_state !== "SCORED") return batch;
  const updated = str(c.updated_at, 40);
  const open = !str(c.end, 40);
  const at = open && updated && !Number.isNaN(Date.parse(updated)) ? new Date(Date.parse(updated)).toISOString() : undefined;
  const ref = `cycle:${id}`;
  const push = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
    if (value !== undefined) batch.daily.push({ date, code, value, at, updated, ref, ...extra });
  };
  const strain = num(get(c, "score.strain"));
  push("day_strain", strain !== undefined ? round(strain, 1) : undefined, { vendor: true, scale: "whoop_strain" });
  push("hr_avg", num(get(c, "score.average_heart_rate")));
  push("hr_max", num(get(c, "score.max_heart_rate")));
  return batch;
}

const ms2min = (v: unknown) => {
  const n = num(v);
  return n === undefined ? undefined : round(n / 60000);
};

type RecoveryBundle = { recovery?: unknown; sleep?: unknown; cycle?: unknown };

export function normalizeWhoop(kind: WhoopKind, input: unknown, ctx: NormalizeContext, deleted = false, objectId?: string): NormalizedBatch {
  const batch = emptyBatch("whoop", WHOOP_NORMALIZER_VERSION);
  if (deleted) {
    if (objectId && kind === "sleep") batch.deletions.push({ kind: "sleep", ext: objectId });
    if (objectId && kind === "workout") batch.deletions.push({ kind: "workout", ext: objectId });
    // recovery apagado: o id é o do sono a que ele pertence; saem readiness, FC de repouso, VFC…
    if (objectId && kind === "recovery") batch.deletions.push({ kind: "metrics", ext: `recovery:${objectId}` });
    return batch;
  }

  if (kind === "recovery") {
    const bundle = (input ?? {}) as RecoveryBundle;
    const r = pickAllowed(bundle.recovery, WHOOP_ALLOWED.recovery);
    const s = pickAllowed(bundle.sleep, WHOOP_ALLOWED.sleep);
    const c = pickAllowed(bundle.cycle, WHOOP_ALLOWED.cycle);
    // recovery ainda sendo calculado (ou pessoa calibrando) não vira número. Dia: o do acordar (sono,
    // quando há read:sleep); senão o do ciclo; senão o dia em que a WHOOP criou o recovery (no acordar).
    const created = str(r.created_at, 40);
    const date =
      localEndDate(s, ctx.tzFallback) ??
      (Object.keys(c).length > 0 ? whoopCycleDate(c, ctx.tzFallback) : undefined) ??
      (created && !Number.isNaN(Date.parse(created)) ? localDateInZone(Date.parse(created), ctx.tzFallback) : undefined);
    const updated = str(r.updated_at, 40);
    const at = str(s.end, 40) ? new Date(Date.parse(String(s.end))).toISOString() : undefined;
    const sleepId = str(r.sleep_id, 200) ?? str(s.id, 200);
    const ref = sleepId ? `recovery:${sleepId}` : undefined;
    const daily = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
      if (date && value !== undefined) batch.daily.push({ date, code, value, at, updated, ref, ...extra });
    };
    if (r.score_state === "SCORED") {
      daily("readiness_vendor", num(get(r, "score.recovery_score")), { vendor: true, scale: "whoop_recovery_pct" });
      daily("hr_resting", num(get(r, "score.resting_heart_rate")));
      daily("hrv_night", num(get(r, "score.hrv_rmssd_milli")) !== undefined ? round(num(get(r, "score.hrv_rmssd_milli"))!, 1) : undefined, { method: "rmssd" });
      daily("spo2_night_avg", num(get(r, "score.spo2_percentage")) !== undefined ? round(num(get(r, "score.spo2_percentage"))!, 1) : undefined);
      // WHOOP manda temperatura ABSOLUTA da pele: o desvio sai da linha de base (§5.8)
      daily("skin_temp_c", num(get(r, "score.skin_temp_celsius")) !== undefined ? round(num(get(r, "score.skin_temp_celsius"))!, 2) : undefined);
    }
    if (bundle.cycle) batch.daily.push(...normalizeWhoopCycle(bundle.cycle, ctx).daily);
    return batch;
  }

  if (kind === "sleep") {
    const s = pickAllowed(input, WHOOP_ALLOWED.sleep);
    const id = str(s.id, 200) ?? (num(s.id) !== undefined ? String(num(s.id)) : undefined);
    const start = str(s.start, 40);
    const end = str(s.end, 40);
    const date = localEndDate(s, ctx.tzFallback);
    if (!id || !start || !end || !date || s.score_state !== "SCORED") return batch;
    const light = ms2min(get(s, "score.stage_summary.total_light_sleep_time_milli"));
    const deep = ms2min(get(s, "score.stage_summary.total_slow_wave_sleep_time_milli"));
    const rem = ms2min(get(s, "score.stage_summary.total_rem_sleep_time_milli"));
    const awake = ms2min(get(s, "score.stage_summary.total_awake_time_milli"));
    const asleep = light !== undefined && deep !== undefined && rem !== undefined ? light + deep + rem : undefined;
    const nap = s.nap === true;
    const score = num(get(s, "score.sleep_performance_percentage"));
    const updated = str(s.updated_at, 40);
    const wake = new Date(Date.parse(end)).toISOString();
    const offset = parseOffset(s.timezone_offset);
    batch.sleep.push({
      ext: id,
      date,
      start: new Date(Date.parse(start)).toISOString(),
      end: wake,
      tz: offset ?? undefined,
      main: !nap,
      nap,
      inBed: ms2min(get(s, "score.stage_summary.total_in_bed_time_milli")),
      asleep,
      deep,
      light,
      rem,
      awake,
      eff: num(get(s, "score.sleep_efficiency_percentage")) !== undefined ? round(num(get(s, "score.sleep_efficiency_percentage"))!) : undefined,
      score: score !== undefined ? round(score) : undefined,
      scoreScale: score !== undefined ? "whoop_sleep_performance_pct" : undefined,
      updated,
    });
    if (nap) return batch;
    const nightly = (code: DailyInput["code"], value: number | undefined, extra: Partial<DailyInput> = {}) => {
      if (value !== undefined) batch.daily.push({ date, code, value, at: wake, updated, ref: `sleep:${id}`, ...extra });
    };
    nightly("sleep_asleep_min", asleep);
    nightly("sleep_deep_min", deep);
    nightly("sleep_light_min", light);
    nightly("sleep_rem_min", rem);
    nightly("sleep_awake_min", awake);
    nightly("sleep_in_bed_min", ms2min(get(s, "score.stage_summary.total_in_bed_time_milli")));
    nightly("sleep_efficiency_pct", num(get(s, "score.sleep_efficiency_percentage")) !== undefined ? round(num(get(s, "score.sleep_efficiency_percentage"))!) : undefined);
    nightly("sleep_score_vendor", score !== undefined ? round(score) : undefined, { vendor: true, scale: "whoop_sleep_performance_pct" });
    nightly("resp_rate_sleep", num(get(s, "score.respiratory_rate")) !== undefined ? round(num(get(s, "score.respiratory_rate"))!, 1) : undefined);
    const off = offset ?? 0;
    const noon = (iso: string) => ((((Math.round(Date.parse(iso) / 60000 + off) % 1440) - 720) % 1440) + 1440) % 1440;
    nightly("sleep_start_local", noon(start));
    nightly("sleep_end_local", noon(end));
    return batch;
  }

  // workout: detectado pela pulseira ou iniciado nela [NC: a API não distingue atividade adicionada à mão]
  const w = pickAllowed(input, WHOOP_ALLOWED.workout);
  const id = str(w.id, 200) ?? (num(w.id) !== undefined ? String(num(w.id)) : undefined);
  const start = str(w.start, 40);
  const end = str(w.end, 40);
  const date = (() => {
    if (!start) return undefined;
    const t = Date.parse(start);
    const offset = parseOffset(w.timezone_offset);
    return Number.isNaN(t) ? undefined : offset === null ? localDateInZone(t, ctx.tzFallback) : localDateAt(t, offset);
  })();
  if (!id || !start || !end || !date || w.score_state !== "SCORED") return batch;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!(e > s)) return batch;
  const zone = (k: string) => {
    const v = num(get(w, `score.zone_durations.${k}`));
    return v === undefined ? undefined : Math.round(v / 1000);
  };
  const zones = ["zone_one_milli", "zone_two_milli", "zone_three_milli", "zone_four_milli", "zone_five_milli"].map(zone);
  const kj = num(get(w, "score.kilojoule"));
  batch.workouts.push({
    ext: id,
    date,
    sport: canonicalSport(w.sport_name),
    origin: "auto_detected",
    start: new Date(s).toISOString(),
    end: new Date(e).toISOString(),
    dur: Math.round((e - s) / 1000),
    dist: num(get(w, "score.distance_meter")),
    kcal: kj !== undefined ? Math.round(kj / 4.184) : undefined,
    avgHr: num(get(w, "score.average_heart_rate")),
    maxHr: num(get(w, "score.max_heart_rate")),
    zones: zones.every((z) => z !== undefined) ? (zones as [number, number, number, number, number]) : undefined,
    elev: num(get(w, "score.altitude_gain_meter")),
    effort: num(get(w, "score.strain")) !== undefined ? round(num(get(w, "score.strain"))!, 1) : undefined,
    effortScale: num(get(w, "score.strain")) !== undefined ? "whoop_strain" : undefined,
    updated: str(w.updated_at, 40),
  });
  return batch;
}
