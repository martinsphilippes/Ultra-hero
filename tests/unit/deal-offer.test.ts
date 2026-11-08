import { describe, expect, it } from "vitest";
import { MONEY_ONLY, type Compensation, type CompensationDb } from "@/lib/compensation/model";
import { canAcceptOffer, offerReplyArgs, offerState, offerStatus, termsOnTable, toOfferView, type OfferReplyInput, type OfferRound, type OfferTerms } from "@/lib/deals/offer";

// Proposta da marca no negócio (0106): vez de quem, acordo e leitura do JSON (espelho de public.deal_offer_state).
// 0140: forma de pagamento nos termos (valor, permuta e/ou performance), aceite sem dinheiro e contraproposta com a forma.

const round = (seq: number, side: "agency" | "brand", action: "accept" | "counter" | "decline", compensation: Compensation = MONEY_ONLY): OfferRound => ({
  id: `r${seq}`,
  seq,
  side,
  action,
  amountCents: action === "decline" || !compensation.money ? null : 100000,
  valueModel: "fixo",
  maxHeroes: null,
  periodStart: null,
  periodEnd: null,
  compensation,
  note: "",
  actorLabel: "",
  createdAt: "2026-11-04T12:00:00Z",
});

const BARTER_ONLY: Compensation = { money: false, barter: { offer: "Kit de produtos", valueCents: 300_000 }, performance: null };
const terms = (amountCents: number | null, compensation: Compensation = MONEY_ONLY): OfferTerms => ({ amountCents, valueModel: "fixo", maxHeroes: null, periodStart: null, periodEnd: null, compensation });

describe("vez na negociação", () => {
  it("sem rodadas, a agência responde à proposta da marca", () => {
    expect(offerState([])).toEqual({ turn: "agency", agreed: false });
  });
  it("contraproposta da agência passa a vez à marca; resposta da marca devolve", () => {
    expect(offerState([round(1, "agency", "counter")])).toEqual({ turn: "brand", agreed: false });
    expect(offerState([round(1, "agency", "counter"), round(2, "brand", "counter")])).toEqual({ turn: "agency", agreed: false });
    expect(offerState([round(1, "agency", "counter"), round(2, "brand", "decline")])).toEqual({ turn: "agency", agreed: false });
  });
  it("qualquer aceite fecha o acordo, sem depender da ordem do array", () => {
    expect(offerState([round(3, "agency", "accept"), round(1, "agency", "counter"), round(2, "brand", "counter")])).toEqual({ turn: null, agreed: true });
  });
});

describe("linha de situação", () => {
  it("cobre proposta, contraproposta, recusa, acordo e negócio fechado", () => {
    expect(offerStatus({ open: true, rounds: [] })).toBe("brand_proposal");
    expect(offerStatus({ open: true, rounds: [round(1, "agency", "counter")] })).toBe("agency_countered");
    expect(offerStatus({ open: true, rounds: [round(1, "agency", "counter"), round(2, "brand", "counter")] })).toBe("brand_countered");
    expect(offerStatus({ open: true, rounds: [round(1, "agency", "counter"), round(2, "brand", "decline")] })).toBe("brand_declined");
    expect(offerStatus({ open: false, rounds: [round(1, "brand", "accept")] })).toBe("agreed");
    expect(offerStatus({ open: false, rounds: [round(1, "agency", "counter")] })).toBe("closed");
  });
});

