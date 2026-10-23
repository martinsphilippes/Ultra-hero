import { describe, expect, it } from "vitest";
import { indexCardKind, sectionAvailable, sectionPoints } from "@/components/me/today/watch-helpers";
import type { RpcDaily, RpcWorkout } from "@/lib/health/dedup";
import { buildRealView, type RpcConnection, type RpcToday } from "@/lib/health/snapshot";
import { dayIndexOf, ymdOf } from "@/lib/wearables/demo";

// Hoje com relógio REAL (schema health → mesmo WatchSnapshot do simulado): métrica não medida
// escondida, horário e fonte reais, uma fonte por métrica/dia, índices nossos com as mesmas funções.

const TZ = "America/Sao_Paulo";
const TODAY = "2026-10-22";
const NOW = new Date("2026-10-22T14:00:00Z"); // 11:00 em São Paulo

const conn = (provider: RpcConnection["provider"], extra: Partial<RpcConnection> = {}): RpcConnection => ({
  id: `conn-${provider}`,
  provider,
  status: "active",
  device_name: null,
  connected_at: "2026-08-01T12:00:00Z",
  last_data_at: "2026-10-22T13:50:00Z",
  last_sync_at: "2026-10-22T13:50:00Z",
  last_error_code: null,
  ...extra,
});

function row(provider: RpcConnection["provider"], d: string, c: string, v: number, extra: Partial<RpcDaily> = {}): RpcDaily {
  return { d, c, v, s: null, l: null, m: null, n: null, at: null, cov: null, conn: `conn-${provider}`, p: provider, u: `${d}T12:00:00Z`, ...extra };
}

/** 35 dias de Garmin: noite (FC rep., VFC, sono) e dia (passos, Body Battery). */
function garminDays(days = 35): RpcDaily[] {
  const out: RpcDaily[] = [];
  const t = dayIndexOf(TODAY);
  for (let i = t - days + 1; i <= t; i++) {
    const d = ymdOf(i);
    const k = i % 5;
    out.push(row("garmin", d, "hr_resting", 52 + k, { at: `${d}T09:10:00Z` }));
    out.push(row("garmin", d, "hrv_night", 45 + k, { m: "rmssd", at: `${d}T09:10:00Z` }));
    out.push(row("garmin", d, "sleep_asleep_min", 420 + k * 5, { at: `${d}T09:10:00Z` }));
    out.push(row("garmin", d, "sleep_start_local", 620 + k, { at: `${d}T09:10:00Z` }));
    out.push(row("garmin", d, "sleep_end_local", 1090, { at: `${d}T09:10:00Z` }));
    out.push(row("garmin", d, "steps", 8000 + k * 100, { at: `${d}T13:30:00Z` }));
    out.push(row("garmin", d, "intensity_min_moderate", 20, { at: `${d}T13:30:00Z` }));
    out.push(row("garmin", d, "intensity_min_vigorous", 5, { at: `${d}T13:30:00Z` }));
    if (i < t) out.push(row("garmin", d, "body_battery_now", 40 + k, { at: `${d}T23:00:00Z` }));
  }
  return out;
}

const run: RpcWorkout = {
  id: "w1",
  d: TODAY,
  sport: "run",
  origin: "started_on_device",
  start: "2026-10-22T09:40:00Z",
  end: "2026-10-22T10:22:00Z",
  dur: 2520,
  dist: 7812,
  kcal: 512,
  avg_hr: 148,
  max_hr: 171,
  zones: [120, 480, 1200, 720, 0],
  conn: "conn-garmin",
  p: "garmin",
};

const data = (extra: Partial<RpcToday> = {}): RpcToday => ({ connections: [conn("garmin", { device_name: "fenix 9" })], daily: garminDays(), sleep: [], workouts: [run], ...extra });

