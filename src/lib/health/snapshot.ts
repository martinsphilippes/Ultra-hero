// Hoje com relógio REAL: monta o mesmo WatchSnapshot do relógio simulado a partir do que a RPC
// my_health_today devolve (schema health), para que os cards e detalhes sejam exatamente os
// mesmos. Métrica não medida fica escondida (RN-04); horário e fonte reais; uma fonte por métrica
// e dia (§9.6); índices nossos calculados com as MESMAS funções de derived.ts. Puro.

import { NIGHT_VITALS_COMPONENTS, isMetricCode, metricDef, modelMeasures, type MetricCode, type WatchModelId } from "@/lib/wearables/catalog";
import { localNow } from "@/lib/wearables/context";
import { dayIndexOf, ymdOf, type DemoWorkout, type HistoryDay, type MetricPoint, type Sport, type WatchSnapshot } from "@/lib/wearables/demo";
import { baseline, disposition, edwardsTrimp, median, nightVitals, sleepRegularity, trainingLoad, type Baseline } from "@/lib/wearables/derived";
import { dedupWorkouts, resolveDaily, type RpcDaily, type RpcWorkout } from "./dedup";
import { PROVIDERS } from "./providers";
import type { HealthProvider } from "./types";

export type RpcConnection = {
  id: string;
  provider: HealthProvider;
  status: string;
  device_name: string | null;
  connected_at: string;
  last_data_at: string | null;
  last_sync_at: string | null;
  last_error_code: string | null;
};

export type RpcToday = { connections: RpcConnection[]; daily: RpcDaily[]; sleep: unknown[]; workouts: RpcWorkout[] };

export type RealWatchView =
  | { kind: "none" }
  | { kind: "syncing"; provider: HealthProvider; deviceName: string; connectedAt: string }
  | { kind: "real"; provider: HealthProvider; snapshot: WatchSnapshot; lastSync: { date: string; at: number } | null; stale: boolean };

/** Conexões cujos dados aparecem (pausada ou desautorizada na marca: os dados antigos continuam visíveis). */
const VISIBLE = new Set(["active", "token_expired", "consent_outdated", "revoked_by_provider", "pending"]);

export const BRAND_NAMES: Record<HealthProvider, string> = { garmin: "Garmin", oura: "Oura", whoop: "WHOOP", polar: "Polar" };

const HISTORY = 30;
const NIGHT_EXTRA: readonly string[] = ["readiness_vendor", "disposition_uh", "night_vitals_uh", "sleep_regularity"];
const STALE_MS = 6 * 3600_000;

function isNightCode(code: string): boolean {
  const def = metricDef(code);
  if (!def) return false;
  return def.section === "sleep" || def.section === "vitals" || NIGHT_EXTRA.includes(code);
}

/** O que acumula ao longo do dia: hoje é parcial e não tem como comparar com o mesmo horário. */
function isCumulative(code: string): boolean {
  const def = metricDef(code);
  return !!def && (def.agg === "sum" || def.agg === "week" || code === "cardio_load_day_uh" || code === "intensity_min_weighted") && !isNightCode(code);
}

const MIN_SPREAD: Partial<Record<MetricCode, number>> = {
  hr_resting: 1,
  hrv_night: 2,
  resp_rate_sleep: 0.3,
  spo2_night_avg: 0.5,
  skin_temp_delta_c: 0.1,
  sleep_asleep_min: 15,
  stress_avg: 2,
  body_battery_high: 3,
  disposition_uh: 3,
  readiness_vendor: 3,
};

const SPORTS = new Set<string>(["run", "trail_run", "walk", "cycle", "strength", "swim", "hike", "yoga", "row", "other"]);

function minutesIn(iso: string | null | undefined, timeZone: string): { date: string; at: number } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const { date, minutes } = localNow(timeZone, new Date(t));
  return { date, at: minutes };
}

/**
 * Visão real do Hoje. `today`/`nowMin` vêm do fuso do perfil. Sem conexão visível → "none";
 * conexão sem nenhum dado ainda → "syncing" ("os primeiros dados chegam quando o relógio sincronizar").
 */