describe("leitura do JSON", () => {
  it("normaliza modelo, máximo e ordem; sem valores para o gestor", () => {
    const view = toOfferView({
      enabled: true,
      viewer: "agency",
      values: false,
      open: true,
      can_reply: false,
      turn: "brand",
      agreed: false,
      brand_terms: { source: "request", value_model: "fixo", max_heroes: 3, period_start: "2026-12-01", period_end: "2026-12-10" },
      agreed_terms: null,
      rounds: [
        { id: "b", seq: 2, side: "brand", action: "counter", amount_cents: null, value_model: "por_heroi", max_heroes: 2, note: "", actor_label: "Dona", created_at: "x" },
        { id: "a", seq: 1, side: "agency", action: "counter", amount_cents: null, value_model: "fixo", max_heroes: null, note: "", actor_label: "Ana", created_at: "x" },
      ],
    });
    // sem a chave (antes da 0140): só valor
    expect(view?.brandTerms).toEqual({ source: "request", amountCents: null, valueModel: "fixo", maxHeroes: null, periodStart: "2026-12-01", periodEnd: "2026-12-10", compensation: MONEY_ONLY });
    expect(view?.rounds.map((r) => r.id)).toEqual(["a", "b"]);
    expect(view?.rounds[1]).toMatchObject({ valueModel: "por_heroi", maxHeroes: 2, amountCents: null, compensation: MONEY_ONLY });
    expect(view?.turn).toBe("brand");
  });
  it("recusa JSON sem quem lê", () => {
    expect(toOfferView(null)).toBeNull();
    expect(toOfferView({ viewer: "talent" })).toBeNull();
  });
  it("0140: forma de pagamento nos termos da marca, no acordo e em cada rodada (com os números para quem lê valores)", () => {
    const db = { money: false, barter: { offer: "Kit de produtos", value_cents: 300_000 }, performance: { kind: "percent", rate: 10, measure: "cupom HERO10", estimate_cents: null } };
    const view = toOfferView({
      enabled: true,
      viewer: "brand",
      values: true,
      open: false,
      can_reply: false,
      turn: null,
      agreed: true,
      brand_terms: { source: "counter", amount_cents: null, value_model: "fixo", compensation: db },
      agreed_terms: { amount_cents: null, value_model: "fixo", side: "agency", compensation: db },
      rounds: [
        { id: "a", seq: 1, side: "brand", action: "counter", amount_cents: null, value_model: "fixo", compensation: db },
        { id: "b", seq: 2, side: "agency", action: "accept", amount_cents: null, value_model: "fixo", compensation: db },
      ],
    });
    const expected: Compensation = { money: false, barter: { offer: "Kit de produtos", valueCents: 300_000 }, performance: { kind: "percent", rate: 10, measure: "cupom HERO10", estimateCents: null } };
    expect(view?.brandTerms?.compensation).toEqual(expected);
    expect(view?.agreedTerms?.compensation).toEqual(expected);
    expect(view?.rounds.map((r) => r.compensation)).toEqual([expected, expected]);
  });
  it("0140: sem permissão para valores, a permuta chega sem o valor estimado (o banco tira os números)", () => {
    const view = toOfferView({
      viewer: "agency",
      values: false,
      brand_terms: { source: "request", value_model: "fixo", compensation: { money: false, barter: { offer: "Kit de produtos", value_cents: null }, performance: null } },
      rounds: [],
    });
    expect(view?.brandTerms?.compensation).toEqual({ money: false, barter: { offer: "Kit de produtos", valueCents: null }, performance: null });
  });
});

describe("termos na mesa e aceite (0140)", () => {
  const base = { agreed: false, agreedTerms: null, brandTerms: { ...terms(500_000), source: "request" as const } };
  it("na vez da agência, os termos da marca; na vez da marca, a última contraproposta da agência; com acordo, o acordo", () => {
    const counter1 = { ...round(1, "agency", "counter"), amountCents: 400_000 };
    const counter3 = { ...round(3, "agency", "counter", BARTER_ONLY) };
    expect(termsOnTable({ ...base, turn: "agency", rounds: [] })).toBe(base.brandTerms);
    expect(termsOnTable({ ...base, turn: "brand", rounds: [counter3, round(2, "brand", "counter"), counter1] })).toBe(counter3);
    const agreedTerms = { ...terms(450_000), side: "brand" as const };
    expect(termsOnTable({ ...base, agreed: true, agreedTerms, turn: null, rounds: [round(1, "brand", "accept")] })).toBe(agreedTerms);
  });
  it("a agência aceita proposta com valor ou sem dinheiro nenhum; com 'Valor' marcado e sem valor, contrapropõe", () => {
    expect(canAcceptOffer("agency", terms(500_000))).toBe(true);
    expect(canAcceptOffer("agency", terms(null))).toBe(false);
    expect(canAcceptOffer("agency", terms(null, BARTER_ONLY))).toBe(true);
    expect(canAcceptOffer("agency", terms(null, { ...BARTER_ONLY, money: true }))).toBe(false);
    expect(canAcceptOffer("agency", null)).toBe(false);
  });
  it("a marca sempre pode aceitar a contraproposta da agência", () => {
    expect(canAcceptOffer("brand", null)).toBe(true);
    expect(canAcceptOffer("brand", terms(null))).toBe(true);
  });
});

