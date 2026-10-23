import { describe, expect, it } from "vitest";
import { GARMIN_ALLOWED, GARMIN_KINDS, normalizeGarmin, splitGarminBody } from "@/lib/health/adapters/garmin";
import { normalizeOura, OURA_ALLOWED, OURA_KINDS, parseOuraNotification } from "@/lib/health/adapters/oura";
import { normalizePolar, parsePolarNotification, POLAR_ALLOWED } from "@/lib/health/adapters/polar";
import { normalizeWhoop, parseWhoopNotification, WHOOP_ALLOWED } from "@/lib/health/adapters/whoop";
import { canonicalSport, isoDurationSeconds, parseOffset, pickAllowed } from "@/lib/health/adapters/common";
import { isStoredMetric, validateBatch } from "@/lib/health/normalize";
import { HEALTH_CATEGORIES, type NormalizedBatch } from "@/lib/health/types";
import { parseWebhook } from "@/lib/health/webhook-parse";
import { metricDef } from "@/lib/wearables/catalog";
import { garminDeregistration, garminManualSleep, garminPing, garminPush, SENTINELS } from "../fixtures/wearables/garmin";
import { ouraActivity, ouraNap, ouraNotification, ouraReadiness, ouraSleep, ouraSpo2, ouraStress, ouraTagNotification, ouraWorkoutAuto, ouraWorkoutManual } from "../fixtures/wearables/oura";
import { polarActivity, polarExercise, polarManualExercise, polarNotificationExercise, polarNotificationSleep, polarPing, polarRecharge, polarSleep } from "../fixtures/wearables/polar";
import { whoopBody, whoopCycle, whoopNotification, whoopProfile, whoopRecovery, whoopSleep, whoopWorkout } from "../fixtures/wearables/whoop";

// Adaptadores das marcas (docs/decisions/hoje-relogio.md §9.2, §13.2, RN-02/02b/20): payload bruto
// → lote no catálogo canônico. Estes testes FALHAM se água, calorias ingeridas, peso/composição,
// humor, ciclo, esforço dado pela pessoa ou qualquer coisa digitada à mão entrar.

const ctx = { tzFallback: "America/Sao_Paulo" };
const ALL = [...HEALTH_CATEGORIES];

const daily = (b: NormalizedBatch) => Object.fromEntries(b.daily.map((d) => [d.code, d]));

/** Nenhum valor-sentinela (campo proibido) aparece em nenhum lugar do lote. */
function expectNoSentinels(batch: NormalizedBatch) {
  const text = JSON.stringify(batch);
  for (const s of SENTINELS) expect(text).not.toMatch(new RegExp(`(^|[^0-9.])${s}([^0-9]|$)`));
}

/** Todo código do lote é do catálogo, medido pelo aparelho (nada calculado nem agregado de treino). */
function expectCatalogOnly(batch: NormalizedBatch) {
  for (const d of batch.daily) {
    expect(metricDef(d.code), d.code).not.toBeNull();
    expect(isStoredMetric(d.code), d.code).toBe(true);
  }
}

// Campos que NUNCA podem estar numa lista permitida (RN-02): digitados, água, comida, peso,
// composição, humor, ciclo, esforço percebido, sob demanda, pressão, rótulos livres.
const FORBIDDEN_FIELD =
  /hydration|consumed|calorie_?goal|kilocaloriesgoal|bodycomp|weight|body_?fat|(^|[._])bmi($|[._])|mood|stateofmind|menstru|cycle_?phase|period_?start|perceived|(^|[._])rpe($|[._])|sleep_rating|sleep_goal|(^|[._])(enhanced_)?tags?($|[._])|(^|[._])label($|[._])|activityname|ondemand|bloodpressure|systolic|glucose|email|first_name|last_name|height|club_name|fat_percentage|carbohydrate|protein/i;

