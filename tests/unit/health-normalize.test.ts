import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dedupWorkouts, overlapRatio, priorityGroup, resolveDaily, type RpcDaily } from "@/lib/health/dedup";
import { batchToJson, isStoredMetric, validateBatch } from "@/lib/health/normalize";
import { emptyBatch, type NormalizedBatch } from "@/lib/health/types";
import { METRICS } from "@/lib/wearables/catalog";

// Normalizador (validação antes de gravar), deduplicação entre fontes (§9.6) e espelho do
// catálogo TS ↔ seed SQL da 0038.

const base = (): NormalizedBatch => emptyBatch("garmin", 1);

describe("validateBatch: catálogo, consentimento, plausibilidade (RN-12) e códigos enumerados", () => {
  it("categoria não consentida cai com código; consentida passa", () => {
    const b = { ...base(), daily: [{ date: "2026-10-22", code: "steps" as const, value: 9000 }, { date: "2026-10-22", code: "hr_resting" as const, value: 52 }] };
    const r = validateBatch(b, ["heart"]);
    expect(r.batch.daily.map((d) => d.code)).toEqual(["hr_resting"]);
    expect(r.dropped).toEqual(["category_not_consented:activity"]);
  });

  it("fora da faixa plausível cai sem levar o valor ao log", () => {
    const r = validateBatch({ ...base(), daily: [{ date: "2026-10-22", code: "hr_resting", value: 300 }] }, ["heart"]);
    expect(r.batch.daily).toEqual([]);
    expect(r.dropped).toEqual(["plaus_out_of_range:hr_resting"]);
    expect(r.dropped.join()).not.toContain("300");
  });

  it("índice nosso, agregado de treino ou código inventado nunca são gravados", () => {
    const r = validateBatch(
      {
        ...base(),
        daily: [
          { date: "2026-10-22", code: "disposition_uh", value: 60 },
          { date: "2026-10-22", code: "workout_count", value: 1 },
          { date: "2026-10-22", code: "hydration_ml" as never, value: 500 },
        ],
      },
      ["readiness", "workout", "activity"],
    );
    expect(r.batch.daily).toEqual([]);
    expect(r.dropped).toEqual(["not_stored:disposition_uh", "not_stored:workout_count", "not_stored:hydration_ml"]);
  });

  it("um valor por dia e métrica dentro do lote: o mais recente vence (RN-10)", () => {
    const r = validateBatch(
      {
        ...base(),
        daily: [
          { date: "2026-10-22", code: "body_battery_now", value: 70, updated: "2026-10-22T10:00:00Z" },
          { date: "2026-10-22", code: "body_battery_now", value: 58, updated: "2026-10-22T11:00:00Z" },
          { date: "2026-10-22", code: "body_battery_now", value: 90, updated: "2026-10-22T09:00:00Z" },
        ],
      },
      ["readiness"],
    );
    expect(r.batch.daily).toHaveLength(1);
    expect(r.batch.daily[0].value).toBe(58);
  });

  it("sono e treino: exigem a categoria e coerência (fim depois do início, origem do aparelho)", () => {
    const sleep = { ext: "s", date: "2026-10-22", start: "2026-10-22T02:00:00Z", end: "2026-10-22T09:00:00Z", main: true, nap: false, asleep: 400 };
    const workout = { ext: "w", date: "2026-10-22", sport: "run", origin: "started_on_device" as const, start: "2026-10-22T10:00:00Z", end: "2026-10-22T10:30:00Z", dur: 1800, avgHr: 300 };
    expect(validateBatch({ ...base(), sleep: [sleep], workouts: [workout] }, ["heart"]).dropped).toEqual(["category_not_consented:sleep", "category_not_consented:workout"]);
    const ok = validateBatch({ ...base(), sleep: [sleep, { ...sleep, ext: "bad", end: "2026-10-22T01:00:00Z" }], workouts: [workout, { ...workout, ext: "m", origin: "manual" as never }] }, ["sleep", "workout"]);
    expect(ok.batch.sleep.map((s) => s.ext)).toEqual(["s"]);
    expect(ok.batch.workouts.map((w) => w.ext)).toEqual(["w"]);
    // FC impossível some do treino (sem zero fabricado)
    expect(ok.batch.workouts[0].avgHr).toBeUndefined();
    expect(ok.dropped).toEqual(["invalid:sleep_session", "invalid:workout"]);
  });

  it("JSON para o banco sem chaves indefinidas", () => {
    const json = batchToJson({ ...base(), daily: [{ date: "2026-10-22", code: "steps", value: 1, at: undefined }] });
    expect(json).toEqual({ device: null, daily: [{ date: "2026-10-22", code: "steps", value: 1 }], sleep: [], workouts: [], deletions: [] });
  });
});

