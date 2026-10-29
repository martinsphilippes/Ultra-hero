import { describe, expect, it } from "vitest";
import { baseline, compare, disposition, dispositionBand, DISPOSITION_WEIGHTS, edwardsTrimp, mad, median, nightVitals, sleepEfficiency, sleepRegularity, trainingLoad } from "@/lib/wearables/derived";

// Índices calculados pelo Groscove Ultra (§13.4) e linha de base pessoal (RN-07).

const steady = (v: number, n = 20) => Array.from({ length: n }, (_, i) => v + ((i % 5) - 2));

describe("linha de base pessoal", () => {
  it("mediana e MAD", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it("precisa de 7 dias válidos; usa os últimos 28; ignora vazios", () => {
    expect(baseline([1, 2, 3, 4, 5, 6])).toBeNull();
    expect(baseline([1, 2, null, 3, 4, 5, 6, undefined, 7])?.n).toBe(7);
    expect(baseline(Array.from({ length: 40 }, (_, i) => i))?.n).toBe(28);
  });

  it("banda = mediana ± desvio robusto, com piso", () => {
    const b = baseline([50, 50, 50, 50, 50, 50, 50], 2)!;
    expect(b).toMatchObject({ median: 50, spread: 2, low: 48, high: 52 });
    expect(compare(47, b)).toBe("below");
    expect(compare(50, b)).toBe("within");
    expect(compare(53, b)).toBe("above");
    expect(compare(50, null)).toBe("learning");
    expect(compare(null, b)).toBe("learning");
  });
});

describe("Disposição Groscove Ultra", () => {
  const base = { asleepHistory: steady(450), hrvHistory: steady(50), restingHrHistory: steady(56), efficiencyHistory: steady(93) };

  it("faixas: abaixo (< 40), no (40–69), acima (≥ 70) do seu habitual", () => {
    expect(dispositionBand(39)).toBe("below");
    expect(dispositionBand(40)).toBe("within");
    expect(dispositionBand(69)).toBe("within");
    expect(dispositionBand(70)).toBe("above");
  });

  it("noite melhor que o habitual sobe; pior desce", () => {
    const good = disposition({ ...base, asleepMin: 500, hrvNight: 62, restingHr: 52, efficiencyPct: 96 })!;
    const usual = disposition({ ...base, asleepMin: 450, hrvNight: 50, restingHr: 56, efficiencyPct: 93 })!;
    const bad = disposition({ ...base, asleepMin: 360, hrvNight: 38, restingHr: 62, efficiencyPct: 86 })!;
    expect(good.score).toBeGreaterThan(usual.score);
    expect(usual.score).toBeGreaterThan(bad.score);
    expect(usual.band).toBe("within");
    expect(good.band).toBe("above");
    expect(bad.band).toBe("below");
    expect(good.score).toBeLessThanOrEqual(100);
    expect(bad.score).toBeGreaterThanOrEqual(0);
  });

  it("sem VFC e sem FC de repouso não calcula (ex.: Galaxy); sem 7 noites também não", () => {
    expect(disposition({ asleepMin: 450, asleepHistory: steady(450) })).toBeNull();
    expect(disposition({ asleepMin: 450, asleepHistory: steady(450, 5), hrvNight: 50, hrvHistory: steady(50, 5) })).toBeNull();
  });

  it("ausência redistribui os pesos (somam 1) e carga/temperatura só penalizam", () => {
    const r = disposition({ ...base, asleepMin: 450, restingHr: 56 })!;
    expect(r.components.map((c) => c.key).sort()).toEqual(["rhr", "sleep"]);
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 10);
    expect(r.components.find((c) => c.key === "sleep")!.weight).toBeCloseTo(DISPOSITION_WEIGHTS.sleep / (DISPOSITION_WEIGHTS.sleep + DISPOSITION_WEIGHTS.rhr));
    const calm = disposition({ ...base, asleepMin: 450, hrvNight: 50, restingHr: 56, loadRatio: 1, tempDelta: 0.1 })!;
    const loaded = disposition({ ...base, asleepMin: 450, hrvNight: 50, restingHr: 56, loadRatio: 1.8, tempDelta: 0.7 })!;
    expect(calm.components.find((c) => c.key === "load")!.z).toBe(0);
    expect(loaded.score).toBeLessThan(calm.score);
  });
});

describe("Sinais da noite, carga e sono", () => {
  it("conta quantos componentes estão na faixa; sem linha de base, 'aprendendo'; ausente, some", () => {
    const r = nightVitals([
      { code: "hr_resting", value: 56, history: steady(56) },
      { code: "hrv_night", value: 20, history: steady(50) },
      { code: "resp_rate_sleep", value: 14, history: [14, 14] },
      { code: "spo2_night_avg", value: null, history: steady(96) },
    ])!;
    expect(r.components.map((c) => [c.code, c.comparison])).toEqual([
      ["hr_resting", "within"],
      ["hrv_night", "below"],
      ["resp_rate_sleep", "learning"],
    ]);
    expect(r).toMatchObject({ within: 1, total: 2 });
    expect(nightVitals([{ code: "hr_resting", value: null, history: [] }])).toBeNull();
  });

  it("TRIMP de Edwards: Σ minutos na zona × número da zona", () => {
    expect(edwardsTrimp([10, 10, 10, 10, 10])).toBe(150);
    expect(edwardsTrimp([60, 0, 0, 0, 0])).toBe(60);
    expect(edwardsTrimp([-5, 0, 0, 0, 2])).toBe(10);
  });

  it("carga 7 e 28 dias e razão", () => {
    expect(trainingLoad([])).toEqual({ acute: 0, chronic: 0, ratio: null });
    const loads = [...Array(21).fill(50), ...Array(7).fill(100)];
    expect(trainingLoad(loads)).toEqual({ acute: 100, chronic: 63, ratio: 1.6 });
  });

  it("eficiência e regularidade do sono", () => {
    expect(sleepEfficiency(450, 30)).toBe(94);
    expect(sleepEfficiency(0, 0)).toBe(0);
    expect(sleepRegularity([900, 900, 900, 900, 900, 900])).toBeNull();
    expect(sleepRegularity(Array(13).fill(900))).toBe(100);
    expect(sleepRegularity([800, 1000, 820, 980, 900, 840, 960, 870, 930, 810, 990, 880, 920])!).toBeLessThan(50);
  });
});