describe("listas permitidas por adaptador (RN-02b)", () => {
  const lists: [string, readonly string[]][] = [
    ...Object.entries(GARMIN_ALLOWED),
    ...Object.entries(OURA_ALLOWED),
    ...Object.entries(WHOOP_ALLOWED),
    ...Object.entries(POLAR_ALLOWED),
  ];
  it.each(lists)("%s não lista nenhum campo proibido", (_kind, fields) => {
    for (const f of fields) expect(f, f).not.toMatch(FORBIDDEN_FIELD);
  });

  it("o próprio filtro de campos proibidos pega os nomes reais das marcas", () => {
    for (const f of ["hydrationInMilliliters", "consumedCalories", "netKilocaloriesGoal", "bodyComps", "weightInGrams", "enhanced_tag", "tag", "label", "sleep_rating", "perceived_load", "rpe", "activityName", "onDemandReadings", "email", "weight_kilogram"]) {
      expect(f).toMatch(FORBIDDEN_FIELD);
    }
  });

  it("Garmin não registra bodyComps, mct, bloodPressures, pulseox (sob demanda) nem healthSnapshot", () => {
    for (const kind of ["bodyComps", "mct", "bloodPressures", "pulseox", "healthSnapshot", "epochs", "activityDetails", "manuallyUpdatedActivities"]) {
      expect(GARMIN_KINDS as readonly string[]).not.toContain(kind);
    }
    expect(OURA_KINDS as readonly string[]).not.toContain("enhanced_tag");
    expect(OURA_KINDS as readonly string[]).not.toContain("tag");
  });

  it("pickAllowed copia só os caminhos listados (inclusive aninhados)", () => {
    expect(pickAllowed({ a: 1, b: { c: 2, d: 3 }, e: 4 }, ["a", "b.c"])).toEqual({ a: 1, b: { c: 2 } });
    expect(pickAllowed(null, ["a"])).toEqual({});
    expect(pickAllowed([1, 2], ["0"])).toEqual({});
  });
});

