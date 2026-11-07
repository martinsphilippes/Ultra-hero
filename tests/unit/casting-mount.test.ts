import { describe, expect, it } from "vitest";
import {
  bestByCount,
  evaluateCast,
  FOLLOWER_REACH_RATE,
  GOAL_WEIGHTS,
  heroMetrics,
  scoreHeroes,
  splitCastFees,
  STALE_DAYS,
  suggestCasts,
  whyNoSuggestion,
  type CastContext,
  type CastHeroInput,
} from "@/lib/casting/mount";

// Montador de elenco (0096): alcance estimado, aderência de público, custo por mil e combinações que cabem no orçamento.

const TODAY = new Date(Date.UTC(2026, 10, 3));
const CTX: CastContext = { networks: ["instagram"], target_age_bands: ["18-24"], target_states: ["RJ"], segment_ids: [], period_start: null, period_end: null };

function hero(id: string, over: Partial<CastHeroInput> & { reach?: number; eng?: number | null; fee?: number | null; age?: Record<string, number> | null; states?: string[] | null; asOf?: string } = {}): CastHeroInput {
  const { reach = 10_000, eng = 300, fee = 100_000, age = { "18-24": 5000 }, states = ["RJ"], asOf = "2026-10-20", ...rest } = over;
  return {
    talent_id: id,
    name: `Hero ${id}`,
    availability: "available",
    blocked: false,
    consent_ok: true,
    in_cast: false,
    segments: [],
    accounts: [{ network: "instagram", followers: reach * 5, avg_views: null, avg_reach: reach, engagement_bp: eng, as_of: asOf, age, top_states: states }],
    rating: { count: 4, quality_avg: 4.5, on_time_pct: 100 },
    fee_source: "past",
    fee_cents: fee,
    cost_bp: null,
    ...rest,
  };
}

