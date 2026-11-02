import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { consultSchema } from "@/lib/deals/schemas";
import { splitSystemBody } from "@/lib/deals/vocab";
import { termsSchema } from "@/lib/execution/vocab";
import {
  conflictsByTalent,
  counterDecideSchema,
  counterofferPayload,
  counterofferSchema,
  dayShift,
  groupByDealTalent,
  lastDecided,
  openCounteroffer,
  proposedDateRange,
  toConflicts,
  toCounteroffers,
} from "@/lib/offer/counteroffer";
import { EMPTY_RIGHTS, parseCompetitors, rightsDefined, rightsIssue, rightsPayload, toRights } from "@/lib/offer/rights";
import { talentErrorCode } from "@/lib/talent/error-codes";
import { buildTalentToday, type TalentTodayData } from "@/lib/today/logic";
import { toTalentToday } from "@/lib/today/normalize";

// Bloco 2 (0079): direitos de uso estruturados, contraproposta e alerta de exclusividade — regras puras.

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("direitos de uso estruturados", () => {
  it("normaliza o JSON do banco: canais conhecidos, sem repetir, na ordem da lista", () => {
    const r = toRights({ channels: ["email", "social", "radio", "social"], usage_months: 6, perpetual: false, boost: true, exclusive: true, exclusivity_months: "3", segments: ["Beleza"], competitors: ["X"], category: "Cosméticos" });
    expect(r.channels).toEqual(["social", "email"]);
    expect(r.usageMonths).toBe(6);
    expect(r.exclusivityMonths).toBe(3);
    expect(r.boost).toBe(true);
    expect(r.segments).toEqual(["Beleza"]);
  });
  it("lixo vira direitos vazios", () => {
    expect(toRights(null)).toEqual(EMPTY_RIGHTS);
    expect(toRights([1, 2])).toEqual(EMPTY_RIGHTS);
    expect(rightsDefined(EMPTY_RIGHTS)).toBe(false);
    expect(rightsDefined({ ...EMPTY_RIGHTS, perpetual: true })).toBe(true);
  });
  it("concorrentes: vírgula, ponto e vírgula ou linha; sem repetir (maiúsculas) e sem nomes curtos", () => {
    expect(parseCompetitors("Marca A, marca a; Marca B\n  X \n Outra   Marca ")).toEqual(["Marca A", "Marca B", "Outra Marca"]);
    expect(parseCompetitors(Array.from({ length: 30 }, (_, i) => `Marca ${i}`).join(","))).toHaveLength(20);
  });
  it("exclusividade exige prazo; prazo de uso dentro do limite", () => {
    expect(rightsIssue({ ...EMPTY_RIGHTS, exclusive: true })).toBe("exclusivity_months");
    expect(rightsIssue({ ...EMPTY_RIGHTS, exclusive: true, exclusivityMonths: 61 })).toBe("exclusivity_months");
    expect(rightsIssue({ ...EMPTY_RIGHTS, usageMonths: 0 })).toBe("usage_months");
    expect(rightsIssue({ ...EMPTY_RIGHTS, usageMonths: 121 })).toBe("usage_months");
    expect(rightsIssue({ ...EMPTY_RIGHTS, exclusive: true, exclusivityMonths: 3, segmentIds: Array.from({ length: 11 }, (_, i) => ID(i)) })).toBe("too_many_segments");
    expect(rightsIssue({ ...EMPTY_RIGHTS, usageMonths: 12, exclusive: true, exclusivityMonths: 3 })).toBeNull();
  });
  it("payload: perpétuo zera o prazo; sem exclusividade os campos dela vão vazios", () => {
    expect(rightsPayload({ ...EMPTY_RIGHTS, perpetual: true, usageMonths: 12 }).usage_months).toBeNull();
    const p = rightsPayload({ ...EMPTY_RIGHTS, channels: ["social"], exclusive: false, exclusivityMonths: 3, competitors: ["X"], category: "C", segmentIds: [ID(1)] });
    expect(p).toMatchObject({ channels: ["social"], exclusive: false, exclusivity_months: null, competitors: [], category: "", segment_ids: [] });
    const q = rightsPayload({ ...EMPTY_RIGHTS, exclusive: true, exclusivityMonths: 4, competitors: ["Beta"], category: " Cosméticos ", segmentIds: [ID(1), ID(1)] });
    expect(q).toMatchObject({ exclusive: true, exclusivity_months: 4, competitors: ["Beta"], category: "Cosméticos", segment_ids: [ID(1)] });
  });
  it("formulário dos termos aceita os direitos (opcionais) e recusa canal desconhecido", () => {
    const base = { dealId: ID(1), summary: "Um reels e três stories com aprovação.", usageRights: "", exclusivity: "", validUntil: "" };
    expect(termsSchema.safeParse(base).success).toBe(true);
    expect(termsSchema.safeParse({ ...base, rights: { ...EMPTY_RIGHTS, channels: ["social"], usageMonths: 6 } }).success).toBe(true);
    expect(termsSchema.safeParse({ ...base, rights: { ...EMPTY_RIGHTS, channels: ["radio"] } }).success).toBe(false);
  });
});