describe("Garmin (push e ping)", () => {
  const items = splitGarminBody(garminPush);

  it("divide o POST por pessoa e resumo, ignorando tipos não registrados sem ler o conteúdo", () => {
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(["dailies", "sleeps", "activities", "activities", "activities", "hrv", "skinTemp", "stressDetails", "userMetrics"]);
    expect(items.every((i) => i.providerUserId === "garmin-user-1")).toBe(true);
    // o payload guardado no inbox já é a lista permitida
    const stored = JSON.stringify(items.map((i) => i.payload));
    expect(stored).not.toMatch(/hydrationInMilliliters|consumedCalories|netKilocaloriesGoal|activityName|weightInGrams|cycleLength|onDemand|sleepLevelsMap/);
  });

  it("resumo diário: passos, metas, FC, estresse e Body Battery; água e calorias ingeridas nunca entram", () => {
    const b = normalizeGarmin("dailies", items[0].payload);
    expectNoSentinels(b);
    expectCatalogOnly(b);
    const d = daily(b);
    expect(d.steps.value).toBe(6234);
    expect(d.steps.date).toBe("2026-10-22");
    expect(d.steps_goal.value).toBe(8000);
    expect(d.intensity_min_moderate.value).toBe(25);
    expect(d.intensity_min_vigorous.value).toBe(10);
    expect(d.intensity_goal_week_min.value).toBe(150);
    expect(d.hr_resting.value).toBe(52);
    expect(d.stress_avg).toMatchObject({ value: 31, vendor: true, scale: "garmin_stress" });
    expect(d.body_battery_now).toMatchObject({ value: 64, vendor: true, scale: "garmin_body_battery" });
    // "dados até": fim do período coberto (11:30 local = 14:30Z)
    expect(d.steps.at).toBe("2026-10-22T14:30:00.000Z");
    expect(b.daily.some((x) => (x.code as string) === "hydration_ml" || (x.code as string) === "consumed_kcal")).toBe(false);
  });

  it("estresse sem leitura (-1) não vira zero", () => {
    const b = normalizeGarmin("dailies", { ...items[0].payload, averageStressLevel: -1, maxStressLevel: -2 });
    expect(daily(b).stress_avg).toBeUndefined();
    expect(daily(b).stress_max).toBeUndefined();
  });

  it("sono: sessão do dia em que acorda, estágios, nota Garmin, respiração e SpO₂ só dentro do sono", () => {
    const b = normalizeGarmin("sleeps", items[1].payload);
    expectCatalogOnly(b);
    expect(b.sleep).toHaveLength(1);
    const s = b.sleep[0];
    expect(s).toMatchObject({ date: "2026-10-22", deep: 90, light: 230, rem: 110, awake: 40, asleep: 430, score: 81, scoreScale: "garmin_sleep_score", main: true, tz: -180 });
    const d = daily(b);
    expect(d.sleep_asleep_min.value).toBe(430);
    expect(d.resp_rate_sleep.value).toBe(14.1);
    expect(d.spo2_night_avg.value).toBe(96);
    expect(d.spo2_night_min.value).toBe(94);
    // dormiu 22:20 → 620 min desde o meio-dia; acordou 06:10 → 1090
    expect(d.sleep_start_local.value).toBe(620);
    expect(d.sleep_end_local.value).toBe(1090);
  });

  it("sono digitado à mão (validation MANUAL/AUTO_MANUAL) não entra", () => {
    expect(normalizeGarmin("sleeps", garminManualSleep)).toMatchObject({ sleep: [], daily: [] });
    expect(normalizeGarmin("sleeps", { ...garminManualSleep, validation: "AUTO_MANUAL" })).toMatchObject({ sleep: [], daily: [] });
  });

  it("treinos: o do relógio entra (sem nome digitado); manual e upload pela web nunca", () => {
    const acts = items.filter((i) => i.kind === "activities").map((i) => normalizeGarmin("activities", i.payload));
    const all: NormalizedBatch = { provider: "garmin", normalizerVersion: 1, daily: [], sleep: [], deletions: [], workouts: acts.flatMap((a) => a.workouts) };
    expectNoSentinels(all);
    expect(all.workouts).toHaveLength(1);
    expect(all.workouts[0]).toMatchObject({ sport: "run", origin: "started_on_device", dur: 2520, dist: 7812.3, avgHr: 148, maxHr: 171, date: "2026-10-22" });
    expect(JSON.stringify(all)).not.toContain("Ana");
    expect(acts[0].device).toBe("fenix 9");
  });

  it("VFC noturna (RMSSD), desvio de temperatura, Body Battery com horário, VO₂máx e idade fitness", () => {
    expect(daily(normalizeGarmin("hrv", items[5].payload)).hrv_night).toMatchObject({ value: 47, method: "rmssd" });
    expect(daily(normalizeGarmin("skinTemp", items[6].payload)).skin_temp_delta_c.value).toBe(0.12);
    const bb = daily(normalizeGarmin("stressDetails", items[7].payload));
    expect(bb.body_battery_now.value).toBe(58);
    expect(bb.body_battery_now.at).toBe("2026-10-22T14:27:00.000Z");
    expect(bb.body_battery_high.value).toBe(91);
    expect(bb.body_battery_low.value).toBe(30);
    const um = daily(normalizeGarmin("userMetrics", items[8].payload));
    expect(um.vo2max.value).toBe(52);
    expect(um.fitness_age.value).toBe(31);
  });

  it("ping guarda só a URL de busca; deregistração não gera dado", () => {
    const ping = parseWebhook("garmin", garminPing);
    expect(ping).toHaveLength(1);
    expect(ping[0].payload).toEqual({ callbackURL: garminPing.dailies[0].callbackURL });
    expect(ping[0].eventId).toMatch(/^dailies:ping:[0-9a-f]{24}$/);
    const dereg = parseWebhook("garmin", garminDeregistration);
    expect(dereg[0].kind).toBe("deregistrations");
    expect(normalizeGarmin("deregistrations", dereg[0].payload)).toMatchObject({ daily: [], sleep: [], workouts: [] });
  });
});