describe("métricas por Hero", () => {
  it("alcance vem do alcance médio, depois das visualizações, depois dos seguidores (sinalizado)", () => {
    const base = hero("a");
    base.accounts = [{ network: "instagram", followers: 100_000, avg_views: null, avg_reach: null, engagement_bp: 200, as_of: "2026-10-01", age: null, top_states: null }];
    const m = heroMetrics(base, CTX, TODAY);
    expect(m.reach).toBe(Math.round(100_000 * FOLLOWER_REACH_RATE));
    expect(m.flags).toContain("followers_estimate");
    base.accounts[0].avg_views = 40_000;
    const v = heroMetrics(base, CTX, TODAY);
    expect(v.reach).toBe(40_000);
    expect(v.flags).toContain("views_estimate");
    base.accounts[0].avg_reach = 25_000;
    const r = heroMetrics(base, CTX, TODAY);
    expect(r.reach).toBe(25_000);
    expect(r.flags).not.toContain("views_estimate");
  });

  it("só conta as redes da campanha; sem conta nelas fica fora das sugestões", () => {
    const h = hero("a");
    h.accounts[0].network = "tiktok";
    const m = heroMetrics(h, CTX, TODAY);
    expect(m.reach).toBe(0);
    expect(m.flags).toContain("no_network");
    expect(m.eligible).toBe(false);
    // campanha sem rede definida: todas valem
    expect(heroMetrics(h, { ...CTX, networks: [] }, TODAY).reach).toBe(10_000);
  });

  it("aderência combina faixa etária, estados e segmento; sem dado fica nula e é sinalizada", () => {
    expect(heroMetrics(hero("a", { age: { "18-24": 8000, "25-34": 2000 }, states: ["RJ", "SP"] }), CTX, TODAY).fit).toBeCloseTo((0.8 + 1) / 2, 5);
    expect(heroMetrics(hero("a", { age: { "25-34": 10000 }, states: ["SP"] }), CTX, TODAY).fit).toBe(0);
    const noData = heroMetrics(hero("a", { age: null, states: null }), CTX, TODAY);
    expect(noData.fit).toBeNull();
    expect(noData.flags).toContain("no_audience");
    expect(noData.qualifiedReach).toBe(10_000 * 0.5);
    const seg = heroMetrics(hero("a", { age: null, states: null, segments: ["s1"] }), { ...CTX, target_age_bands: [], target_states: [], segment_ids: ["s1"] }, TODAY);
    expect(seg.fit).toBe(1);
    // campanha sem público: nada a comparar e nada a sinalizar
    const open = heroMetrics(hero("a"), { ...CTX, target_age_bands: [], target_states: [] }, TODAY);
    expect(open.fit).toBeNull();
    expect(open.flags).not.toContain("no_audience");
  });

  it("engajamento ausente vira aviso e zera só o que depende dele", () => {
    const m = heroMetrics(hero("a", { eng: null }), CTX, TODAY);
    expect(m.engagementRate).toBeNull();
    expect(m.flags).toContain("no_engagement");
    expect(m.engaged).toBe(0);
    expect(m.reach).toBe(10_000);
  });

  it("dado antigo é sinalizado com a data mais antiga das redes usadas", () => {
    const old = new Date(TODAY.getTime() - (STALE_DAYS + 5) * 86_400_000).toISOString().slice(0, 10);
    const m = heroMetrics(hero("a", { asOf: old }), CTX, TODAY);
    expect(m.flags).toContain("stale");
    expect(m.dataAsOf).toBe(old);
    expect(m.dataAgeDays).toBe(STALE_DAYS + 5);
    expect(heroMetrics(hero("a", { asOf: "2026-10-30" }), CTX, TODAY).flags).not.toContain("stale");
  });

  it("elegível só com dados, cachê, consentimento e disponibilidade nas datas", () => {
    expect(heroMetrics(hero("a"), CTX, TODAY).eligible).toBe(true);
    expect(heroMetrics(hero("a", { fee: null }), CTX, TODAY)).toMatchObject({ eligible: false, flags: expect.arrayContaining(["no_fee"]) });
    expect(heroMetrics(hero("a", { blocked: true }), CTX, TODAY)).toMatchObject({ eligible: false, flags: expect.arrayContaining(["blocked"]) });
    expect(heroMetrics(hero("a", { availability: "unavailable" }), CTX, TODAY).eligible).toBe(false);
    expect(heroMetrics(hero("a", { availability: "limited" }), CTX, TODAY)).toMatchObject({ eligible: true, flags: expect.arrayContaining(["limited"]) });
    expect(heroMetrics(hero("a", { consent_ok: false }), CTX, TODAY)).toMatchObject({ eligible: false, flags: expect.arrayContaining(["no_consent"]) });
    expect(heroMetrics(hero("a", { reach: 0 }), CTX, TODAY).flags).toContain("no_data");
  });

  it("gestor: o custo vem em pontos-base e o cálculo é o mesmo", () => {
    const h = hero("a", { fee: null });
    h.cost_bp = 2500;
    expect(heroMetrics(h, CTX, TODAY)).toMatchObject({ cost: 2500, eligible: true });
  });

  it("confiança sobe com a nota e as entregas no prazo; sem nota é neutra e sinalizada", () => {
    // 0126: nota de 0 a 10
    const good = heroMetrics(hero("a", { rating: { count: 5, quality_avg: 10, on_time_pct: 100 } }), CTX, TODAY).reliability;
    const bad = heroMetrics(hero("a", { rating: { count: 5, quality_avg: 0, on_time_pct: 0 } }), CTX, TODAY).reliability;
    const none = heroMetrics(hero("a", { rating: { count: 0, quality_avg: null, on_time_pct: null } }), CTX, TODAY);
    expect(good).toBeCloseTo(1, 5);
    expect(bad).toBeCloseTo(0.85, 5);
    expect(none.reliability).toBeGreaterThan(bad);
    expect(none.reliability).toBeLessThan(good);
    expect(none.flags).toContain("no_rating");
  });
});

describe("valor por objetivo", () => {
  const heroes = [
    hero("big", { reach: 100_000, eng: 100, age: { "18-24": 1000 }, states: ["SP"], fee: 500_000 }),
    hero("fit", { reach: 20_000, eng: 200, age: { "18-24": 9000 }, states: ["RJ"], fee: 100_000 }),
    hero("eng", { reach: 10_000, eng: 2500, age: { "18-24": 3000 }, states: ["RJ"], fee: 80_000 }),
  ];
  const best = (goal: keyof typeof GOAL_WEIGHTS) => {
    const s = scoreHeroes(heroes, CTX, GOAL_WEIGHTS[goal], TODAY);
    return s.reduce((a, b) => (b.value > a.value ? b : a)).id;
  };
  it("cada objetivo favorece o Hero certo", () => {
    expect(best("reach")).toBe("big");
    expect(best("audience")).toBe("fit");
    expect(best("engagement")).toBe("eng");
  });
  it("pesos todos zero valem como mix", () => {
    const zero = scoreHeroes(heroes, CTX, { reach: 0, engagement: 0, fit: 0, response: 0 }, TODAY);
    expect(zero.every((m) => m.value > 0)).toBe(true);
  });
  it("custo por mil alcançados", () => {
    const m = scoreHeroes([hero("a", { reach: 50_000, fee: 100_000 })], CTX, GOAL_WEIGHTS.reach, TODAY)[0];
    expect(m.costPerThousand).toBeCloseTo(2000, 5);
  });
});

