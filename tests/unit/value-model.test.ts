import { describe, expect, it } from "vitest";
import { ceilingCents, feeBudgetCents, normalizeTerms, slotsLeft, splitEvenly, splitProportional, validateTerms, valueLabelKey } from "@/lib/value-model/model";

// Modelo de valor (0096): fixo = total dividido entre os Heros; por Hero = valor × máximo (obrigatório).

describe("modelo de valor", () => {
  it("fixo nunca guarda máximo e aceita valor vazio", () => {
    expect(normalizeTerms("fixo", 1000, 5)).toEqual({ model: "fixo", amountCents: 1000, maxHeroes: null });
    expect(normalizeTerms("qualquer", null, 2)).toEqual({ model: "fixo", amountCents: null, maxHeroes: null });
    expect(validateTerms(normalizeTerms("fixo", null, null))).toBeNull();
    expect(validateTerms(normalizeTerms("fixo", null, null), { requireAmount: true })).toBe("invalid_input");
  });

  it("por Hero exige valor > 0 e máximo de 1 a 50", () => {
    const t = (amount: number | null, max: number | null) => validateTerms({ model: "por_heroi", amountCents: amount, maxHeroes: max });
    expect(t(null, 3)).toBe("value_per_hero_required");
    expect(t(0, 3)).toBe("value_per_hero_required");
    expect(t(100, null)).toBe("max_heroes_required");
    expect(t(100, 0)).toBe("max_heroes_required");
    expect(t(100, 51)).toBe("max_heroes_required");
    expect(t(100, 1.5)).toBe("max_heroes_required");
    expect(t(100, 1)).toBeNull();
    expect(t(100, 50)).toBeNull();
    expect(t(-1, 3)).toBe("invalid_input");
    expect(t(10_000_000_000, 2)).toBe("invalid_input"); // teto passa do limite do banco
  });

  it("teto de investimento = valor × máximo (por Hero) ou o próprio valor (fixo)", () => {
    expect(ceilingCents({ model: "por_heroi", amountCents: 200_000, maxHeroes: 3 })).toBe(600_000);
    expect(ceilingCents({ model: "por_heroi", amountCents: 200_000, maxHeroes: null })).toBeNull();
    expect(ceilingCents({ model: "fixo", amountCents: 900_000, maxHeroes: null })).toBe(900_000);
    expect(ceilingCents({ model: "fixo", amountCents: null, maxHeroes: null })).toBeNull();
  });

  it("vagas que restam só existem no modelo por Hero", () => {
    expect(slotsLeft({ model: "por_heroi", amountCents: 1, maxHeroes: 3 }, 1)).toBe(2);
    expect(slotsLeft({ model: "por_heroi", amountCents: 1, maxHeroes: 3 }, 5)).toBe(0);
    expect(slotsLeft({ model: "fixo", amountCents: 1, maxHeroes: null }, 5)).toBeNull();
  });

  it("orçamento de cachês: o total não inclui a comissão (V = F + C)", () => {
    expect(feeBudgetCents(1_200_000, 2000)).toBe(1_000_000);
    expect(feeBudgetCents(1_000_000, 0)).toBe(1_000_000);
    expect(feeBudgetCents(100, 3333)).toBe(75);
    expect(feeBudgetCents(0, 2000)).toBe(0);
  });

  it("repartição soma exatamente o total, em qualquer divisão", () => {
    for (const total of [0, 1, 7, 100, 1_000_001, 999_999_999]) {
      for (const n of [1, 2, 3, 7, 13]) {
        const parts = splitEvenly(total, n);
        expect(parts).toHaveLength(n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
    const p = splitProportional(1_000_000, [400_000, 200_000, 100_000]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(1_000_000);
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(splitProportional(100, [0, 0])).toEqual([50, 50]);
    expect(splitProportional(100, [])).toEqual([]);
    expect(splitProportional(10, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("rótulo do campo muda com o modelo", () => {
    expect(valueLabelKey("fixo")).toBe("total");
    expect(valueLabelKey("por_heroi")).toBe("perHero");
  });
});