describe("Oura v2", () => {
  it("notificação: só tipos inscritos; tag digitada é ignorada", () => {
    expect(parseOuraNotification(ouraNotification)).toMatchObject({ providerUserId: "oura-user-77", kind: "sleep", eventType: "update" });
    expect(parseOuraNotification(ouraTagNotification)).toBeNull();
    expect(parseWebhook("oura", ouraTagNotification)).toEqual([]);
  });

  it("Readiness com escala original e desvio de temperatura", () => {
    const d = daily(normalizeOura("daily_readiness", ouraReadiness, ctx));
    expect(d.readiness_vendor).toMatchObject({ value: 78, vendor: true, scale: "oura_readiness", date: "2026-10-22" });
    expect(d.skin_temp_delta_c.value).toBe(-0.24);
  });

  it("sono principal: sessão, estágios, VFC RMSSD, respiração, FC mais baixa; cochilo não vira métrica da noite", () => {
    const b = normalizeOura("sleep", ouraSleep, ctx);
    expectCatalogOnly(b);
    expect(b.sleep[0]).toMatchObject({ ext: ouraSleep.id, date: "2026-10-22", main: true, nap: false, asleep: 423, deep: 90, rem: 117, awake: 46, inBed: 475, eff: 88, lowestHr: 49, tz: -180 });
    const d = daily(b);
    expect(d.hrv_night).toMatchObject({ value: 49, method: "rmssd" });
    expect(d.resp_rate_sleep.value).toBe(14.3);
    expect(d.hr_resting.value).toBe(49);
    expect(d.sleep_end_local.value).toBe(1126); // 06:45 → 18:46 após o meio-dia... arredondado ao minuto
    const nap = normalizeOura("sleep", ouraNap, ctx);
    expect(nap.sleep[0]).toMatchObject({ main: false, nap: true });
    expect(nap.daily).toHaveLength(0);
  });

  it("atividade: passos, kcal ativas, distância, intensidade e sedentário (total com basal não é lido)", () => {
    const b = normalizeOura("daily_activity", ouraActivity, ctx);
    expectNoSentinels(b);
    const d = daily(b);
    expect(d.steps.value).toBe(10234);
    expect(d.active_kcal.value).toBe(512);
    expect(d.intensity_min_vigorous.value).toBe(15);
    expect(d.sedentary_min.value).toBe(420);
  });

  it("SpO₂ e estresse do dia", () => {
    expect(daily(normalizeOura("daily_spo2", ouraSpo2, ctx)).spo2_night_avg.value).toBe(96.4);
    const st = daily(normalizeOura("daily_stress", ouraStress, ctx));
    expect(st.stress_high_min.value).toBe(60);
    expect(st.recovery_high_min.value).toBe(90);
  });

  it("treino detectado entra (sem o rótulo digitado); treino manual nunca", () => {
    const auto = normalizeOura("workout", ouraWorkoutAuto, ctx);
    expect(auto.workouts[0]).toMatchObject({ sport: "walk", origin: "auto_detected", dur: 2100, dist: 3200 });
    expect(JSON.stringify(auto)).not.toContain("cachorro");
    const manual = normalizeOura("workout", ouraWorkoutManual, ctx);
    expect(manual.workouts).toHaveLength(0);
    expectNoSentinels(manual);
  });

  it("exclusão na marca vira exclusão aqui (§5.17)", () => {
    expect(normalizeOura("sleep", { id: "x1" }, ctx, true).deletions).toEqual([{ kind: "sleep", ext: "x1" }]);
    expect(normalizeOura("sleep", { ...ouraSleep, type: "deleted" }, ctx).deletions).toEqual([{ kind: "sleep", ext: ouraSleep.id }]);
  });
});