describe("uma fonte por métrica e dia (§9.6)", () => {
  const row = (p: RpcDaily["p"], c: string, v: number, extra: Partial<RpcDaily> = {}): RpcDaily => ({ d: "2026-10-22", c, v, s: null, l: null, m: null, n: null, at: null, cov: null, conn: `c-${p}`, p, u: "2026-10-22T10:00:00Z", ...extra });

  it("noite: anel (Oura) > WHOOP > relógio; dia: relógio de pulso (Garmin) > anel; nunca soma", () => {
    const out = resolveDaily([row("garmin", "sleep_asleep_min", 400), row("oura", "sleep_asleep_min", 430), row("garmin", "steps", 9000), row("oura", "steps", 9900), row("whoop", "hrv_night", 40), row("garmin", "hrv_night", 50)]);
    const day = out.get("2026-10-22")!;
    expect(day.get("sleep_asleep_min")!.p).toBe("oura");
    expect(day.get("steps")!.v).toBe(9000);
    expect(day.get("hrv_night")!.p).toBe("whoop");
    expect(priorityGroup("skin_temp_delta_c")).toBe("night");
    expect(priorityGroup("active_kcal")).toBe("activity");
    expect(priorityGroup("stress_avg")).toBe("other");
  });

  it("mesma prioridade: maior cobertura, depois o mais recente", () => {
    const out = resolveDaily([row("garmin", "steps", 1, { conn: "a", cov: 40 }), row("garmin", "steps", 2, { conn: "b", cov: 90 })]);
    expect(out.get("2026-10-22")!.get("steps")!.v).toBe(2);
    const recent = resolveDaily([row("polar", "steps", 1, { conn: "a", u: "2026-10-22T08:00:00Z" }), row("polar", "steps", 2, { conn: "b", u: "2026-10-22T09:00:00Z" })]);
    expect(recent.get("2026-10-22")!.get("steps")!.v).toBe(2);
  });

  it("treinos: mesma sessão em duas fontes (≥ 70% e mesmo esporte) fica uma só, a de maior prioridade", () => {
    const w = (p: RpcDaily["p"], sport: string, start: string, end: string) => ({ p, sport, start, end, id: `${p}-${start}` });
    const kept = dedupWorkouts([
      w("whoop", "run", "2026-10-22T10:02:00Z", "2026-10-22T10:40:00Z"),
      w("garmin", "run", "2026-10-22T10:00:00Z", "2026-10-22T10:42:00Z"),
      w("oura", "walk", "2026-10-22T18:00:00Z", "2026-10-22T18:30:00Z"),
      w("polar", "cycle", "2026-10-22T10:00:00Z", "2026-10-22T10:42:00Z"),
    ]);
    expect(kept.map((k) => `${k.p}:${k.sport}`)).toEqual(["garmin:run", "polar:cycle", "oura:walk"]);
    expect(overlapRatio({ start: "2026-10-22T10:00:00Z", end: "2026-10-22T11:00:00Z" }, { start: "2026-10-22T10:30:00Z", end: "2026-10-22T12:00:00Z" })).toBe(0.5);
  });
});

describe("catálogo TS ↔ seed SQL (0038)", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0038_health_foundation.sql"), "utf8");
  const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '([a-z]+)', '([a-z_]+)', (true|false), (-?[\d.]+|null), (-?[\d.]+|null)\)/g)].map((m) => ({
    code: m[1],
    category: m[2],
    unit: m[3],
    stored: m[4] === "true",
    plaus: m[5] === "null" ? undefined : [Number(m[5]), Number(m[6])],
  }));

  it("mesmos códigos, categorias, unidades, faixas e o que se grava", () => {
    expect(rows.map((r) => r.code)).toEqual(METRICS.map((d) => d.code));
    for (const def of METRICS) {
      const r = rows.find((x) => x.code === def.code)!;
      expect(r.category, def.code).toBe(def.category);
      expect(r.unit, def.code).toBe(def.unit);
      expect(r.stored, def.code).toBe(isStoredMetric(def.code));
      expect(r.plaus, def.code).toEqual((def as { plaus?: readonly [number, number] }).plaus ? [...(def as { plaus: readonly [number, number] }).plaus] : undefined);
    }
  });
});