describe("mochila com contagem", () => {
  it("acha o ótimo (confere com a força bruta) e respeita o orçamento", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let round = 0; round < 40; round++) {
      const n = 3 + Math.floor(rnd() * 8);
      const items = Array.from({ length: n }, (_, i) => ({ id: `i${i}`, value: 0.1 + rnd(), cost: Math.floor(1 + rnd() * 90) * 1000 }));
      const budget = 100_000 + Math.floor(rnd() * 150_000);
      const result = bestByCount(items, budget, 4);
      for (let k = 1; k <= 4; k++) {
        let opt = -1;
        for (let mask = 1; mask < 1 << n; mask++) {
          const pick = items.filter((_, i) => mask & (1 << i));
          if (pick.length !== k) continue;
          if (pick.reduce((s, x) => s + x.cost, 0) > budget) continue;
          opt = Math.max(opt, pick.reduce((s, x) => s + x.value, 0));
        }
        const got = result.get(k);
        if (opt < 0) {
          expect(got).toBeUndefined();
        } else {
          expect(got).toBeDefined();
          const ids = got as string[];
          expect(ids).toHaveLength(k);
          expect(new Set(ids).size).toBe(k);
          expect(ids.reduce((s, id) => s + (items.find((x) => x.id === id)?.cost ?? 0), 0)).toBeLessThanOrEqual(budget);
          // os baldes arredondam o custo para cima: perde no máximo uma fração mínima do ótimo
          expect(ids.reduce((s, id) => s + (items.find((x) => x.id === id)?.value ?? 0), 0)).toBeGreaterThanOrEqual(opt * 0.97);
        }
      }
    }
  });
  it("ignora o que não cabe sozinho e funciona sem itens", () => {
    expect(bestByCount([{ id: "a", value: 1, cost: 500 }], 100, 3).size).toBe(0);
    expect(bestByCount([], 100, 3).size).toBe(0);
    expect(bestByCount([{ id: "z", value: 1, cost: 0 }], 100, 3).get(1)).toEqual(["z"]);
  });
});