describe("WHOOP v2", () => {
  it("notificação: tipo e id; eventos desconhecidos ignorados", () => {
    expect(parseWhoopNotification(whoopNotification)).toMatchObject({ providerUserId: "10129", kind: "recovery", deleted: false });
    expect(parseWhoopNotification({ ...whoopNotification, type: "body_measurement.updated" })).toBeNull();
    expect(parseWebhook("whoop", whoopNotification)[0].eventId).toBe(`trace:${whoopNotification.trace_id}`);
  });

  it("Recovery (escala original) no dia em que acorda, com FC de repouso, VFC RMSSD, SpO₂, temperatura ABSOLUTA e Strain", () => {
    const b = normalizeWhoop("recovery", { recovery: whoopRecovery, sleep: whoopSleep, cycle: whoopCycle }, ctx);
    expectCatalogOnly(b);
    const d = daily(b);
    expect(d.readiness_vendor).toMatchObject({ value: 44, scale: "whoop_recovery_pct", date: "2026-10-22", vendor: true });
    expect(d.hr_resting.value).toBe(64);
    expect(d.hrv_night).toMatchObject({ value: 31.8, method: "rmssd" });
    expect(d.spo2_night_avg.value).toBe(95.7);
    expect(d.skin_temp_c.value).toBe(33.7);
    expect(d.skin_temp_delta_c).toBeUndefined();
    expect(d.day_strain).toMatchObject({ value: 5.3, scale: "whoop_strain" });
  });

  it("recovery ainda sem nota (calibrando/pendente) não vira número", () => {
    const b = normalizeWhoop("recovery", { recovery: { ...whoopRecovery, score_state: "PENDING_SCORE" }, sleep: whoopSleep, cycle: { ...whoopCycle, score_state: "PENDING_SCORE" } }, ctx);
    expect(b.daily).toHaveLength(0);
  });

  it("sono com estágios e desempenho do sono da marca", () => {
    const b = normalizeWhoop("sleep", whoopSleep, ctx);
    expect(b.sleep[0]).toMatchObject({ date: "2026-10-22", asleep: 440, deep: 100, rem: 120, light: 220, awake: 40, inBed: 480, eff: 92, score: 98, main: true, tz: -180 });
    expect(daily(b).resp_rate_sleep.value).toBe(16.1);
  });

  it("treino com zonas (1–5), distância e strain estimado pela pulseira", () => {
    const b = normalizeWhoop("workout", whoopWorkout, ctx);
    expect(b.workouts[0]).toMatchObject({ sport: "run", origin: "auto_detected", dur: 2400, zones: [600, 600, 900, 600, 0], avgHr: 123, effort: 8.2, effortScale: "whoop_strain", kcal: 375 });
  });

  it("perfil e medidas corporais: só o user_id passa pela lista permitida", () => {
    expect(pickAllowed(whoopProfile, WHOOP_ALLOWED.profile)).toEqual({ user_id: 10129 });
    expect(pickAllowed(whoopBody, WHOOP_ALLOWED.profile)).toEqual({});
  });
});

