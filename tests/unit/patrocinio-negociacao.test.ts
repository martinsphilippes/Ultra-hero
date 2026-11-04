import { describe, expect, it } from "vitest";
import { parseBrlToCents } from "@/lib/deals/schemas";
import { inboxKindEmails } from "@/lib/inbox/kinds";
import {
  agencyReplyActions,
  amountValid,
  brandReplyActions,
  canProposeOnTier,
  composePerks,
  needsOwnerApproval,
  perksDiff,
  priceDiff,
  proposalBadge,
  proposalPerksValid,
  publicChips,
  publicFromDb,
  publicIsEmpty,
  publicToDb,
  validateTiers,
  type TierDraft,
} from "@/lib/sponsorship/negotiation";
import { parsePerks, toBrandNegotiation, toBrandSponsorships, toTalentSponsorships } from "@/lib/sponsorship/vocab";

describe("diferença em relação ao pedido", () => {
  it("calcula R$ e % com uma casa", () => {
    expect(priceDiff(1_000_000, 800_000)).toEqual({ cents: -200_000, pct: -20 });
    expect(priceDiff(300_000, 350_000)).toEqual({ cents: 50_000, pct: 16.7 });
    expect(priceDiff(100, 100)).toEqual({ cents: 0, pct: 0 });
  });
  it("sem pedido (valor a combinar) não há diferença", () => {
    expect(priceDiff(null, 500)).toBeNull();
    expect(priceDiff(0, 500)).toBeNull();
  });
  it("valor válido: inteiro de 1 centavo até o teto", () => {
    expect(amountValid(1)).toBe(true);
    expect(amountValid(10_000_000_000)).toBe(true);
    expect(amountValid(0)).toBe(false);
    expect(amountValid(10_000_000_001)).toBe(false);
    expect(amountValid(1.5)).toBe(false);
    expect(amountValid(null)).toBe(false);
  });
});

describe("contrapartidas da proposta", () => {
  const tier = ["Logo na camiseta", "3 stories ao vivo", "Menção na transmissão"];
  it("marca/desmarca itens da cota e acrescenta pedidos novos sem repetir", () => {
    expect(composePerks(tier, ["3 stories ao vivo", "Logo na camiseta"], ["  Post   no feed ", "logo na camiseta", ""])).toEqual(["Logo na camiseta", "3 stories ao vivo", "Post no feed"]);
  });
  it("valida: ao menos 1, 3 a 120 letras, sem repetir, até 10", () => {
    expect(proposalPerksValid(["Post no feed"])).toBe(true);
    expect(proposalPerksValid([])).toBe(false);
    expect(proposalPerksValid(["ab"])).toBe(false);
    expect(proposalPerksValid(["Logo", "logo"])).toBe(false);
    expect(proposalPerksValid(Array.from({ length: 11 }, (_, i) => `Item ${i}`))).toBe(false);
  });
  it("diferença das contrapartidas: mantidas, retiradas e novas", () => {
    expect(perksDiff(tier, ["Logo na camiseta", "Post no feed"])).toEqual({ kept: ["Logo na camiseta"], removed: ["3 stories ao vivo", "Menção na transmissão"], added: ["Post no feed"] });
  });
});

