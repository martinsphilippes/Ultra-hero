import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compensationKinds,
  draftFrom,
  draftToCompensation,
  estimateParts,
  isMoneyOnly,
  MONEY_ONLY,
  parseCompensation,
  parsePercent,
  toDb,
  validateCompensation,
  type CompensationDraft,
} from "@/lib/compensation/model";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";

// Forma de pagamento (0140): Valor, Permuta e Performance, combináveis.

const EMPTY: CompensationDraft = draftFrom(MONEY_ONLY, centsToBrl);

describe("forma de pagamento: regras", () => {
  it("padrão é só valor; nada marcado não vale", () => {
    expect(isMoneyOnly(MONEY_ONLY)).toBe(true);
    expect(validateCompensation(MONEY_ONLY)).toBeNull();
    expect(validateCompensation({ money: false, barter: null, performance: null })).toBe("none_selected");
  });

  it("permuta pede o que oferece (3 a 300); valor estimado é opcional", () => {
    expect(validateCompensation({ money: false, barter: { offer: "kit", valueCents: null }, performance: null })).toBeNull();
    expect(validateCompensation({ money: false, barter: { offer: "  ", valueCents: null }, performance: null })).toBe("barter_offer");
    expect(validateCompensation({ money: false, barter: { offer: "x".repeat(301), valueCents: null }, performance: null })).toBe("barter_offer");
    expect(validateCompensation({ money: false, barter: { offer: "Kit de produtos", valueCents: 0 }, performance: null })).toBe("barter_value");
  });

  it("performance: % de 0,01 a 100 (até 2 casas) ou R$ inteiro em centavos; como mede é obrigatório", () => {
    const perf = (kind: "percent" | "per_sale" | "per_lead", rate: number, measure = "cupom HERO10") => ({ money: true, barter: null, performance: { kind, rate, measure, estimateCents: null } });
    expect(validateCompensation(perf("percent", 10))).toBeNull();
    expect(validateCompensation(perf("percent", 7.5))).toBeNull();
    expect(validateCompensation(perf("percent", 0.1))).toBeNull();
    expect(validateCompensation(perf("percent", 101))).toBe("perf_rate");
    expect(validateCompensation(perf("percent", 1.234))).toBe("perf_rate");
    expect(validateCompensation(perf("per_sale", 2000))).toBeNull();
    expect(validateCompensation(perf("per_lead", 20.5))).toBe("perf_rate");
    expect(validateCompensation(perf("percent", 10, " "))).toBe("perf_measure");
  });

  it("combina: valor + permuta + performance, na ordem de leitura", () => {
    const c = { money: true, barter: { offer: "Kit", valueCents: 30000 }, performance: { kind: "percent" as const, rate: 10, measure: "cupom", estimateCents: 50000 } };
    expect(validateCompensation(c)).toBeNull();
    expect(compensationKinds(c)).toEqual(["money", "barter", "performance"]);
    expect(estimateParts(c)).toEqual({ barter: 30000, performance: 50000 });
  });
});

describe("forma de pagamento: banco", () => {
  it("lê o jsonb do banco e devolve no mesmo formato", () => {
    const db = { money: false, barter: { offer: "Kit de produtos", value_cents: 30000 }, performance: { kind: "per_sale", rate: 2000, measure: "link", estimate_cents: null } };
    const c = parseCompensation(db);
    expect(c).toEqual({ money: false, barter: { offer: "Kit de produtos", valueCents: 30000 }, performance: { kind: "per_sale", rate: 2000, measure: "link", estimateCents: null } });
    expect(toDb(c)).toEqual(db);
  });

  it("sem números (quem não lê valores): a performance e a permuta continuam, com a taxa desconhecida", () => {
    const c = parseCompensation({ money: false, barter: { offer: "Kit", value_cents: null }, performance: { kind: "percent", rate: null, measure: "cupom", estimate_cents: null } });
    expect(c).toEqual({ money: false, barter: { offer: "Kit", valueCents: null }, performance: { kind: "percent", rate: 0, measure: "cupom", estimateCents: null } });
    expect(parseCompensation({ money: false, barter: null, performance: { kind: "per_sale", measure: "link" } }).performance?.kind).toBe("per_sale");
  });

  it("ausente ou estranho vira só valor (o que já existia)", () => {
    expect(parseCompensation(null)).toEqual(MONEY_ONLY);
    expect(parseCompensation({ money: false })).toEqual(MONEY_ONLY);
    expect(parseCompensation({ money: true, barter: { offer: "" }, performance: { kind: "x", rate: 1 } })).toEqual(MONEY_ONLY);
  });
});