describe("contraproposta", () => {
  const raw = [
    { id: ID(1), deal_talent_id: ID(9), kind: "fee", fee_cents: 200000, previous_fee_cents: 150000, status: "accepted", reason: "Edição", decided_at: "2026-11-01T10:00:00Z", created_at: "2026-10-30T10:00:00Z" },
    { id: ID(2), deal_talent_id: ID(9), kind: "date", proposed_date: "2026-12-10", previous_date: "2026-12-05", status: "rejected", decision_note: "Não dá", decided_at: "2026-11-02T10:00:00Z", created_at: "2026-11-01T12:00:00Z" },
    { id: ID(3), deal_talent_id: ID(8), kind: "fee", fee_cents: null, status: "open", created_at: "2026-11-02T09:00:00Z" },
    { id: ID(4), kind: "outra", status: "open", created_at: "2026-11-02T09:00:00Z" },
  ];
  it("normaliza, descarta tipo desconhecido e ordena do mais novo para o mais antigo", () => {
    const list = toCounteroffers(raw);
    expect(list.map((c) => c.id)).toEqual([ID(3), ID(2), ID(1)]);
    expect(list[0]?.feeCents).toBeNull();
    expect(list[2]?.previousFeeCents).toBe(150000);
  });
  it("aberta, última decidida e agrupamento por creator", () => {
    const list = toCounteroffers(raw);
    expect(openCounteroffer(list)?.id).toBe(ID(3));
    expect(lastDecided(list)?.id).toBe(ID(2));
    expect(Object.keys(groupByDealTalent(list)).sort()).toEqual([ID(8), ID(9)]);
    expect(openCounteroffer([])).toBeNull();
  });
  it("valor exige justificativa; data aceita entrega vazia; decisão de recusa exige nota", () => {
    expect(counterofferSchema.safeParse({ dealTalentId: ID(1), kind: "fee", feeCents: 1000, reason: "ok" }).success).toBe(false);
    expect(counterofferSchema.safeParse({ dealTalentId: ID(1), kind: "fee", feeCents: 0, reason: "Motivo" }).success).toBe(false);
    expect(counterofferSchema.safeParse({ dealTalentId: ID(1), kind: "fee", feeCents: 1000, reason: "Motivo" }).success).toBe(true);
    expect(counterofferSchema.safeParse({ dealTalentId: ID(1), kind: "date", proposedDate: "2026-12-01", deliverableId: "", reason: "" }).success).toBe(true);
    expect(counterofferSchema.safeParse({ dealTalentId: ID(1), kind: "date", proposedDate: "01/12/2026", deliverableId: "", reason: "" }).success).toBe(false);
    expect(counterDecideSchema.safeParse({ counterofferId: ID(1), dealId: ID(2), decision: "rejected", note: "" }).success).toBe(false);
    expect(counterDecideSchema.safeParse({ counterofferId: ID(1), dealId: ID(2), decision: "rejected", note: "Sem verba" }).success).toBe(true);
    expect(counterDecideSchema.safeParse({ counterofferId: ID(1), dealId: ID(2), decision: "accepted", note: "" }).success).toBe(true);
  });
  it("payload da RPC: só os campos do tipo", () => {
    expect(counterofferPayload({ dealTalentId: ID(1), kind: "fee", feeCents: 1000, reason: "Motivo" })).toEqual({ fee_cents: 1000, reason: "Motivo" });
    expect(counterofferPayload({ dealTalentId: ID(1), kind: "date", proposedDate: "2026-12-01", deliverableId: "", reason: "" })).toEqual({ proposed_date: "2026-12-01", deliverable_id: null, reason: "" });
  });
  it("dias entre datas e faixa da data proposta no fuso", () => {
    expect(dayShift("2026-12-05", "2026-12-10")).toBe(5);
    expect(dayShift("2026-12-10", "2026-12-05")).toBe(-5);
    expect(dayShift(null, "2026-12-05")).toBeNull();
    // 01:30 UTC do dia 2 ainda é dia 1 em São Paulo
    expect(proposedDateRange(new Date("2026-11-02T01:30:00Z"), "America/Sao_Paulo")).toEqual({ min: "2026-11-01", max: "2027-11-01" });
  });
});