describe("Polar AccessLink", () => {
  it("notificações: EXERCISE e SLEEP viram itens; PING não", () => {
    expect(parsePolarNotification(polarNotificationExercise)).toMatchObject({ providerUserId: "475", event: "EXERCISE", entityId: "aQlC83" });
    expect(parseWebhook("polar", polarNotificationSleep)[0]).toMatchObject({ kind: "sleep", payload: { event: "SLEEP", date: "2026-10-22" } });
    expect(parseWebhook("polar", polarPing)).toEqual([]);
  });

  it("treino do aparelho com zonas; esforço percebido, clube e macronutrientes nunca entram", () => {
    const b = normalizePolar("exercise", polarExercise);
    expectNoSentinels(b);
    expect(b.workouts[0]).toMatchObject({ sport: "run", origin: "started_on_device", dur: 2730, dist: 8100, avgHr: 146, maxHr: 172, zones: [120, 480, 1230, 840, 60], date: "2026-10-22", start: "2026-10-22T09:30:00.000Z" });
    expect(JSON.stringify(b)).not.toMatch(/Clube|perceived|fat_percentage/);
  });

  it("treino lançado à mão no Flow (sem aparelho) não entra", () => {
    const b = normalizePolar("exercise", polarManualExercise);
    expect(b.workouts).toHaveLength(0);
    expectNoSentinels(b);
  });

  it("sono (nota da Polar sim; nota dada pela pessoa não) e Nightly Recharge com status e rótulo originais", () => {
    const s = normalizePolar("sleep", polarSleep);
    expectNoSentinels(s);
    expect(s.sleep[0]).toMatchObject({ date: "2026-10-22", asleep: 420, deep: 90, rem: 105, light: 225, awake: 30, score: 79 });
    const r = daily(normalizePolar("nightly_recharge", polarRecharge));
    expect(r.readiness_vendor).toMatchObject({ value: 4, scale: "polar_nightly_recharge_status", label: "ok", vendor: true });
    expect(r.hrv_night).toMatchObject({ value: 41, method: "rmssd" });
    expect(r.resp_rate_sleep.value).toBe(14.1);
  });

  it("atividade do dia: passos, kcal ativas, distância (total com basal não é lido)", () => {
    const b = normalizePolar("activity", polarActivity);
    expectNoSentinels(b);
    expect(daily(b)).toMatchObject({ steps: { value: 11030, date: "2026-10-22" }, active_kcal: { value: 640 }, distance_m: { value: 8402 } });
  });
});

describe("todas as marcas: só catálogo, só medido pelo aparelho, e o validador filtra por consentimento", () => {
  const batches: NormalizedBatch[] = [
    ...splitGarminBody(garminPush).map((i) => normalizeGarmin(i.kind, i.payload)),
    normalizeOura("daily_readiness", ouraReadiness, ctx),
    normalizeOura("sleep", ouraSleep, ctx),
    normalizeOura("daily_activity", ouraActivity, ctx),
    normalizeWhoop("recovery", { recovery: whoopRecovery, sleep: whoopSleep, cycle: whoopCycle }, ctx),
    normalizeWhoop("workout", whoopWorkout, ctx),
    normalizePolar("exercise", polarExercise),
    normalizePolar("sleep", polarSleep),
    normalizePolar("nightly_recharge", polarRecharge),
  ];

  it("nenhum lote traz código fora do catálogo, calculado por nós ou sentinela", () => {
    for (const b of batches) {
      expectCatalogOnly(b);
      expectNoSentinels(b);
    }
  });

  it("tudo plausível passa no validador com todas as categorias consentidas", () => {
    for (const b of batches) expect(validateBatch(b, ALL).dropped).toEqual([]);
  });
});

describe("ajudantes de data e esporte", () => {
  it("deslocamento, duração ISO e esporte canônico", () => {
    expect(parseOffset("-03:00")).toBe(-180);
    expect(parseOffset("+0530")).toBe(330);
    expect(parseOffset("x")).toBeNull();
    expect(isoDurationSeconds("PT1H2M3.5S")).toBe(3724);
    expect(isoDurationSeconds("bad")).toBeUndefined();
    expect(canonicalSport("TRAIL_RUNNING")).toBe("trail_run");
    expect(canonicalSport("ROAD_BIKING")).toBe("cycle");
    expect(canonicalSport("STRENGTH_TRAINING")).toBe("strength");
    expect(canonicalSport("open_water_swimming")).toBe("swim");
    expect(canonicalSport("PADEL")).toBe("other");
  });
});