describe("forma de pagamento: formulário", () => {
  it("rascunho → valor: permuta com R$ digitado e performance em %", () => {
    const d: CompensationDraft = { ...EMPTY, money: false, barter: true, barterOffer: " Kit de produtos ", barterValueText: "300,00", performance: true, perfKind: "percent", perfRateText: "7,5", perfMeasure: "cupom HERO10" };
    const r = draftToCompensation(d, brlToCents);
    expect(r).toEqual({ ok: true, value: { money: false, barter: { offer: "Kit de produtos", valueCents: 30000 }, performance: { kind: "percent", rate: 7.5, measure: "cupom HERO10", estimateCents: null } } });
  });

  it("R$ por venda lê a máscara; volta ao formulário igual", () => {
    const d: CompensationDraft = { ...EMPTY, performance: true, perfKind: "per_sale", perfRateText: "20,00", perfMeasure: "link rastreado", perfEstimateText: "1.000,00" };
    const r = draftToCompensation(d, brlToCents);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.performance).toEqual({ kind: "per_sale", rate: 2000, measure: "link rastreado", estimateCents: 100000 });
      const back = draftFrom(r.value, centsToBrl);
      expect(back.perfRateText).toBe("20,00");
      expect(back.perfEstimateText).toBe("1.000,00");
    }
  });

  it("erros com o motivo certo", () => {
    expect(draftToCompensation({ ...EMPTY, money: false }, brlToCents)).toEqual({ ok: false, error: "none_selected" });
    expect(draftToCompensation({ ...EMPTY, barter: true, barterOffer: "ok" }, brlToCents)).toEqual({ ok: false, error: "barter_offer" });
    expect(draftToCompensation({ ...EMPTY, performance: true, perfRateText: "abc", perfMeasure: "cupom" }, brlToCents)).toEqual({ ok: false, error: "perf_rate" });
    expect(draftToCompensation({ ...EMPTY, performance: true, perfRateText: "10", perfMeasure: "" }, brlToCents)).toEqual({ ok: false, error: "perf_measure" });
  });

  it("porcentagem aceita vírgula, ponto e o sinal de %", () => {
    expect(parsePercent("10")).toBe(10);
    expect(parsePercent("7,5")).toBe(7.5);
    expect(parsePercent("12.25%")).toBe(12.25);
    expect(Number.isNaN(parsePercent("1.234"))).toBe(true);
    expect(Number.isNaN(parsePercent(""))).toBe(true);
  });
});

// Migração 0140: o banco confere a mesma regra e os fluxos aceitam acordo sem dinheiro.
const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0140_forma_de_pagamento.sql"), "utf8");

describe("migração 0140", () => {
  it("regra única no banco e a forma em negócio, campanha, chamada, propostas, rodadas e cotas", () => {
    expect(sql).toContain("create or replace function public.compensation_valid(p jsonb)");
    for (const table of ["deals", "campaign_request_budgets", "deal_offer_rounds", "brand_calls", "brand_call_proposals", "brand_call_rounds", "sponsorship_tiers", "sponsorship_proposals", "sponsorship_rounds"]) {
      expect(sql).toContain(`alter table public.${table} add column if not exists compensation jsonb`);
    }
    expect(sql).toContain("drop column if exists compensation_type");
  });
  it("sem dinheiro: sem valor exigido; aceite de termos só com permuta/performance; a campanha herda o acordo", () => {
    expect(sql).toContain("if public.compensation_money(v_comp) and (v_amount is null or v_amount < 1) then raise exception 'invalid_state'");
    expect(sql).toContain("if public.compensation_money(p.compensation) then\n    if p.amount_cents is null then raise exception 'amount_required'");
    expect(sql).toContain("agreed_compensation = compensation");
    expect(sql).toContain("'Patrocínio acordado — cota ' || t.name, 300), auth.uid(), 'fixo', null, p.agreed_compensation)");
  });
  it("quem não lê valores recebe a forma sem números; Projeção soma permuta e performance à parte", () => {
    expect(sql).toContain("create or replace function public.compensation_public(p jsonb)");
    expect(sql).toContain("'barter', coalesce(sum(b.cents) filter (where b.bucket = 'barter'), 0)");
    expect(sql).toContain("greatest(tr.slots - count(q.id) filter (where q.status in ('agreed', 'open')), 0)");
  });
});
