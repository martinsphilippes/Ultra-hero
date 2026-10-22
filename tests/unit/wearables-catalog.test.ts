import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONNECT_BRANDS,
  DETAIL_SECTIONS,
  EXCLUDED_MANUAL,
  EXCLUDED_ON_DEMAND,
  EXCLUDED_REGULATED,
  METRICS,
  MODEL_INFO,
  VENDOR_ONLY_BRANDS,
  WATCH_MODELS,
  metricDef,
  metricsForModel,
  modelMeasures,
} from "@/lib/wearables/catalog";

// Catálogo canônico do Hoje (docs/decisions/hoje-relogio.md §13.1–13.3): só o que o relógio mede
// sozinho. Estes testes falham se alguém tentar colocar algo digitado ou sob demanda no Hoje.

const LOCALES = ["pt-BR", "en", "es"] as const;
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(process.cwd(), "messages", l, "wearables.json"), "utf8")) as Record<string, Record<string, string>>]),
) as Record<(typeof LOCALES)[number], Record<string, Record<string, string>>>;

// Água, alimentação/calorias ingeridas, peso/composição, humor, ciclo, esforço dado pela pessoa,
// cafeína, glicose, pressão e funções reguladas/sob demanda — em código ou em nome, nos 3 idiomas.
const FORBIDDEN =
  /hydrat|water|[áa]gua|weight(?!ed)|\bpeso\b|body_?fat|gordura|composi|mood|humor|state_?of_?mind|cycle|ciclo|menstru|(?<![a-z])rpe(?![a-z])|effort|esfor[çc]o|perceived|consum|ingerid|food|aliment|nutri|caffeine|caf[eé]|glucose|glicose|glucosa|blood_?press|press[ãa]o|presi[óo]n|(?<![a-z])ecg(?![a-z])|eletro|electro|afib|fibrila|apnea|apneia|hypertens|hiperten|spot|snapshot|bioimp/i;