describe("combinações sugeridas", () => {
  const pool = [
    hero("g1", { reach: 200_000, fee: 600_000, eng: 150 }),
    hero("m1", { reach: 60_000, fee: 200_000, eng: 400 }),
    hero("m2", { reach: 55_000, fee: 190_000, eng: 380 }),
    hero("m3", { reach: 50_000, fee: 180_000, eng: 420 }),
    hero("p1", { reach: 12_000, fee: 40_000, eng: 700 }),
    hero("p2", { reach: 11_000, fee: 35_000, eng: 650 }),
    hero("p3", { reach: 9_000, fee: 30_000, eng: 800 }),
    hero("p4", { reach: 8_000, fee: 28_000, eng: 750 }),
  ];
  const metrics = scoreHeroes(pool, CTX, GOAL_WEIGHTS.mix, TODAY);

  it("sugere um nome forte, poucos médios e um mix, todos dentro do orçamento", () => {
    const budget = 700_000;
    const s = suggestCasts(metrics, budget);
    expect(s.map((x) => x.strategy)).toEqual(["solo", "few", "mix"]);
    expect(s[0].totals.count).toBe(1);
    expect(s[1].totals.count).toBe(3);
    expect(s[2].totals.count).toBeGreaterThanOrEqual(4);
    for (const x of s) {
      expect(x.totals.cost).toBeLessThanOrEqual(budget);
      expect(x.totals.leftover).toBe(budget - x.totals.cost);
      expect(x.totals.overBudget).toBe(false);
      expect(x.reasons.length).toBeGreaterThan(0);
      expect(x.reasons[0].code).toMatch(/^(solo|few|mix)$/);
    }
    // nenhuma combinação repetida
    const keys = s.map((x) => [...x.totals.ids].sort().join(","));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("respeita o máximo de Heros", () => {
    const s = suggestCasts(metrics, 700_000, { maxHeroes: 2 });
    expect(s.every((x) => x.totals.count <= 2)).toBe(true);
    expect(s.length).toBeGreaterThan(0);
  });

  it("orçamento pequeno: só cabem os baratos; sem nada que caiba, nenhuma sugestão", () => {
    const small = suggestCasts(metrics, 70_000);
    expect(small.length).toBeGreaterThan(0);
    expect(small.every((x) => x.totals.ids.every((id) => id.startsWith("p")))).toBe(true);
    expect(suggestCasts(metrics, 10_000)).toEqual([]);
    expect(whyNoSuggestion(metrics, 0)).toBe("no_budget");
    expect(whyNoSuggestion(scoreHeroes([hero("a", { fee: null })], CTX, GOAL_WEIGHTS.mix, TODAY), 100_000)).toBe("no_eligible");
    expect(whyNoSuggestion(metrics, 10_000)).toBe("none_fits");
  });

  it("Heros inelegíveis nunca entram", () => {
    const blocked = scoreHeroes([...pool, hero("x", { reach: 900_000, fee: 10_000, blocked: true })], CTX, GOAL_WEIGHTS.reach, TODAY);
    const s = suggestCasts(blocked, 700_000);
    expect(s.every((x) => !x.totals.ids.includes("x"))).toBe(true);
  });

  it("com poucos Heros, não repete a mesma combinação", () => {
    const two = scoreHeroes([hero("a", { fee: 50_000 }), hero("b", { fee: 50_000, reach: 5_000 })], CTX, GOAL_WEIGHTS.reach, TODAY);
    const s = suggestCasts(two, 120_000);
    const keys = s.map((x) => [...x.totals.ids].sort().join(","));
    expect(new Set(keys).size).toBe(keys.length);
    expect(s.length).toBeLessThanOrEqual(3);
  });

  it("explica no texto o que cada uma tem de melhor", () => {
    const s = suggestCasts(metrics, 700_000);
    const codes = s.flatMap((x) => x.reasons.map((r) => r.code));
    expect(codes).toContain("uses_budget");
    expect(codes).toEqual(expect.arrayContaining(["lowest_cpm"]));
  });
});

describe("ajuste manual", () => {
  const metrics = scoreHeroes([hero("a", { fee: 300_000, reach: 40_000 }), hero("b", { fee: 250_000, reach: 30_000 }), hero("c", { fee: null, reach: 20_000 })], CTX, GOAL_WEIGHTS.reach, TODAY);
  it("orçamento usado, sobra e custo por mil em tempo real", () => {
    const t = evaluateCast(metrics, ["a", "b"], 700_000);
    expect(t.cost).toBe(550_000);
    expect(t.leftover).toBe(150_000);
    expect(t.usedPct).toBe(79);
    expect(t.reach).toBe(70_000);
    expect(t.costPerThousand).toBeCloseTo((550_000 / 70_000) * 1000, 5);
    expect(t.overBudget).toBe(false);
  });
  it("passar do orçamento aparece, e Hero sem cachê é avisado", () => {
    const t = evaluateCast(metrics, ["a", "b", "c"], 500_000);
    expect(t.overBudget).toBe(true);
    expect(t.leftover).toBeLessThan(0);
    expect(t.missingFee).toEqual(["Hero c"]);
  });
  it("elenco vazio ou id desconhecido não quebra", () => {
    const t = evaluateCast(metrics, ["zzz"], 100);
    expect(t.count).toBe(0);
    expect(t.costPerThousand).toBeNull();
    expect(t.fit).toBeNull();
  });
});

describe("repartição ao usar o elenco", () => {
  it("soma exatamente o total, proporcional ao cachê de referência", () => {
    const parts = splitCastFees(1_000_000, [400_000, 200_000, 100_000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_000);
    expect(parts[0]).toBeGreaterThan(parts[1]);
  });
  it("sem referência divide igual; referência faltando usa a média dos outros", () => {
    expect(splitCastFees(100, [null, null])).toEqual([50, 50]);
    const p = splitCastFees(900, [200, null, 400]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(900);
    expect(p[1]).toBeGreaterThan(p[0] - 1);
  });
});
