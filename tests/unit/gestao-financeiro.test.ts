import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES } from "@/lib/agency/error-codes";
import { AGENCY_NAV, AGENCY_ROUTE_MIN, agencyNavKeys } from "@/lib/agency/roles";
import { computeFinance, dealRateSchema, entryStatusSchema, formatRate, nextEntryStatuses, parseRatePercent, rateSchema } from "@/lib/finance/vocab";

// P3 (0069): a mesma conta do banco (cachês + taxa = o que a marca paga), transições de situação, taxa em
// pontos-base, formas dos formulários, códigos de erro e o menu do Adm (Financeiro e Histórico).

describe("conta do financeiro simulado", () => {
  it("V = F + C com arredondamento meio para cima, como a RPC", () => {
    expect(computeFinance([300000, 100000], 2500)).toEqual({ payouts: 400000, commission: 100000, total: 500000 });
    expect(computeFinance([300000, 200000], 2000)).toEqual({ payouts: 500000, commission: 100000, total: 600000 });
    expect(computeFinance([333], 1500)).toEqual({ payouts: 333, commission: 50, total: 383 });
    expect(computeFinance([], 2000)).toEqual({ payouts: 0, commission: 0, total: 0 });
    expect(computeFinance([100000], 0)).toEqual({ payouts: 100000, commission: 0, total: 100000 });
  });
  it("identidade: a receber = comissão + repasses em qualquer taxa", () => {
    for (const bp of [0, 1, 999, 2000, 3333, 5000]) {
      const f = computeFinance([123456, 78901, 1], bp);
      expect(f.total).toBe(f.commission + f.payouts);
    }
  });
});

describe("situação dos lançamentos", () => {
  it("planejado → a vencer/liquidado/cancelado; a vencer → liquidado/cancelado; finais param", () => {
    expect(nextEntryStatuses("planned")).toEqual(["due", "settled", "cancelled"]);
    expect(nextEntryStatuses("due")).toEqual(["settled", "cancelled"]);
    expect(nextEntryStatuses("settled")).toEqual([]);
    expect(nextEntryStatuses("cancelled")).toEqual([]);
  });
});

describe("taxa de serviço", () => {
  it("percentual digitado vira pontos-base dentro da faixa", () => {
    expect(parseRatePercent("20")).toBe(2000);
    expect(parseRatePercent("20,5")).toBe(2050);
    expect(parseRatePercent("12.75%")).toBe(1275);
    expect(parseRatePercent("0")).toBe(0);
    expect(parseRatePercent("50")).toBe(5000);
    expect(parseRatePercent("50,01")).toBeNull();
    expect(parseRatePercent("-1")).toBeNull();
    expect(parseRatePercent("abc")).toBeNull();
    expect(parseRatePercent("")).toBeNull();
  });
  it("formata em percentual no idioma", () => {
    expect(formatRate(2000, "pt-BR")).toBe("20%");
    expect(formatRate(1275, "en")).toBe("12.75%");
  });
});

describe("formas dos formulários", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("situação: só a vencer, liquidado ou cancelado", () => {
    expect(entryStatusSchema.safeParse({ entryId: id, status: "settled", note: "" }).success).toBe(true);
    expect(entryStatusSchema.safeParse({ entryId: id, status: "planned", note: "" }).success).toBe(false);
    expect(entryStatusSchema.safeParse({ entryId: "x", status: "due", note: "" }).success).toBe(false);
  });
  it("taxas: inteiros de 0 a 5000; a do negócio aceita null (volta ao padrão)", () => {
    expect(rateSchema.safeParse({ rateBp: 2000 }).success).toBe(true);
    expect(rateSchema.safeParse({ rateBp: 5001 }).success).toBe(false);
    expect(rateSchema.safeParse({ rateBp: 20.5 }).success).toBe(false);
    expect(dealRateSchema.safeParse({ dealId: id, rateBp: null }).success).toBe(true);
    expect(dealRateSchema.safeParse({ dealId: id, rateBp: -1 }).success).toBe(false);
  });
});

describe("códigos de erro e menu", () => {
  it("códigos novos", () => {
    expect(AGENCY_ERROR_CODES).toContain("finance_identity");
    expect(AGENCY_ERROR_CODES).toContain("brand_inactive");
    expect(AGENCY_ERROR_CODES).toContain("no_hero");
  });
  it("Financeiro e Histórico só para o Adm; rotas guardadas", () => {
    expect(AGENCY_NAV).toContain("finance");
    expect(agencyNavKeys("admin")).toEqual(expect.arrayContaining(["finance", "history"]));
    expect(agencyNavKeys("manager")).not.toContain("finance");
    expect(agencyNavKeys("staff")).not.toContain("history");
    expect(agencyNavKeys(null, true)).toContain("finance");
    expect(AGENCY_ROUTE_MIN["/agencia/financeiro"]).toBe("admin");
    expect(AGENCY_ROUTE_MIN["/agencia/historico"]).toBe("admin");
  });
});
