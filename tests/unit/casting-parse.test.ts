import { describe, expect, it } from "vitest";
import { parseCastInputs } from "@/lib/casting/parse";

// Leitura do json de agency_cast_inputs (0096): tolerante, nunca quebra a tela.

describe("parseCastInputs", () => {
  const raw = {
    can_values: false,
    context: { kind: "deal", title: "Campanha", networks: ["instagram"], target_age_bands: ["18-24"], target_states: ["RJ"], segments: [{ id: "s1", name: "Corrida" }], period_start: "2026-12-01", period_end: null, value_model: "fixo", max_heroes: null, has_budget: true, budget_cents: null, rate_bp: null, fee_budget_cents: null, current: ["t1"] },
    heroes: [
      { talent_id: "t1", name: "Um", availability: "weird", blocked: true, consent_ok: true, in_cast: true, segments: ["s1", 3], accounts: [{ network: "instagram", followers: "1000", avg_reach: 300, engagement_bp: 250, as_of: "2026-10-01", age: { "18-24": 4000, "25-34": "x" }, top_states: ["RJ", 1] }, { network: "tiktok" }], rating: { count: 2, quality_avg: "4.5", on_time_pct: 100 }, fee_source: "past", fee_cents: null, cost_bp: 2500 },
      { name: "sem id" },
      "lixo",
    ],
  };
  it("lê contexto e Heros, ignora linha ruim e número ruim", () => {
    const d = parseCastInputs(raw);
    expect(d?.canValues).toBe(false);
    expect(d?.context).toMatchObject({ kind: "deal", valueModel: "fixo", hasBudget: true, budgetCents: null, feeBudgetCents: null, current: ["t1"], segment_ids: ["s1"] });
    expect(d?.heroes).toHaveLength(1);
    const h = d!.heroes[0];
    expect(h).toMatchObject({ talent_id: "t1", availability: "available", blocked: true, segments: ["s1"], cost_bp: 2500, fee_cents: null, fee_source: "past" });
    expect(h.accounts).toHaveLength(1); // a conta sem data some
    expect(h.accounts[0]).toMatchObject({ followers: 1000, avg_reach: 300, age: { "18-24": 4000 }, top_states: ["RJ"] });
    expect(h.rating).toEqual({ count: 2, quality_avg: 4.5, on_time_pct: 100 });
  });
  it("json sem contexto ou sem lista de Heros não vale", () => {
    expect(parseCastInputs(null)).toBeNull();
    expect(parseCastInputs({ heroes: [] })).toBeNull();
    expect(parseCastInputs({ context: {} })).toBeNull();
  });
  it("por Hero e máximo", () => {
    const d = parseCastInputs({ can_values: true, context: { kind: "call", value_model: "por_heroi", max_heroes: "3", budget_cents: 5, rate_bp: 2000, fee_budget_cents: 4 }, heroes: [] });
    expect(d?.context).toMatchObject({ kind: "call", valueModel: "por_heroi", maxHeroes: 3, rateBp: 2000, feeBudgetCents: 4 });
  });
});