export function buildRealView(input: { data: RpcToday; today: string; nowMin: number; timeZone: string; now?: Date }): RealWatchView {
  const conns = (input.data.connections ?? []).filter((c) => VISIBLE.has(c.status));
  if (conns.length === 0) return { kind: "none" };
  const visibleIds = new Set(conns.map((c) => c.id));
  const daily = (input.data.daily ?? []).filter((r) => visibleIds.has(r.conn) && isMetricCode(r.c));
  const workoutsAll = (input.data.workouts ?? []).filter((w) => visibleIds.has(w.conn));
  // fonte principal: a que mandou dado mais recentemente (senão, a mais antiga conectada)
  const primary = [...conns].sort((a, b) => (b.last_data_at ?? "").localeCompare(a.last_data_at ?? "") || a.connected_at.localeCompare(b.connected_at))[0];
  const deviceName = primary.device_name || BRAND_NAMES[primary.provider];
  if (daily.length === 0 && workoutsAll.length === 0) {
    return { kind: "syncing", provider: primary.provider, deviceName, connectedAt: primary.connected_at };
  }

  const model: WatchModelId = PROVIDERS[primary.provider].model;
  const resolved = resolveDaily(daily);
  const todayIndex = dayIndexOf(input.today);
  const firstIndex = todayIndex - (HISTORY + 29);

  // workouts por dia, sem duplicar a mesma sessão vinda de duas fontes
  const workouts = dedupWorkouts(workoutsAll);
  const workoutsByDay = new Map<string, RpcWorkout[]>();
  for (const w of workouts) workoutsByDay.set(w.d, [...(workoutsByDay.get(w.d) ?? []), w]);

  // valores por dia (dias anteriores inteiros; hoje parcial)
  const series: HistoryDay[] = [];
  const points = new Map<string, Map<string, RpcDaily>>();
  for (let i = firstIndex; i <= todayIndex; i++) {
    const date = ymdOf(i);
    const rows = resolved.get(date) ?? new Map<string, RpcDaily>();
    points.set(date, rows);
    const values: Partial<Record<MetricCode, number>> = {};
    for (const [code, row] of rows) values[code as MetricCode] = row.v;
    const ws = workoutsByDay.get(date) ?? [];
    if (ws.length > 0) {
      values.workout_count = ws.length;
      values.workout_min = Math.round(ws.reduce((s, w) => s + w.dur, 0) / 60);
      const kcal = ws.filter((w) => w.kcal !== null).reduce((s, w) => s + (w.kcal ?? 0), 0);
      if (ws.some((w) => w.kcal !== null)) values.workout_kcal = Math.round(kcal);
      if (ws.some((w) => w.dist !== null)) values.workout_distance_m = Math.round(ws.reduce((s, w) => s + (w.dist ?? 0), 0));
      const foot = ws.find((w) => (w.sport === "run" || w.sport === "trail_run" || w.sport === "walk" || w.sport === "hike") && w.dist && w.dist > 0);
      if (foot && foot.dist) values.workout_pace_s_per_km = Math.round(foot.dur / (foot.dist / 1000));
      const withZones = ws.filter((w) => Array.isArray(w.zones) && w.zones.length === 5);
      if (withZones.length > 0) {
        const zoneMin = [0, 1, 2, 3, 4].map((k) => withZones.reduce((s, w) => s + (w.zones![k] ?? 0), 0) / 60);
        zoneMin.forEach((m, k) => (values[`hr_zone${k + 1}_min` as MetricCode] = Math.round(m)));
        values.cardio_load_day_uh = edwardsTrimp(zoneMin);
      }
    }
    if (values.intensity_min_weighted === undefined && typeof values.intensity_min_moderate === "number" && typeof values.intensity_min_vigorous === "number" && !modelMeasures(model, "intensity_min_week")) {
      values.intensity_min_weighted = values.intensity_min_moderate + 2 * values.intensity_min_vigorous;
    }
    series.push({ date, partial: i === todayIndex, values });
  }

  // minutos de intensidade da semana (segunda a hoje), quando a marca não manda o total pronto
  for (let i = 0; i < series.length; i++) {
    const v = series[i].values;
    if (v.intensity_min_week !== undefined || (v.intensity_min_moderate === undefined && v.intensity_min_vigorous === undefined)) continue;
    if (!modelMeasures(model, "intensity_min_week")) continue;
    let total = 0;
    for (let k = i; k >= 0; k--) {
      const d = series[k];
      total += (d.values.intensity_min_moderate ?? 0) + 2 * (d.values.intensity_min_vigorous ?? 0);
      if (new Date(dayIndexOf(d.date) * 86_400_000).getUTCDay() === 1) break;
    }
    v.intensity_min_week = total;
  }

  // WHOOP manda temperatura absoluta: o desvio é a diferença para a mediana dos 28 dias anteriores
  for (let i = 0; i < series.length; i++) {
    const v = series[i].values;
    if (v.skin_temp_delta_c !== undefined || v.skin_temp_c === undefined) continue;
    const prior = series.slice(Math.max(0, i - 28), i).map((d) => d.values.skin_temp_c).filter((x): x is number => typeof x === "number");
    if (prior.length >= 7) v.skin_temp_delta_c = Math.round((v.skin_temp_c - median(prior)) * 100) / 100;
  }

  // índices nossos, dia a dia, com as mesmas funções do relógio simulado
  const loads: number[] = [];
  const midpoints: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i].values;
    loads.push(v.cardio_load_day_uh ?? 0);
    const tl = trainingLoad(loads);
    if (loads.some((l) => l > 0)) {
      v.training_load_acute_7d = tl.acute;
      v.training_load_chronic_28d = tl.chronic;
      if (tl.ratio !== null) v.load_ratio = tl.ratio;
    }
    if (typeof v.sleep_start_local === "number" && typeof v.sleep_asleep_min === "number") {
      midpoints.push(v.sleep_start_local + (v.sleep_asleep_min + (v.sleep_awake_min ?? 0)) / 2);
      const reg = sleepRegularity(midpoints);
      if (reg !== null) v.sleep_regularity = reg;
    }
    const prior = series.slice(Math.max(0, i - 28), i).map((d) => d.values);
    const hist = (code: MetricCode) => prior.map((p) => p[code] ?? null);
    const disp = modelMeasures(model, "disposition_uh")
      ? disposition({
          hrvNight: v.hrv_night,
          hrvHistory: hist("hrv_night"),
          restingHr: v.hr_resting,
          restingHrHistory: hist("hr_resting"),
          asleepMin: v.sleep_asleep_min,
          asleepHistory: hist("sleep_asleep_min"),
          efficiencyPct: v.sleep_efficiency_pct,
          efficiencyHistory: hist("sleep_efficiency_pct"),
          loadRatio: v.load_ratio,
          tempDelta: v.skin_temp_delta_c,
        })
      : null;
    if (disp) v.disposition_uh = disp.score;
    const vitals = nightVitals(NIGHT_VITALS_COMPONENTS.map((code) => ({ code, value: v[code], history: hist(code), minSpread: MIN_SPREAD[code] })));
    if (vitals && vitals.total > 0) v.night_vitals_uh = vitals.within;
  }

  // a noite mostrada: a mais recente até hoje (pertence ao dia em que a pessoa acorda)
  let nightIdx = -1;
  for (let i = series.length - 1; i >= Math.max(0, series.length - 3); i--) {
    if (typeof series[i].values.sleep_asleep_min === "number" || typeof series[i].values.readiness_vendor === "number") {
      nightIdx = i;
      break;
    }
  }
  const todayIdx = series.length - 1;
  const nightIsToday = nightIdx === todayIdx;
  const nightDate = nightIdx >= 0 ? series[nightIdx].date : input.today;

  // última sincronização (no fuso do perfil)
  const lastSyncIso = conns.map((c) => c.last_sync_at).filter((x): x is string => !!x).sort().pop() ?? null;
  const lastSync = minutesIn(lastSyncIso, input.timeZone);
  const syncedAt = lastSync && lastSync.date === input.today ? lastSync.at : Math.max(0, Math.min(1439, input.nowMin));
  const nowMs = (input.now ?? new Date()).getTime();
  const stale = !lastSyncIso || nowMs - Date.parse(lastSyncIso) > STALE_MS;

  const pointOf = (code: MetricCode, idx: number, fallbackAt: number): MetricPoint | null => {
    const day = series[idx];
    const value = day?.values[code];
    if (typeof value !== "number") return null;
    const row = points.get(day.date)?.get(code);
    const when = minutesIn(row?.at, input.timeZone);
    const at = when && when.date === day.date ? when.at : fallbackAt;
    return {
      code,
      value,
      date: day.date,
      at,
      ...(row?.n ? { sampleCount: row.n } : {}),
      ...(code === "hrv_night" && (row?.m === "rmssd" || row?.m === "sdnn") ? { method: row.m } : {}),
      ...(row?.s ? { scale: row.s } : {}),
      ...(row?.l ? { label: row.l } : {}),
    };
  };

  const values: Partial<Record<MetricCode, MetricPoint>> = {};
  const wakeAt = (() => {
    const row = nightIdx >= 0 ? points.get(series[nightIdx].date)?.get("sleep_end_local") : undefined;
    return row ? (row.v + 720) % 1440 : syncedAt;
  })();
  const codes = new Set<MetricCode>();
  for (const d of series.slice(-3)) for (const c of Object.keys(d.values)) codes.add(c as MetricCode);
  for (const code of codes) {
    if (isNightCode(code)) {
      if (nightIdx < 0) continue;
      const p = pointOf(code, nightIdx, wakeAt);
      if (p) values[code] = p;
      continue;
    }
    const p = pointOf(code, todayIdx, syncedAt);
    if (p) values[code] = p;
  }
  // Body Battery antes da sincronização de hoje: o último de ontem, com a data dele
  for (const code of ["body_battery_now", "body_battery_high", "body_battery_low", "body_battery_charged", "body_battery_drained"] as const) {
    if (!values[code] && todayIdx >= 1) {
      const p = pointOf(code, todayIdx - 1, 1439);
      if (p) values[code] = p;
    }
  }
  // VO₂máx e idade fitness: o último valor dos 60 dias, com a data dele
  for (const code of ["vo2max", "fitness_age"] as const) {
    if (values[code]) continue;
    for (let i = todayIdx - 1; i >= 0; i--) {
      const p = pointOf(code, i, 720);
      if (p) {
        values[code] = p;
        break;
      }
    }
  }

  // faixas habituais: a noite contra as 28 noites anteriores; o dia (parcial) só para o que não acumula
  const baselines: Partial<Record<MetricCode, Baseline | null>> = {};
  const fullDayBaselines: Partial<Record<MetricCode, Baseline | null>> = {};
  for (const code of Object.keys(values) as MetricCode[]) {
    const p = values[code]!;
    const idx = series.findIndex((d) => d.date === p.date);
    const prior = series.slice(Math.max(0, idx - 28), Math.max(0, idx)).map((d) => d.values[code] ?? null);
    const base = baseline(prior, MIN_SPREAD[code] ?? 0);
    fullDayBaselines[code] = base;
    baselines[code] = isCumulative(code) && p.date === input.today ? null : base;
  }

  const nightValues = nightIdx >= 0 ? series[nightIdx].values : {};
  const nightPrior = series.slice(Math.max(0, nightIdx - 28), Math.max(0, nightIdx)).map((d) => d.values);
  const histOf = (code: MetricCode) => nightPrior.map((p) => p[code] ?? null);
  const disp =
    nightIdx >= 0 && modelMeasures(model, "disposition_uh")
      ? disposition({
          hrvNight: nightValues.hrv_night,
          hrvHistory: histOf("hrv_night"),
          restingHr: nightValues.hr_resting,
          restingHrHistory: histOf("hr_resting"),
          asleepMin: nightValues.sleep_asleep_min,
          asleepHistory: histOf("sleep_asleep_min"),
          efficiencyPct: nightValues.sleep_efficiency_pct,
          efficiencyHistory: histOf("sleep_efficiency_pct"),
          loadRatio: series[todayIdx].values.load_ratio,
          tempDelta: nightValues.skin_temp_delta_c,
        })
      : null;
  const vitals = nightIdx >= 0 ? nightVitals(NIGHT_VITALS_COMPONENTS.map((code) => ({ code, value: nightValues[code], history: histOf(code), minSpread: MIN_SPREAD[code] }))) : null;

  // sessão de sono mostrada: horário de dormir e acordar da noite principal
  const sleepStart = nightValues.sleep_start_local;
  const sleepEnd = nightValues.sleep_end_local;
  const night =
    nightIdx >= 0 && typeof nightValues.sleep_asleep_min === "number"
      ? { date: nightDate, isToday: nightIsToday, startClock: typeof sleepStart === "number" ? (sleepStart + 720) % 1440 : 0, endClock: typeof sleepEnd === "number" ? (sleepEnd + 720) % 1440 : wakeAt }
      : null;

  // treinos de hoje no formato dos cards
  const todayWorkouts: (DemoWorkout & { endMin: number })[] = (workoutsByDay.get(input.today) ?? []).map((w) => {
    const start = minutesIn(w.start, input.timeZone);
    const startMin = start && start.date === input.today ? start.at : 0;
    const durationMin = Math.max(1, Math.round(w.dur / 60));
    const zonesMin = (Array.isArray(w.zones) && w.zones.length === 5 ? w.zones.map((s) => Math.round(s / 60)) : [0, 0, 0, 0, 0]) as DemoWorkout["zonesMin"];
    return {
      sport: (SPORTS.has(w.sport) ? w.sport : "other") as Sport,
      startMin,
      durationMin,
      distanceM: w.dist ?? null,
      kcal: w.kcal ?? 0,
      // 0 = a fonte não mandou FC (a linha de FC não aparece; nada é mostrado como zero)
      avgHr: w.avg_hr ?? 0,
      maxHr: w.max_hr ?? 0,
      zonesMin,
      hrRecovery1min: 0,
      trimp: edwardsTrimp(zonesMin),
      steps: 0,
      endMin: startMin + durationMin,
    };
  });
  let lastWorkoutDate: string | null = null;
  for (let i = todayIdx; i >= 0; i--) {
    if ((workoutsByDay.get(series[i].date) ?? []).length > 0) {
      lastWorkoutDate = series[i].date;
      break;
    }
  }

  const snapshot: WatchSnapshot = {
    persona: "real",
    model,
    deviceName,
    date: input.today,
    syncedAt,
    night,
    values,
    workouts: todayWorkouts,
    lastWorkoutDate,
    history: series.slice(-HISTORY),
    baselines,
    fullDayBaselines,
    disposition: disp,
    nightVitals: vitals,
  };
  return { kind: "real", provider: primary.provider, snapshot, lastSync, stale };
}
