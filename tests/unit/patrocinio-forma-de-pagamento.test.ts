import { describe, expect, it } from "vitest";
import { MONEY_ONLY, draftFrom, type Compensation } from "@/lib/compensation/model";
import { parseBrlToCents } from "@/lib/deals/schemas";
import { centsToBrl } from "@/lib/money/brl-input";
import {
  canAcceptAsked,
  compensationPreview,
  newTierDraft,
  roundActionKey,
  termsAmount,
  tierMissingPrice,
  tiersPaySummary,
  validateTiers,
  type TierDraft,
} from "@/lib/sponsorship/negotiation";
import {
  compensationWithoutValues,
  parsePerks,
  proposalTerms,
  readCompensation,
  sponsorshipSchema,
  toAgencySponsorshipDetail,
  toBrandNegotiation,
  toBrandSponsorships,
  toTalentSponsorships,
} from "@/lib/sponsorship/vocab";

// Forma de pagamento no patrocínio (0140): cada cota diz como a marca paga (Valor, Permuta, Performance, por marca);
// sem dinheiro a cota não tem valor pedido e a proposta não leva valor.

const BARTER: Compensation = { money: false, barter: { offer: "50 caixas de bebida", valueCents: 250_000 }, performance: null };
const PERF: Compensation = { money: false, barter: null, performance: { kind: "percent", rate: 10, measure: "cupom HERO10", estimateCents: 500_000 } };
const CASH_BARTER: Compensation = { money: true, barter: { offer: "Kit de produtos", valueCents: null }, performance: null };

const tier = (p: Partial<TierDraft>): TierDraft => ({ ...newTierDraft("Master"), priceText: "10.000,00", perksText: "Logo na camiseta", ...p });

