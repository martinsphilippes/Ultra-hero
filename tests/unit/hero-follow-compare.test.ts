import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appMetrics,
  COMPARE_METRIC_DEFS,
  COMPARE_METRICS,
  compareRows,
  compareValues,
  displayPct,
  metricsForTodaySection,
  parseReferenceInput,
  watchMetrics,
} from "@/lib/heroes/compare";
import { feedHref, followReducer, isMissingFollowSchema, parseFeedParam, resolveFeedTab } from "@/lib/heroes/follows";
import type { HistoryDay } from "@/lib/wearables/demo";
import { generateWatchDay } from "@/lib/wearables/demo";

// Seguir heróis e "Você vs Hero" (0056): matemática da comparação, frases, feed e botão.

describe("compareValues", () => {
  it("percentual inteiro da referência e barras relativas ao maior", () => {
    expect(compareValues(6.8, 8)).toEqual({ pct: 85, userBar: 85, refBar: 100, status: "below" });
    expect(compareValues(12000, 10000)).toEqual({ pct: 120, userBar: 100, refBar: 83, status: "above" });
  });
  it("faixa 'na referência' entre 90% e 110%", () => {
    expect(compareValues(9, 10)?.status).toBe("near");
    expect(compareValues(11, 10)?.status).toBe("near");
    expect(compareValues(8.9, 10)?.status).toBe("below");
    expect(compareValues(11.1, 10)?.status).toBe("above");
  });
  it("barras ficam entre 0 e 100 mesmo com valores muito acima (percentual sem teto, frase com teto)", () => {
    const c = compareValues(50000, 1000)!;
    expect(c.pct).toBe(5000);
    expect(c.userBar).toBe(100);
    expect(c.refBar).toBe(2);
    expect(displayPct(c.pct)).toBe("999+");
    expect(displayPct(85)).toBe("85");
  });
  it("zero da pessoa é 0% (não some); referência inválida não compara", () => {
    expect(compareValues(0, 5)).toEqual({ pct: 0, userBar: 0, refBar: 100, status: "below" });
    expect(compareValues(3, 0)).toBeNull();
    expect(compareValues(-1, 5)).toBeNull();
    expect(compareValues(Number.NaN, 5)).toBeNull();
  });
});

describe("parseReferenceInput", () => {
  it("vazio = sem comparação; vírgula decimal; arredonda a 2 casas", () => {
    expect(parseReferenceInput("sleep_hours", "  ")).toEqual({ ok: true, value: null });
    expect(parseReferenceInput("sleep_hours", "7,5")).toEqual({ ok: true, value: 7.5 });
    expect(parseReferenceInput("steps_day", "10000.456")).toEqual({ ok: true, value: 10000.46 });
  });
  it("recusa zero, negativo, texto e acima do teto do banco", () => {
    expect(parseReferenceInput("sleep_hours", "0").ok).toBe(false);
    expect(parseReferenceInput("sleep_hours", "-1").ok).toBe(false);
    expect(parseReferenceInput("sleep_hours", "oito").ok).toBe(false);
    expect(parseReferenceInput("active_days_week", "8").ok).toBe(false);
    expect(parseReferenceInput("active_days_week", "7").ok).toBe(true);
  });
  it("chaves, unidades e tetos iguais aos do check da 0056", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0056_hero_follows_compare.sql"), "utf8");
    for (const key of COMPARE_METRICS) {
      const def = COMPARE_METRIC_DEFS[key];
      expect(sql).toContain(`metric_key = '${key}' and unit = '${def.unit}' and value > 0 and value <= ${def.max})`);
    }
  });
});

const day = (date: string, values: Record<string, number>, partial = false): HistoryDay => ({ date, partial, values });

describe("watchMetrics", () => {
  it("sono das 7 últimas noites em horas; passos e carga só de dias completos; treinos somados", () => {
    const history = [
      day("2026-10-22", { sleep_asleep_min: 300, steps: 99999, cardio_load_day_uh: 999, workout_count: 5 }),
      ...Array.from({ length: 6 }, (_, i) => day(`2026-10-2${3 + i}`, { sleep_asleep_min: 480, steps: 10000, cardio_load_day_uh: 200, workout_count: i % 2 })),
      day("2026-10-29", { sleep_asleep_min: 420, steps: 2000, cardio_load_day_uh: 20, workout_count: 1 }, true),
    ];
    const m = watchMetrics({ history });
    // 6 noites de 8 h + 1 de 7 h
    expect(m.sleep_hours).toBeCloseTo((6 * 480 + 420) / 7 / 60, 5);
    // dias completos: o mais antigo + 6 → os 7 mais recentes completos
    expect(m.steps_day).toBeCloseTo((99999 + 6 * 10000) / 7, 5);
    expect(m.cardio_load_day).toBeCloseTo((999 + 6 * 200) / 7, 5);
    // últimos 7 dias (com hoje): 0+1+0+1+0+1 + 1
    expect(m.workouts_week).toBe(4);
  });
  it("métrica que o relógio não mede fica ausente (nunca zero)", () => {
    expect(watchMetrics({ history: [day("2026-10-29", { sleep_asleep_min: 400 })] })).toEqual({ sleep_hours: 400 / 60 });
  });
  it("funciona com o relógio simulado", () => {
    const m = watchMetrics(generateWatchDay("premium", "2026-10-30", 720));
    expect(m.sleep_hours).toBeGreaterThan(4);
    expect(m.steps_day).toBeGreaterThan(1000);
    expect(typeof m.workouts_week).toBe("number");
  });
});