describe("catálogo de métricas do relógio", () => {
  it("só tem métricas automáticas (A), de treino (T) ou calculadas (C), com status v1 ou v1d", () => {
    for (const def of METRICS) {
      expect(["A", "T", "C"]).toContain(def.mode);
      expect(["v1", "v1d"]).toContain(def.status);
      expect(def.code).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      expect(def.models.length).toBeGreaterThan(0);
      for (const model of def.models) expect(WATCH_MODELS).toContain(model);
    }
  });

  it("não tem nenhuma métrica manual, sob demanda ou regulada (código nem nome em pt-BR/en/es)", () => {
    for (const def of METRICS) {
      expect(def.code, def.code).not.toMatch(FORBIDDEN);
      for (const locale of LOCALES) {
        const name = messages[locale].metrics[def.code];
        expect(name, `${locale}:${def.code}`).toBeTruthy();
        expect(name, `${locale}:${def.code}`).not.toMatch(FORBIDDEN);
      }
    }
    // a lista de nomes não tem métricas que não estejam no catálogo (nada escondido só no texto)
    for (const locale of LOCALES) expect(Object.keys(messages[locale].metrics).sort()).toEqual(METRICS.map((d) => d.code).sort());
  });

  it("o teste de proibidos pega de fato o que não pode entrar", () => {
    for (const bad of ["hydration_ml", "consumed_kcal", "weight", "body_fat", "mood", "menstrual_cycle", "rpe", "workout_effort_score", "caffeine_mg", "blood_glucose", "blood_pressure", "ecg_result", "spo2_spot", "health_snapshot"]) {
      expect(bad).toMatch(FORBIDDEN);
    }
    for (const bad of ["Água", "Peso", "Humor", "Ciclo menstrual", "Calorias ingeridas", "Esforço percebido"]) expect(bad).toMatch(FORBIDDEN);
  });

  it("códigos únicos e o que fica de fora nunca vira métrica", () => {
    const codes = METRICS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const key of [...EXCLUDED_MANUAL, ...EXCLUDED_ON_DEMAND, ...EXCLUDED_REGULATED]) expect(metricDef(key)).toBeNull();
  });

  it("Galaxy pelo Health Connect: sem VFC, FC de repouso, temperatura, respiração, andares, Disposição e estresse", () => {
    for (const code of ["hrv_night", "hr_resting", "skin_temp_delta_c", "skin_temp_c", "resp_rate_sleep", "resp_rate_day_avg", "floors_climbed", "floors_descended", "disposition_uh", "stress_avg", "distance_m", "active_kcal"]) {
      expect(modelMeasures("galaxy", code), code).toBe(false);
    }
    for (const code of ["steps", "sleep_asleep_min", "spo2_night_avg", "vo2max", "workout_count", "hr_avg"]) expect(modelMeasures("galaxy", code), code).toBe(true);
  });

  it("segue a matriz por modelo (§13.3)", () => {
    // Apple: anéis, ruído e quedas; sem Body Battery, estresse nem "na cama" (vem do iPhone)
    for (const code of ["move_goal_kcal", "exercise_min", "stand_hours", "env_noise_db_avg", "falls_detected", "disposition_uh"]) expect(modelMeasures("apple_s12", code), code).toBe(true);
    for (const code of ["body_battery_now", "stress_avg", "sleep_in_bed_min", "sleep_score_vendor", "readiness_vendor"]) expect(modelMeasures("apple_s12", code), code).toBe(false);
    // SE 3 / Series 9–11: sem SpO₂ noturna; luz do dia só no Series 12/Ultra 4
    expect(modelMeasures("apple_se3", "spo2_night_avg")).toBe(false);
    expect(modelMeasures("apple_se3", "daylight_min")).toBe(false);
    expect(modelMeasures("apple_s12", "daylight_min")).toBe(true);
    // Garmin: Body Battery, estresse, metas; vívoactive/Instinct sem temperatura
    for (const code of ["body_battery_now", "stress_avg", "steps_goal", "intensity_min_week", "sleep_score_vendor", "fitness_age"]) expect(modelMeasures("garmin_fenix", code), code).toBe(true);
    expect(modelMeasures("garmin_fenix", "skin_temp_delta_c")).toBe(true);
    expect(modelMeasures("garmin_vivo", "skin_temp_delta_c")).toBe(false);
    // WHOOP: sem passos nem VO₂máx; Polar sem SpO₂
    expect(modelMeasures("whoop", "steps")).toBe(false);
    expect(modelMeasures("whoop", "vo2max")).toBe(false);
    expect(modelMeasures("polar", "spo2_night_avg")).toBe(false);
    // índice da marca por API só onde existe
    expect(MODEL_INFO.garmin_fenix.vendorIndex).toBe("body_battery");
    expect(MODEL_INFO.apple_s12.vendorIndex).toBeNull();
    expect(MODEL_INFO.oura.vendorIndex).toBe("readiness_vendor");
  });

  it("todo modelo mede sono e treino; nomes de seções, marcas e listas existem nos 3 idiomas", () => {
    for (const model of WATCH_MODELS) {
      const codes = metricsForModel(model).map((d) => d.code);
      expect(codes).toContain("sleep_asleep_min");
      expect(codes).toContain("workout_count");
    }
    for (const locale of LOCALES) {
      const m = messages[locale];
      for (const s of DETAIL_SECTIONS) expect(m.sections[s]).toBeTruthy();
      for (const b of CONNECT_BRANDS) expect(m.brands[b]).toBeTruthy();
      for (const b of VENDOR_ONLY_BRANDS) expect(m.vendorOnly[b]).toBeTruthy();
      for (const k of EXCLUDED_REGULATED) expect(m.regulated[k]).toBeTruthy();
      for (const k of EXCLUDED_ON_DEMAND) expect(m.onDemand[k]).toBeTruthy();
      for (const k of EXCLUDED_MANUAL) expect(m.manual[k]).toBeTruthy();
      for (const s of DETAIL_SECTIONS) expect(m.howMeasured[s]).toBeTruthy();
    }
  });

  it("'Sinais da noite' só tem leituras do sono; FC, VFC e respiração do dia ficam em Atividade", () => {
    const vitals = METRICS.filter((d) => d.section === "vitals").map((d) => d.code);
    expect(vitals.every((code) => !/_day_|^hr_(avg|min|max|walking)/.test(code)), vitals.join(",")).toBe(true);
    for (const code of ["hr_avg", "hr_min", "hr_max", "hr_walking_avg", "hrv_day_avg", "resp_rate_day_avg"]) expect(metricDef(code)?.section, code).toBe("activity");
  });

  it("metas do relógio são marcadas (sem 'faixa habitual')", () => {
    const goals = METRICS.filter((d) => "goal" in d && d.goal).map((d) => d.code).sort();
    expect(goals).toEqual(["exercise_goal_min", "floors_goal", "intensity_goal_week_min", "move_goal_kcal", "stand_goal_h", "steps_goal"]);
  });

  it("nome do app de sincronização vem das mensagens e muda por idioma (Saúde / Health / Salud)", () => {
    for (const locale of LOCALES) {
      const apps = messages[locale].syncApps;
      for (const info of Object.values(MODEL_INFO)) expect(apps[info.syncApp], `${locale}:${info.syncApp}`).toBeTruthy();
    }
    expect(MODEL_INFO.apple_s12.syncApp).toBe("appleHealth");
    expect([messages["pt-BR"].syncApps.appleHealth, messages.en.syncApps.appleHealth, messages.es.syncApps.appleHealth]).toEqual(["Saúde", "Health", "Salud"]);
  });
});
