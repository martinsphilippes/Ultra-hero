import { describe, expect, it } from "vitest";
import { offerState, offerStatus, toOfferView, type OfferRound } from "@/lib/deals/offer";

// Proposta da marca no negócio (0106): vez de quem, acordo e leitura do JSON (espelho de public.deal_offer_state).

const round = (seq: number, side: "agency" | "brand", action: "accept" | "counter" | "decline"): OfferRound => ({
  id: `r${seq}`,
  seq,
  side,
  action,
  amountCents: action === "decline" ? null : 100000,
  valueModel: "fixo",
  maxHeroes: null,
  periodStart: null,
  periodEnd: null,
  note: "",
  actorLabel: "",
  createdAt: "2026-11-04T12:00:00Z",
});

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
    expect(view?.brandTerms).toEqual({ source: "request", amountCents: null, valueModel: "fixo", maxHeroes: null, periodStart: "2026-12-01", periodEnd: "2026-12-10" });
    expect(view?.rounds.map((r) => r.id)).toEqual(["a", "b"]);
    expect(view?.rounds[1]).toMatchObject({ valueModel: "por_heroi", maxHeroes: 2, amountCents: null });
    expect(view?.turn).toBe("brand");
  });
  it("recusa JSON sem quem lê", () => {
    expect(toOfferView(null)).toBeNull();
    expect(toOfferView({ viewer: "talent" })).toBeNull();
  });
});