describe("buildRealView", () => {
  it("sem conexão: nada (o card 'Conectar relógio' continua); conectado sem dado: 'Sincronizando…'", () => {
    expect(buildRealView({ data: { connections: [], daily: [], sleep: [], workouts: [] }, today: TODAY, nowMin: 660, timeZone: TZ, now: NOW })).toEqual({ kind: "none" });
    const syncing = buildRealView({ data: { connections: [conn("oura", { last_data_at: null })], daily: [], sleep: [], workouts: [] }, today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    expect(syncing).toMatchObject({ kind: "syncing", provider: "oura", deviceName: "Oura" });
  });

  it("monta o Hoje real com horário e fonte reais; o que a fonte não manda fica escondido", () => {
    const v = buildRealView({ data: data(), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    const s = v.snapshot;
    expect(s.persona).toBe("real");
    expect(s.model).toBe("garmin_fenix");
    expect(s.deviceName).toBe("fenix 9");
    expect(v.stale).toBe(false);
    expect(v.lastSync).toEqual({ date: TODAY, at: 650 }); // 13:50Z = 10:50 local
    expect(s.syncedAt).toBe(650);
    // noite: a de hoje, com o horário da amostra (09:10Z = 06:10 local)
    expect(s.night).toMatchObject({ date: TODAY, isToday: true, endClock: 370 });
    expect(s.values.hr_resting).toMatchObject({ date: TODAY, at: 370 });
    expect(s.values.hrv_night?.method).toBe("rmssd");
    // nunca zero fabricado: o que a Garmin não mandou não existe
    expect(s.values.stress_avg).toBeUndefined();
    expect(s.values.env_noise_db_avg).toBeUndefined();
    expect(sectionAvailable(s, "stress")).toBe(false);
    expect(sectionAvailable(s, "environment")).toBe(false);
    expect(sectionPoints(s, "activity").map((p) => p.code)).toContain("steps");
  });

  it("dia parcial: o que acumula não tem faixa habitual hoje; a noite tem (RN-07)", () => {
    const v = buildRealView({ data: data(), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.snapshot.baselines.steps).toBeNull();
    expect(v.snapshot.fullDayBaselines.steps).not.toBeNull();
    expect(v.snapshot.baselines.hr_resting).not.toBeNull();
  });

  it("índices nossos com as mesmas funções do simulado: Disposição (recolhida sob o Body Battery) e Sinais da noite", () => {
    const v = buildRealView({ data: data(), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.snapshot.disposition).not.toBeNull();
    expect(v.snapshot.nightVitals?.components.map((c) => c.code)).toEqual(["hr_resting", "hrv_night"]);
    // Body Battery de hoje ainda não veio: o de ontem, com a data dele
    expect(v.snapshot.values.body_battery_now).toMatchObject({ date: "2026-10-21" });
    expect(indexCardKind(v.snapshot)).toBe("body_battery");
  });

  it("treino de hoje com ritmo, FC e carga do dia (zonas); semana de intensidade somada da segunda até hoje", () => {
    const v = buildRealView({ data: data(), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.snapshot.workouts).toHaveLength(1);
    expect(v.snapshot.workouts[0]).toMatchObject({ sport: "run", startMin: 400, durationMin: 42, distanceM: 7812, avgHr: 148 });
    expect(v.snapshot.values.cardio_load_day_uh?.value).toBe(2 + 16 + 60 + 48);
    expect(v.snapshot.values.workout_pace_s_per_km?.value).toBe(Math.round(2520 / 7.812));
    // 22/10/2026 é quinta: segunda a quinta = 4 dias × (20 + 2×5)
    expect(v.snapshot.values.intensity_min_week?.value).toBe(120);
    expect(v.snapshot.lastWorkoutDate).toBe(TODAY);
  });

  it("duas fontes: sono do anel, passos do relógio; treino repetido aparece uma vez", () => {
    const oura = [row("oura", TODAY, "sleep_asleep_min", 455, { at: "2026-10-22T09:30:00Z" }), row("oura", TODAY, "steps", 99999)];
    const ouraRun = { ...run, id: "w2", p: "oura" as const, conn: "conn-oura", start: "2026-10-22T09:41:00Z", end: "2026-10-22T10:20:00Z", zones: null };
    const v = buildRealView({ data: data({ connections: [conn("garmin"), conn("oura", { last_data_at: "2026-10-22T12:00:00Z" })], daily: [...garminDays(), ...oura], workouts: [run, ouraRun] }), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.snapshot.values.sleep_asleep_min?.value).toBe(455);
    expect(v.snapshot.values.steps?.value).toBe(8000 + (dayIndexOf(TODAY) % 5) * 100);
    expect(v.snapshot.workouts).toHaveLength(1);
  });

  it("WHOOP: desvio de temperatura derivado da temperatura absoluta e da mediana de 28 noites", () => {
    const t = dayIndexOf(TODAY);
    const rows: RpcDaily[] = [];
    for (let i = t - 10; i <= t; i++) rows.push(row("whoop", ymdOf(i), "skin_temp_c", i === t ? 34.1 : 33.6), row("whoop", ymdOf(i), "readiness_vendor", 60, { s: "whoop_recovery_pct" }));
    const v = buildRealView({ data: { connections: [conn("whoop")], daily: rows, sleep: [], workouts: [] }, today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.snapshot.model).toBe("whoop");
    expect(v.snapshot.values.skin_temp_delta_c?.value).toBe(0.5);
    expect(indexCardKind(v.snapshot)).toBe("readiness_vendor");
    // escala original da marca chega ao card (nunca normalizada)
    expect(v.snapshot.values.readiness_vendor).toMatchObject({ value: 60, scale: "whoop_recovery_pct" });
  });

  it("sincronização velha (> 6 h): selo de defasado; conexão desautorizada na marca mantém os dados antigos visíveis", () => {
    const v = buildRealView({ data: data({ connections: [conn("garmin", { status: "revoked_by_provider", last_sync_at: "2026-10-21T20:00:00Z" })] }), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.stale).toBe(true);
    expect(v.lastSync).toEqual({ date: "2026-10-21", at: 1020 });
  });
});

describe("buildRealView — revisão (conexão que falhou, Oura sem horário de início do dia, zonas estimadas)", () => {
  const empty = { daily: [], sleep: [], workouts: [] };

  it("'pending' (OAuth em curso) e 'error' (abertura falhou) sem dado não viram 'Sincronizando…'", () => {
    for (const status of ["pending", "error", "token_expired"]) {
      expect(buildRealView({ data: { connections: [conn("polar", { status, last_data_at: null })], ...empty }, today: TODAY, nowMin: 660, timeZone: TZ, now: NOW })).toEqual({ kind: "none" });
    }
  });

  it("Oura: resumo diário sem `at` mostra o acordar (noite) e a sincronização (dia), nunca 00:00/04:00", () => {
    const t = dayIndexOf(TODAY);
    const rows: RpcDaily[] = [];
    for (let i = t - 10; i <= t; i++) rows.push(row("oura", ymdOf(i), "sleep_end_local", 1126), row("oura", ymdOf(i), "sleep_asleep_min", 420));
    rows.push(row("oura", TODAY, "readiness_vendor", 78, { s: "oura_readiness" }), row("oura", TODAY, "steps", 10234));
    const v = buildRealView({ data: { connections: [conn("oura")], daily: rows, sleep: [], workouts: [] }, today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    // acordou 06:46 (1126 − 720 = 406 min); sincronizou 10:50 (13:50Z)
    expect(v.snapshot.values.readiness_vendor!.at).toBe(406);
    expect(v.snapshot.values.steps!.at).toBe(650);
  });

  it("Garmin sem zonas: Carga do dia e zonas estimadas pela FC média ÷ maior FC de 90 dias (≥ 30 dias), rotuladas", () => {
    const t = dayIndexOf(TODAY);
    const hrMax: RpcDaily[] = [];
    for (let i = t - 40; i < t; i++) hrMax.push(row("garmin", ymdOf(i), "hr_max", i === t - 20 ? 185 : 160));
    const noZones = { ...run, zones: null };
    const v = buildRealView({ data: data({ daily: [...garminDays(), ...hrMax], workouts: [noZones] }), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    // 148 ÷ 185 = 80% → zona 4, os 42 minutos inteiros; TRIMP = 42 × 4
    expect(v.snapshot.values.hr_zone4_min?.value).toBe(42);
    expect(v.snapshot.values.cardio_load_day_uh?.value).toBe(168);
    expect(v.snapshot.estimatedZones).toBe(true);
    expect(v.snapshot.workouts[0].zonesMin).toEqual([0, 0, 0, 42, 0]);
  });

  it("sem 30 dias de FC máxima não estima (nada inventado)", () => {
    const t = dayIndexOf(TODAY);
    const few: RpcDaily[] = [];
    for (let i = t - 10; i < t; i++) few.push(row("garmin", ymdOf(i), "hr_max", 180));
    const v = buildRealView({ data: data({ daily: [...garminDays(), ...few], workouts: [{ ...run, zones: null }] }), today: TODAY, nowMin: 660, timeZone: TZ, now: NOW });
    if (v.kind !== "real") throw new Error(v.kind);
    expect(v.snapshot.values.cardio_load_day_uh).toBeUndefined();
    expect(v.snapshot.estimatedZones).toBeUndefined();
  });
});