describe("appMetrics", () => {
  it("dias ativos distintos nos últimos 7 dias; conteúdos e receitas concluídos em 7 dias", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const m = appMetrics({
      activeDates: ["2026-10-30", "2026-10-30", "2026-10-24", "2026-10-23", "2026-11-01"],
      today: "2026-10-30",
      completions: [
        { completedAt: "2026-10-30T10:00:00Z", type: "recipe" },
        { completedAt: "2026-10-25T10:00:00Z", type: "video" },
        { completedAt: "2026-10-20T10:00:00Z", type: "recipe" },
      ],
      now,
    });
    expect(m).toEqual({ active_days_week: 2, contents_week: 2, recipes_week: 1 });
  });
});

describe("compareRows", () => {
  it("só indicadores com referência; sem valor da pessoa a linha vem sem comparação", () => {
    const rows = compareRows({ sleep_hours: 8, steps_day: 12000, recipes_week: 3 }, { sleep_hours: 6.8, recipes_week: 3 });
    expect(rows.map((r) => r.key)).toEqual(["sleep_hours", "steps_day", "recipes_week"]);
    expect(rows[0].comparison?.pct).toBe(85);
    expect(rows[1]).toMatchObject({ user: null, comparison: null });
    expect(rows[2].comparison?.status).toBe("near");
  });
  it("filtra pelos indicadores da seção do Hoje", () => {
    expect(metricsForTodaySection("sleep")).toEqual(["sleep_hours"]);
    expect(metricsForTodaySection("workouts")).toEqual(["workouts_week", "cardio_load_day"]);
    expect(metricsForTodaySection("vitals")).toEqual([]);
    const rows = compareRows({ sleep_hours: 8, steps_day: 12000 }, { sleep_hours: 8, steps_day: 6000 }, metricsForTodaySection("activity"));
    expect(rows.map((r) => r.key)).toEqual(["steps_day"]);
  });
});

describe("feed Seguindo | Todos", () => {
  it("lê a aba da URL", () => {
    expect(parseFeedParam("seguindo")).toBe("seguindo");
    expect(parseFeedParam(["todos", "seguindo"])).toBe("todos");
    expect(parseFeedParam("outra")).toBeNull();
    expect(parseFeedParam(undefined)).toBeNull();
    expect(feedHref("seguindo")).toBe("/inicio?feed=seguindo");
  });
  it("padrão: Seguindo para quem segue alguém, Todos para o resto; a URL manda", () => {
    expect(resolveFeedTab({ param: null, followCount: 2, available: true, signedIn: true })).toBe("seguindo");
    expect(resolveFeedTab({ param: null, followCount: 0, available: true, signedIn: true })).toBe("todos");
    expect(resolveFeedTab({ param: "todos", followCount: 2, available: true, signedIn: true })).toBe("todos");
    expect(resolveFeedTab({ param: "seguindo", followCount: 0, available: true, signedIn: true })).toBe("seguindo");
  });
  it("visitante ou banco sem seguir: sempre Todos", () => {
    expect(resolveFeedTab({ param: "seguindo", followCount: 3, available: false, signedIn: true })).toBe("todos");
    expect(resolveFeedTab({ param: "seguindo", followCount: 0, available: true, signedIn: false })).toBe("todos");
  });
});

describe("followReducer", () => {
  it("alterna e acompanha a contagem", () => {
    expect(followReducer({ following: false, followers: 10 }, { type: "toggle" })).toEqual({ following: true, followers: 11 });
    expect(followReducer({ following: true, followers: 11 }, { type: "toggle" })).toEqual({ following: false, followers: 10 });
  });
  it("set igual ao atual não muda nada; contagem nunca negativa; sem contagem fica null", () => {
    const s = { following: true, followers: 3 };
    expect(followReducer(s, { type: "set", following: true })).toBe(s);
    expect(followReducer({ following: true, followers: 0 }, { type: "set", following: false })).toEqual({ following: false, followers: 0 });
    expect(followReducer({ following: false, followers: null }, { type: "toggle" })).toEqual({ following: true, followers: null });
  });
});

describe("isMissingFollowSchema", () => {
  it("reconhece tabela/coluna ausente do banco e da API", () => {
    for (const code of ["42P01", "42703", "PGRST205", "PGRST204", "PGRST200"]) expect(isMissingFollowSchema({ code })).toBe(true);
    expect(isMissingFollowSchema({ code: "42501" })).toBe(false);
    expect(isMissingFollowSchema(null)).toBe(false);
  });
});