describe("alerta de exclusividade", () => {
  it("normaliza conflitos e agrupa por talento (sem conflito, fora)", () => {
    const items = [{ deal_id: ID(5), deal_title: "X", brand_name: "Beta", until: "2027-02-12", category: "", segments: ["Beleza"], competitor: true }];
    expect(toConflicts(items)[0]).toEqual({ dealId: ID(5), dealTitle: "X", brandName: "Beta", until: "2027-02-12", category: "", segments: ["Beleza"], competitor: true });
    const map = conflictsByTalent([{ talent_id: ID(1), items }, { talent_id: ID(2), items: [] }, { items }]);
    expect(Object.keys(map)).toEqual([ID(1)]);
  });
  it("consulta aceita a confirmação opcional", () => {
    expect(consultSchema.safeParse({ dealId: ID(1), dealTalentIds: [ID(2)], days: 5, message: "" }).success).toBe(true);
    expect(consultSchema.safeParse({ dealId: ID(1), dealTalentIds: [ID(2)], days: 5, message: "", confirmConflicts: true }).success).toBe(true);
  });
  it("códigos de erro novos chegam traduzidos à agência e ao creator", () => {
    expect(AGENCY_ERROR_CODES).toContain("exclusivity_conflict");
    expect(agencyErrorCode({ message: "exclusivity_conflict" })).toBe("exclusivity_conflict");
    expect(talentErrorCode({ message: "counteroffer_open" })).toBe("counteroffer_open");
  });
  it("atividade de sistema com parâmetro", () => {
    expect(splitSystemBody("exclusivity_confirmed|Ana, Bia")).toEqual({ code: "exclusivity_confirmed", param: "Ana, Bia" });
    expect(splitSystemBody("contract_confirmed")).toEqual({ code: "contract_confirmed", param: "" });
  });
});

describe('"Hoje" do creator com contraproposta', () => {
  it("a oferta pendente mostra a situação da contraproposta", () => {
    const data = toTalentToday({
      timezone: "America/Sao_Paulo",
      tasks: [],
      deliverables: [],
      terms: [],
      offers: [
        { deal_talent_id: ID(1), status: "consulted", respond_by: "2026-11-03T12:00:00Z", consulted_at: "2026-11-01T12:00:00Z", deal_title: "A", brand_name: "M", counter_status: "open" },
        { deal_talent_id: ID(2), status: "consulted", respond_by: null, consulted_at: "2026-11-01T12:00:00Z", deal_title: "B", brand_name: "M", counter_status: "withdrawn" },
      ],
    }) as TalentTodayData;
    const items = buildTalentToday(data, new Date("2026-11-02T12:00:00Z"));
    expect(items.find((i) => i.key === `offer:${ID(1)}`)?.status).toBe("counter_open");
    expect(items.find((i) => i.key === `offer:${ID(2)}`)?.status).toBe("consulted");
  });
});