describe("argumentos da resposta (0140)", () => {
  const MONEY_DB: CompensationDb = { money: true, barter: null, performance: null };
  const BARTER_DB: CompensationDb = { money: false, barter: { offer: "Kit de produtos", value_cents: null }, performance: null };
  const input = (patch: Partial<OfferReplyInput>): OfferReplyInput => ({
    dealId: "d1",
    action: "counter",
    amountCents: 500_000,
    valueModel: "fixo",
    maxHeroes: null,
    periodStart: "",
    periodEnd: "",
    note: "",
    compensation: MONEY_DB,
    ...patch,
  });

  it("contraproposta com dinheiro: valor, modelo e a forma de pagamento (sempre enviada)", () => {
    const r = offerReplyArgs(input({ periodStart: "2026-12-01", note: "Fechamos assim" }));
    expect(r).toEqual({
      ok: true,
      args: { p_deal: "d1", p_action: "counter", p_amount_cents: 500_000, p_value_model: "fixo", p_max_heroes: null, p_period_start: "2026-12-01", p_period_end: "2026-12-01", p_note: "Fechamos assim", p_compensation: MONEY_DB },
    });
  });
  it("contraproposta sem dinheiro: sem valor, modelo fixo, sem máximo — mesmo com campos de valor esquecidos", () => {
    const r = offerReplyArgs(input({ compensation: BARTER_DB, amountCents: 999, valueModel: "por_heroi", maxHeroes: 4 }));
    expect(r.ok && r.args).toMatchObject({ p_amount_cents: null, p_value_model: "fixo", p_max_heroes: null, p_compensation: BARTER_DB });
  });
  it("contraproposta exige a forma de pagamento e, com 'Valor', o valor (e por Hero, o máximo)", () => {
    expect(offerReplyArgs(input({ compensation: null }))).toEqual({ ok: false, error: "invalid_compensation" });
    expect(offerReplyArgs(input({ amountCents: null }))).toEqual({ ok: false, error: "invalid_input" });
    expect(offerReplyArgs(input({ valueModel: "por_heroi", maxHeroes: null }))).toEqual({ ok: false, error: "max_heroes_required" });
    expect(offerReplyArgs(input({ valueModel: "por_heroi", maxHeroes: 3 })).ok).toBe(true);
    expect(offerReplyArgs(input({ periodStart: "2026-12-10", periodEnd: "2026-12-01" }))).toEqual({ ok: false, error: "invalid_input" });
  });
  it("aceite e recusa não levam termos nem forma de pagamento", () => {
    const accept = offerReplyArgs(input({ action: "accept", compensation: null, amountCents: null }));
    expect(accept).toEqual({
      ok: true,
      args: { p_deal: "d1", p_action: "accept", p_amount_cents: null, p_value_model: null, p_max_heroes: null, p_period_start: null, p_period_end: null, p_note: null, p_compensation: null },
    });
    const decline = offerReplyArgs(input({ action: "decline", compensation: BARTER_DB, note: "Sem verba" }));
    expect(decline.ok && decline.args).toMatchObject({ p_action: "decline", p_compensation: null, p_amount_cents: null, p_note: "Sem verba" });
  });
});