describe("cotas: forma de pagamento definida pelo Adm", () => {
  it("cota nova nasce só valor", () => {
    expect(newTierDraft("Cota única")).toMatchObject({ id: null, name: "Cota única", priceText: "", slots: 1, valueModel: "por_marca", compensation: draftFrom(MONEY_ONLY, centsToBrl) });
  });

  it("Adm: só valor manda a forma junto com o valor pedido", () => {
    const r = validateTiers([tier({})], parseBrlToCents, parsePerks, true);
    expect(r.ok && r.tiers[0]).toMatchObject({ priceCents: 1_000_000, compensation: { money: true, barter: null, performance: null } });
  });

  it("Adm: sem dinheiro, a cota não tem valor pedido (mesmo com texto no campo)", () => {
    const r = validateTiers([tier({ compensation: draftFrom(BARTER, centsToBrl) })], parseBrlToCents, parsePerks, true);
    expect(r.ok && r.tiers[0]).toMatchObject({ priceCents: null, compensation: { money: false, barter: { offer: "50 caixas de bebida", value_cents: 250_000 }, performance: null } });
    // valor inválido não importa quando "Valor" está desmarcado
    expect(validateTiers([tier({ priceText: "abc", compensation: draftFrom(PERF, centsToBrl) })], parseBrlToCents, parsePerks, true).ok).toBe(true);
  });

  it("Adm: valor + permuta (combinável)", () => {
    const r = validateTiers([tier({ compensation: draftFrom(CASH_BARTER, centsToBrl) })], parseBrlToCents, parsePerks, true);
    expect(r.ok && r.tiers[0]).toMatchObject({ priceCents: 1_000_000, compensation: { money: true, barter: { offer: "Kit de produtos", value_cents: null } } });
  });

  it("Adm: erros da forma de pagamento com o índice da cota e o motivo", () => {
    const none = { ...draftFrom(MONEY_ONLY, centsToBrl), money: false };
    expect(validateTiers([tier({}), tier({ name: "Apoio", compensation: none })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 1, error: "compensation", reason: "none_selected" });
    const shortOffer = { ...draftFrom(BARTER, centsToBrl), barterOffer: "ab" };
    expect(validateTiers([tier({ compensation: shortOffer })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 0, error: "compensation", reason: "barter_offer" });
    const badValue = { ...draftFrom(BARTER, centsToBrl), barterValueText: "abc" };
    expect(validateTiers([tier({ compensation: badValue })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 0, error: "compensation", reason: "barter_value" });
  });

  it("gestor: não manda forma nem valor (o banco ignora os dele e mantém o que o Adm gravou)", () => {
    const r = validateTiers([tier({ compensation: draftFrom(BARTER, centsToBrl) })], parseBrlToCents, parsePerks, false);
    expect(r.ok && r.tiers[0]).toMatchObject({ priceCents: null, compensation: null });
  });

  it("o formulário aceita a forma no formato do banco e recusa forma inválida", () => {
    const base = {
      id: null, title: "Maratona", description: "", location: "", date: "2026-11-20", endDate: "", startTime: "08:00", endTime: "13:00", allDay: false, expectedReach: "",
      perks: [], networks: ["instagram" as const], respondDate: "2026-11-15", respondTime: "18:00", audience: "all" as const, brandIds: [],
      public: { targetAudience: "", targetAgeBands: [], targetStates: [], regionNote: "" }, publish: false,
      hero: { kind: "typed" as const, talentId: null, creatorId: null, name: "Ana Corre", slug: null, avatarUrl: null, headline: null, pillars: [], consent: "none" as const, profile: "", email: "" },
    };
    const barterTier = { id: null, name: "Cota única", priceCents: null, perks: ["Logo"], slots: 1, compensation: { money: false, barter: { offer: "50 caixas de bebida", value_cents: null }, performance: null } };
    const ok = sponsorshipSchema.safeParse({ ...base, tiers: [barterTier] });
    expect(ok.success).toBe(true);
    // sem a chave (formato antigo, gestor) = null: não mexe
    const legacy = sponsorshipSchema.safeParse({ ...base, tiers: [{ id: null, name: "Cota única", priceCents: null, perks: ["Logo"], slots: 1 }] });
    expect(legacy.success && legacy.data.tiers[0].compensation).toBeNull();
    expect(sponsorshipSchema.safeParse({ ...base, tiers: [{ ...barterTier, compensation: { money: false, barter: null, performance: null } }] }).success).toBe(false);
  });
});

describe("propostas sem dinheiro", () => {
  it("valor só vai com dinheiro; sem dinheiro nunca vai", () => {
    expect(termsAmount(true, 500_000)).toBe(500_000);
    expect(termsAmount(true, null)).toBeUndefined();
    expect(termsAmount(true, 0)).toBeUndefined();
    expect(termsAmount(true, undefined)).toBeUndefined();
    expect(termsAmount(false, 500_000)).toBeNull();
    expect(termsAmount(false, null)).toBeNull();
  });

  it("aceitar como está: com dinheiro precisa do pedido; sem dinheiro, não", () => {
    expect(canAcceptAsked({ askCents: 100, perks: ["Logo"], compensation: MONEY_ONLY })).toBe(true);
    expect(canAcceptAsked({ askCents: null, perks: ["Logo"], compensation: MONEY_ONLY })).toBe(false);
    expect(canAcceptAsked({ askCents: null, perks: ["Logo"], compensation: BARTER })).toBe(true);
    expect(canAcceptAsked({ askCents: null, perks: [], compensation: BARTER })).toBe(false);
    expect(canAcceptAsked({ askCents: null, perks: ["Logo"], compensation: CASH_BARTER })).toBe(false);
  });

  it("cota sem dinheiro nunca está 'sem valor'", () => {
    expect(tierMissingPrice({ compensation: MONEY_ONLY, hasPrice: false })).toBe(true);
    expect(tierMissingPrice({ compensation: MONEY_ONLY, hasPrice: true })).toBe(false);
    expect(tierMissingPrice({ compensation: PERF, hasPrice: false })).toBe(false);
  });

  it("rodada que aceita cota sem dinheiro é 'aceitou como está'", () => {
    expect(roundActionKey({ action: "accept_asked", compensation: BARTER })).toBe("action.accept_as_is");
    expect(roundActionKey({ action: "accept_asked", compensation: CASH_BARTER })).toBe("action.accept_asked");
    expect(roundActionKey({ action: "counter", compensation: BARTER })).toBe("action.counter");
  });
});

describe("lista da marca: o que as cotas pedem", () => {
  const z = (priceCents: number | null, compensation: Compensation, full = false) => ({ full, priceCents, compensation });
  it("menor valor com dinheiro; 'a partir de' só com mais de uma cota com dinheiro", () => {
    expect(tiersPaySummary([z(500_000, MONEY_ONLY), z(300_000, MONEY_ONLY)])).toEqual({ full: false, price: { cents: 300_000, from: true }, toCombine: false, kinds: [] });
    expect(tiersPaySummary([z(500_000, MONEY_ONLY), z(null, BARTER)])).toEqual({ full: false, price: { cents: 500_000, from: false }, toCombine: false, kinds: ["barter"] });
  });
  it("sem dinheiro: Permuta/Performance, nunca 'a combinar'", () => {
    expect(tiersPaySummary([z(null, BARTER), z(null, PERF)])).toEqual({ full: false, price: null, toCombine: false, kinds: ["barter", "performance"] });
  });
  it("dinheiro sem valor segue 'a combinar'; esgotada e cota cheia não contam", () => {
    expect(tiersPaySummary([z(null, MONEY_ONLY), z(null, PERF)])).toEqual({ full: false, price: null, toCombine: true, kinds: ["performance"] });
    expect(tiersPaySummary([z(100, MONEY_ONLY, true), z(null, BARTER)])).toEqual({ full: false, price: null, toCombine: false, kinds: ["barter"] });
    expect(tiersPaySummary([z(100, MONEY_ONLY, true)]).full).toBe(true);
    expect(tiersPaySummary([]).toCombine).toBe(true);
  });
});

describe("leituras: forma de pagamento sem números para quem não lê valor", () => {
  it("tolera o corte do servidor (compensation_public): a performance continua, sem o número", () => {
    expect(readCompensation({ money: false, barter: null, performance: { kind: "percent", rate: null, measure: "cupom", estimate_cents: null } })).toEqual({
      money: false,
      barter: null,
      performance: { kind: "percent", rate: 0, measure: "cupom", estimateCents: null },
    });
    expect(readCompensation({ money: true, barter: { offer: "Kit", value_cents: null }, performance: { kind: "per_sale", rate: null, measure: "link", estimate_cents: null } })).toEqual({
      money: true,
      barter: { offer: "Kit", valueCents: null },
      performance: { kind: "per_sale", rate: 0, measure: "link", estimateCents: null },
    });
    expect(readCompensation(undefined)).toEqual(MONEY_ONLY);
    expect(readCompensation({ money: false, barter: null, performance: { kind: "x", rate: null, measure: "y" } })).toEqual(MONEY_ONLY);
  });

  it("prévia do rascunho para o gestor: tipo e descrições, sem números", () => {
    expect(compensationPreview(draftFrom(PERF, centsToBrl))).toEqual({ money: false, barter: null, performance: { kind: "percent", rate: 0, measure: "cupom HERO10", estimateCents: null } });
    expect(compensationPreview(draftFrom(BARTER, centsToBrl)).barter).toEqual({ offer: "50 caixas de bebida", valueCents: null });
    expect(compensationPreview(draftFrom(MONEY_ONLY, centsToBrl))).toEqual(MONEY_ONLY);
  });

  it("marca: cotas e propostas com a forma; proposta sem dinheiro sem valor", () => {
    const n = toBrandNegotiation({
      role: "owner",
      can_propose: true,
      tiers: [{ id: "t1", name: "Bebidas", price_cents: null, ask_cents: null, perks: ["Logo"], slots: 2, compensation: { money: false, barter: { offer: "50 caixas de bebida", value_cents: 250000 }, performance: null } }],
      proposals: [
        {
          id: "p1", tier_id: "t1", status: "agreed", amount_cents: null, agreed_cents: null, perks: ["Logo"], agreed_perks: ["Logo"],
          compensation: { money: false, barter: { offer: "50 caixas de bebida", value_cents: 250000 }, performance: null },
          agreed_compensation: { money: false, barter: { offer: "60 caixas de bebida", value_cents: 300000 }, performance: null },
          history: [{ id: "r1", seq: 1, side: "brand", action: "accept_asked", amount_cents: null, perks: ["Logo"], state: "sent", compensation: { money: false, barter: { offer: "50 caixas de bebida", value_cents: 250000 }, performance: null } }],
        },
      ],
    });
    expect(n?.tiers[0].compensation).toEqual(BARTER);
    const p = n!.proposals[0];
    expect(p.amountCents).toBeNull();
    expect(p.history[0].compensation.money).toBe(false);
    expect(proposalTerms(p)).toEqual({ amountCents: null, perks: ["Logo"], compensation: { money: false, barter: { offer: "60 caixas de bebida", valueCents: 300_000 }, performance: null } });
    expect(proposalTerms({ ...p, status: "open" }).compensation).toEqual(BARTER);
  });

  it("marca, lista: cotas com a forma (ausente = só valor)", () => {
    const [o] = toBrandSponsorships([{ id: "o1", title: "M", status: "open", tiers: [{ id: "t1", name: "A", price_cents: 100, perks: [], slots: 1 }, { id: "t2", name: "B", price_cents: null, perks: [], slots: 1, compensation: { money: false, barter: null, performance: { kind: "per_lead", rate: 500, measure: "link", estimate_cents: null } } }] }]);
    expect(o.tiers[0].compensation).toEqual(MONEY_ONLY);
    expect(o.tiers[1].compensation.performance).toEqual({ kind: "per_lead", rate: 500, measure: "link", estimateCents: null });
  });

  it("agência, gestor: a cota e a proposta chegam sem números e seguem com o tipo", () => {
    const stripped = { money: false, barter: { offer: "50 caixas de bebida", value_cents: null }, performance: { kind: "percent", rate: null, measure: "cupom", estimate_cents: null } };
    const d = toAgencySponsorshipDetail({
      can_values: false,
      opportunity: { id: "o1", agency_id: "a", status: "open" },
      tiers: [{ id: "t1", name: "Bebidas", price_cents: null, has_price: false, compensation: stripped }],
      proposals: [{ id: "p1", tier_id: "t1", status: "open", amount_cents: null, perks: ["Logo"], compensation: stripped, agreed_compensation: null, history: [] }],
      brands: [],
    });
    expect(d?.tiers[0].compensation).toEqual({ money: false, barter: { offer: "50 caixas de bebida", valueCents: null }, performance: { kind: "percent", rate: 0, measure: "cupom", estimateCents: null } });
    expect(tierMissingPrice(d!.tiers[0])).toBe(false);
    expect(d?.proposals[0].agreedCompensation).toBeNull();
    expect(d?.proposals[0].compensation.performance?.kind).toBe("percent");
  });

  it("Hero: a forma acordada sem nenhum número, mesmo se o servidor mandasse", () => {
    const [o] = toTalentSponsorships([
      { id: "o1", title: "Maratona", status: "sponsored", agreements: [{ brand: "Beta", tier: "Bebidas", perks: ["Logo"], compensation: { money: false, barter: { offer: "50 caixas de bebida", value_cents: 250000 }, performance: { kind: "percent", rate: 10, measure: "cupom", estimate_cents: 9000 } } }] },
    ]);
    expect(o.agreements[0].compensation).toEqual({ money: false, barter: { offer: "50 caixas de bebida", valueCents: null }, performance: { kind: "percent", rate: 0, measure: "cupom", estimateCents: null } });
    expect(compensationWithoutValues(CASH_BARTER)).toEqual({ money: true, barter: { offer: "Kit de produtos", valueCents: null }, performance: null });
  });
});
