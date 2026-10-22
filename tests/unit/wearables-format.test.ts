import { describe, expect, it } from "vitest";
import { clearLegacyTodayStorage, LEGACY_TODAY_MARKER, type StorageLike } from "@/lib/routine/local-cleanup";
import { formatClock, formatDistance, formatDuration, formatMetric, formatNoonClock, formatPace, formatPercent, formatTempDelta, formatYears } from "@/lib/wearables/format";

// Formatação nos 3 idiomas (km, kcal e °C em todos) e a limpeza local do Hoje antigo.

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("formatação dos valores do relógio", () => {
  it("duração: '7 h 10 min' em pt, '7 h 10 m' em en/es; menos de 1 h só minutos", () => {
    expect(formatDuration(430, "pt-BR")).toBe("7 h 10 min");
    expect(formatDuration(430, "en")).toBe("7 h 10 m");
    expect(formatDuration(430, "es")).toBe("7 h 10 m");
    expect(formatDuration(42, "en")).toBe("42 min");
    expect(formatDuration(120, "pt-BR")).toBe("2 h");
  });

  it("horário: 24 h em pt/es, 12 h em en; minutos desde o meio-dia para o sono", () => {
    expect(formatClock(462, "pt-BR")).toBe("07:42");
    expect(formatClock(462, "es")).toBe("07:42");
    expect(nbsp(formatClock(462, "en"))).toBe("07:42 AM");
    expect(formatNoonClock(700, "pt-BR")).toBe("23:40");
    expect(formatNoonClock(1138, "pt-BR")).toBe("06:58");
  });

  it("números no idioma: milhar, decimal e unidades métricas", () => {
    expect(formatMetric("steps", 1912, "pt-BR")).toBe("1.912");
    expect(formatMetric("steps", 1912, "en")).toBe("1,912");
    expect(formatDistance(7800, "pt-BR")).toBe("7,80 km");
    expect(formatDistance(12_340, "en")).toBe("12.3 km");
    expect(formatDistance(640, "es")).toBe("640 m");
    expect(formatMetric("active_kcal", 312, "es")).toBe("312 kcal");
    expect(formatMetric("hr_resting", 54, "en")).toBe("54 bpm");
    expect(formatMetric("resp_rate_sleep", 14.2, "pt-BR")).toBe("14,2 rpm");
    expect(formatMetric("vo2max", 44.8, "pt-BR")).toBe("44,8 mL/kg·min");
    expect(formatMetric("sleep_asleep_min", 430, "pt-BR")).toBe("7 h 10 min");
  });

  it("temperatura com sinal, ritmo, porcentagem e anos", () => {
    expect(formatTempDelta(0.1, "pt-BR")).toBe("+0,1 °C");
    expect(formatTempDelta(-0.34, "en")).toBe("−0.3 °C");
    expect(formatTempDelta(0, "es")).toBe("±0,0 °C");
    expect(formatPace(323)).toBe("5:23 /km");
    expect(nbsp(formatPercent(96, "pt-BR"))).toBe("96%");
    expect(nbsp(formatPercent(96, "es"))).toBe("96 %");
    expect(formatYears(34, "pt-BR")).toBe("34 anos");
    expect(formatYears(34, "en")).toBe("34 years");
    expect(formatYears(34, "es")).toBe("34 años");
  });
});

function memoryStorage(initial: Record<string, string>): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("limpeza local do Hoje antigo", () => {
  it("apaga hidratação e descanso (uh:today:*) uma vez, sem tocar no resto", () => {
    const storage = memoryStorage({
      "uh:today:2026-10-20:hydration": '{"ml":750}',
      "uh:today:2026-10-21:rest": '{"rested":true,"hours":7}',
      "uh:today:hydration-goal": "2000",
      "uh-theme": "dark",
      "uh-cook:abc:def": "{}",
    });
    expect(clearLegacyTodayStorage(storage)).toBe(3);
    expect(Array.from(storage.data.keys()).sort()).toEqual(["uh-cook:abc:def", "uh-theme", LEGACY_TODAY_MARKER].sort());
    // segunda vez não faz nada
    storage.data.set("uh:today:2026-10-22:hydration", "1");
    expect(clearLegacyTodayStorage(storage)).toBe(0);
  });

  it("tolera storage ausente ou que lança", () => {
    expect(clearLegacyTodayStorage(null)).toBe(0);
    const broken = { length: 1, key: () => "uh:today:x", getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } } as StorageLike;
    expect(clearLegacyTodayStorage(broken)).toBe(0);
  });
});