describe("cotas da agência", () => {
  const draft = (p: Partial<TierDraft>): TierDraft => ({ id: null, name: "Master", priceText: "10.000,00", perksText: "Logo na camiseta\n3 stories ao vivo", slots: 1, valueModel: "por_marca", ...p });
  it("Adm grava o valor; gestor não envia valor", () => {
    const adm = validateTiers([draft({}), draft({ name: "Apoio", priceText: "", slots: 2 })], parseBrlToCents, parsePerks, true);
    expect(adm.ok && adm.tiers.map((x) => x.priceCents)).toEqual([1_000_000, null]);
    const manager = validateTiers([draft({})], parseBrlToCents, parsePerks, false);
    expect(manager.ok && manager.tiers[0].priceCents).toBeNull();
  });
  it("recusa nome repetido, valor inválido, vagas fora de 1–20 e mais de 3 cotas", () => {
    expect(validateTiers([draft({}), draft({ name: "master" })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 1, error: "nameRepeated" });
    expect(validateTiers([draft({ priceText: "abc" })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 0, error: "price" });
    expect(validateTiers([draft({ slots: 0 })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 0, error: "slots" });
    expect(validateTiers([draft({ name: "A" })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: 0, error: "name" });
    expect(validateTiers([draft({}), draft({ name: "B2" }), draft({ name: "C3" }), draft({ name: "D4" })], parseBrlToCents, parsePerks, true)).toEqual({ ok: false, index: -1, error: "count" });
  });
});

describe("estados da negociação", () => {
  it("marca responde só na vez dela, sem rodada esperando o dono", () => {
    expect(brandReplyActions({ status: "open", awaiting: "brand", pendingOwner: false }, true)).toEqual(["accept", "counter", "decline"]);
    expect(brandReplyActions({ status: "open", awaiting: "agency", pendingOwner: false }, true)).toEqual([]);
    expect(brandReplyActions({ status: "open", awaiting: "brand", pendingOwner: true }, true)).toEqual([]);
    expect(brandReplyActions({ status: "open", awaiting: "brand", pendingOwner: false }, false)).toEqual([]);
    expect(brandReplyActions({ status: "agreed", awaiting: null, pendingOwner: false }, true)).toEqual([]);
  });
  it("agência: só o Adm e só na vez dela", () => {
    expect(agencyReplyActions({ status: "open", awaiting: "agency" }, true)).toEqual(["accept", "counter", "decline"]);
    expect(agencyReplyActions({ status: "open", awaiting: "agency" }, false)).toEqual([]);
    expect(agencyReplyActions({ status: "open", awaiting: "brand" }, true)).toEqual([]);
  });
  it("equipe precisa do dono para comprometer dinheiro; recusar vai direto", () => {
    expect(needsOwnerApproval("staff", "propose")).toBe(true);
    expect(needsOwnerApproval("staff", "accept_asked")).toBe(true);
    expect(needsOwnerApproval("staff", "decline")).toBe(false);
    expect(needsOwnerApproval("owner", "counter")).toBe(false);
  });
  it("selo da proposta", () => {
    expect(proposalBadge({ status: "draft", awaiting: null, pendingOwner: true })).toBe("waitingOwner");
    expect(proposalBadge({ status: "open", awaiting: "agency", pendingOwner: false })).toBe("waitingAgency");
    expect(proposalBadge({ status: "open", awaiting: "brand", pendingOwner: false })).toBe("waitingBrand");
    expect(proposalBadge({ status: "agreed", awaiting: null, pendingOwner: false })).toBe("agreed");
    expect(proposalBadge({ status: "closed", awaiting: null, pendingOwner: false })).toBe("closed");
  });
  it("cota esgotada ou fora do prazo não recebe proposta", () => {
    expect(canProposeOnTier({ full: false }, true, true)).toBe(true);
    expect(canProposeOnTier({ full: true }, true, true)).toBe(false);
    expect(canProposeOnTier({ full: false }, false, true)).toBe(false);
  });
  it("aviso de negociação vai por e-mail só nas rodadas e no desfecho", () => {
    expect(inboxKindEmails("sponsorship_negotiation", "/marca/oportunidades/x", { status: "countered" })).toBe(true);
    expect(inboxKindEmails("sponsorship_negotiation", "/agencia/oportunidades/x", { status: "agreed" })).toBe(true);
    expect(inboxKindEmails("sponsorship_negotiation", "/marca/oportunidades/x", { status: "approval" })).toBe(false);
  });
});

describe("público de mão dupla", () => {
  it("vazio vira null; ida e volta mantém os mesmos campos da campanha", () => {
    expect(publicToDb({ targetAudience: " ", targetAgeBands: [], targetStates: [], regionNote: "" })).toBeNull();
    const db = publicToDb({ targetAudience: "Corredores", targetAgeBands: ["25-34", "18-24"], targetStates: ["SP", "rj"], regionNote: "Zona Sul" });
    expect(db).toEqual({ target_audience: "Corredores", target_age_bands: ["18-24", "25-34"], target_states: ["RJ", "SP"], region_note: "Zona Sul" });
    expect(publicFromDb(db)).toEqual({ targetAudience: "Corredores", targetAgeBands: ["18-24", "25-34"], targetStates: ["RJ", "SP"], regionNote: "Zona Sul" });
    expect(publicFromDb({ target_audience: "", target_age_bands: [], target_states: [], region_note: "" })).toBeNull();
    expect(publicIsEmpty(null)).toBe(true);
  });
  it("chips curtos", () => {
    expect(publicChips({ targetAudience: "Corredores", targetAgeBands: ["25-34"], targetStates: ["RJ", "SP"], regionNote: "" })).toEqual(["Corredores", "25-34", "RJ, SP"]);
  });
});

describe("leituras fechadas", () => {
  it("marca: cotas com o pedido e a própria negociação", () => {
    const [o] = toBrandSponsorships([
      { id: "o1", title: "Maratona", status: "open", tiers: [{ id: "t1", name: "Master", price_cents: 1000000, perks: ["Logo"], slots: 1, full: false }],
        negotiation: { id: "p1", status: "open", awaiting: "brand", tier_name: "Master", pending_owner: false }, public: { target_audience: "Corredores" } },
    ]);
    expect(o.tiers[0].priceCents).toBe(1_000_000);
    expect(o.negotiation?.awaiting).toBe("brand");
    expect(o.public?.targetAudience).toBe("Corredores");
    const n = toBrandNegotiation({ role: "staff", can_propose: true, tiers: [], proposals: [{ id: "p1", status: "open", awaiting: "agency", amount_cents: 800000, asked_cents: 1000000, perks: ["Logo"], history: [{ id: "r1", seq: 1, side: "brand", action: "propose", amount_cents: 800000, perks: ["Logo"], state: "pending_owner" }] }] });
    expect(n?.role).toBe("staff");
    expect(n?.proposals[0].history[0].state).toBe("pending_owner");
  });
  it("creator: o que foi acordado, sem valor", () => {
    const [o] = toTalentSponsorships([{ id: "o1", title: "Maratona", status: "open", sponsors: ["Beta"], agreements: [{ brand: "Beta", tier: "Master", perks: ["Logo"] }] }]);
    expect(o.agreements).toEqual([{ brand: "Beta", tier: "Master", perks: ["Logo"] }]);
    expect(JSON.stringify(o)).not.toMatch(/cents/);
  });
});
