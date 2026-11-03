import { describe, expect, it } from "vitest";
import {
  agencyCallActions,
  brandCallActions,
  budgetView,
  callBrandControls,
  callProposalBadge,
  callToDb,
  canPickWinner,
  compareFlags,
  deliverablesCount,
  mediaKitUrlValid,
  networksMatch,
  parseNiches,
  periodEndIso,
  sumDeliverables,
  sumReach,
  talentCallStatus,
  toAgencyBrandCallDetail,
  toBrandCallDetail,
  toTalentBrandCalls,
  validateCall,
  type CallFormInput,
} from "@/lib/brand-call/logic";
import { EMPTY_PUBLIC } from "@/lib/sponsorship/negotiation";

// Chamada da marca (0089): lógica pura do formulário, das entregas, do alcance, da verba e de quem pode o quê.

const base: CallFormInput = {
  id: null,
  title: "Lançamento verão",
  objective: "launch",
  description: "",
  startsOn: "2026-12-01",
  endsOn: "2026-12-20",
  location: "",
  public: EMPTY_PUBLIC,
  deliverables: [{ kind: "reels", quantity: 2, network: "instagram" }],
  creatorsWanted: 3,
  niches: ["Beleza"],
  networks: ["instagram"],
  budgetCents: 3_000_000,
  budgetDisplay: "up_to",
  valueModel: "fixo",
  maxHeroes: null,
  respondDate: "2026-11-20",
  respondTime: "18:00",
  audience: "my_agencies",
  agencyIds: [],
};
const now = new Date("2026-11-03T12:00:00Z");

describe("nichos", () => {
  it("separa por vírgula/linha, limpa, não repete (sem diferenciar maiúsculas) e corta em 10", () => {
    expect(parseNiches(" Beleza,  praia\nbeleza ; a , Bem   estar")).toEqual(["Beleza", "praia", "Bem estar"]);
    expect(parseNiches(Array.from({ length: 12 }, (_, i) => `n${i}x`).join(","))).toHaveLength(10);
  });
});

describe("entregas", () => {
  it("soma por tipo + rede na ordem da primeira aparição, com teto de 100", () => {
    const out = sumDeliverables([
      { kind: "reels", quantity: 2, network: "instagram" },
      { kind: "stories", quantity: 5, network: "instagram" },
      { kind: "reels", quantity: 1, network: "instagram" },
      { kind: "reels", quantity: 1, network: "tiktok" },
      { kind: "post", quantity: 80, network: null },
      { kind: "post", quantity: 80, network: null },
    ]);
    expect(out).toEqual([
      { kind: "reels", quantity: 3, network: "instagram" },
      { kind: "stories", quantity: 5, network: "instagram" },
      { kind: "reels", quantity: 1, network: "tiktok" },
      { kind: "post", quantity: 100, network: null },
    ]);
    expect(deliverablesCount(out)).toBe(109);
  });
});

describe("alcance e media kit", () => {
  it("soma os seguidores declarados; sem números = null", () => {
    expect(
      sumReach([
        { networks: [{ network: "instagram", handle: "a", followers: 80_000 }, { network: "tiktok", handle: "a", followers: null }] },
        { networks: [{ network: "youtube", handle: "b", followers: 20_000 }] },
      ]),
    ).toBe(100_000);
    expect(sumReach([{ networks: [{ network: "instagram", handle: "a", followers: null }] }])).toBeNull();
  });
  it("link do media kit: vazio ou https", () => {
    expect(mediaKitUrlValid("")).toBe(true);
    expect(mediaKitUrlValid("https://kit.exemplo.com/a")).toBe(true);
    expect(mediaKitUrlValid("http://kit.exemplo.com")).toBe(false);
    expect(mediaKitUrlValid("javascript:alert(1)")).toBe(false);
  });
  it("combina com as redes do creator", () => {
    expect(networksMatch(["instagram", "tiktok"], ["tiktok"])).toBe(true);
    expect(networksMatch(["youtube"], ["tiktok"])).toBe(false);
  });
});

describe("verba", () => {
  it("a combinar nunca mostra valor; gestor e creator não leem; Adm vê na forma escolhida", () => {
    expect(budgetView("open", 100, true)).toEqual({ kind: "open" });
    expect(budgetView("up_to", 3_000_000, true)).toEqual({ kind: "up_to", cents: 3_000_000 });
    expect(budgetView("exact", 3_000_000, false)).toEqual({ kind: "hidden" });
    expect(budgetView("exact", null, true)).toEqual({ kind: "hidden" });
  });
});

describe("formulário", () => {
  it("rascunho só precisa de título, período e verba coerente", () => {
    expect(validateCall({ ...base, deliverables: [], networks: [], respondDate: "" }, false, now)).toBeNull();
    expect(validateCall({ ...base, title: "ab" }, false, now)).toBe("title");
    expect(validateCall({ ...base, endsOn: "2026-11-01" }, false, now)).toBe("period");
    expect(validateCall({ ...base, budgetCents: null }, false, now)).toBe("budget");
    expect(validateCall({ ...base, budgetCents: null, budgetDisplay: "open" }, false, now)).toBeNull();
  });
  it("publicar exige entregas, redes, agências escolhidas e prazo no futuro até o fim do período", () => {
    expect(validateCall(base, true, now)).toBeNull();
    expect(validateCall({ ...base, deliverables: [] }, true, now)).toBe("deliverables");
    expect(validateCall({ ...base, networks: [] }, true, now)).toBe("networks");
    expect(validateCall({ ...base, audience: "selected" }, true, now)).toBe("agencies");
    expect(validateCall({ ...base, respondDate: "2026-11-01" }, true, now)).toBe("respond");
    expect(validateCall({ ...base, respondDate: "2026-12-21", respondTime: "00:01" }, true, now)).toBe("respondAfterPeriod");
    expect(validateCall({ ...base, respondDate: "2026-12-20", respondTime: "23:59" }, true, now)).toBeNull();
  });
  it("fim do período é a meia-noite do dia seguinte em Brasília", () => {
    expect(periodEndIso("2026-12-20")).toBe("2026-12-21T03:00:00.000Z");
  });
  it("vai ao banco em snake_case, sem agências fora de 'selected' e sem rede vazia", () => {
    const db = callToDb({ ...base, deliverables: [{ kind: "post", quantity: 1, network: null }], agencyIds: ["11111111-1111-4111-8111-111111111111"] });
    expect(db.agency_ids).toEqual([]);
    expect(db.deliverables).toEqual([{ kind: "post", quantity: 1 }]);
    expect(db.ends_on).toBe("2026-12-20");
    expect(db.respond_by).toBe("2026-11-20T21:00:00.000Z");
  });
});

describe("quem pode o quê", () => {
  const open = { status: "open" as const, awaiting: "brand" as const, pendingOwner: false };
  it("marca responde na vez dela, sem rodada esperando o dono e antes da decisão", () => {
    expect(brandCallActions(open, false, true)).toEqual(["accept", "counter", "decline"]);
    expect(brandCallActions({ ...open, pendingOwner: true }, false, true)).toEqual([]);
    expect(brandCallActions(open, true, true)).toEqual([]);
    expect(brandCallActions({ ...open, awaiting: "agency" }, false, true)).toEqual([]);
  });
  it("agência: só o Adm, na vez dela", () => {
    expect(agencyCallActions({ status: "open", awaiting: "agency" }, false, true)).toEqual(["accept", "counter", "decline"]);
    expect(agencyCallActions({ status: "open", awaiting: "agency" }, false, false)).toEqual([]);
  });
  it("vencedora: acordada, ou aberta na vez da marca sem rodada pendente", () => {
    expect(canPickWinner({ status: "agreed", awaiting: null, pendingOwner: false })).toBe(true);
    expect(canPickWinner(open)).toBe(true);
    expect(canPickWinner({ ...open, awaiting: "agency" })).toBe(false);
    expect(canPickWinner({ ...open, pendingOwner: true })).toBe(false);
  });
  it("selo da proposta", () => {
    expect(callProposalBadge({ status: "draft", awaiting: null, pendingOwner: false })).toBe("waitingOwner");
    expect(callProposalBadge(open)).toBe("waitingBrand");
    expect(callProposalBadge({ status: "agreed", awaiting: null, pendingOwner: false })).toBe("agreed");
  });
  it("controles da chamada: equipe não edita esperando o dono; só o dono decide", () => {
    expect(callBrandControls({ status: "draft", approval: "pending", decidedAt: null }, "staff")).toMatchObject({ edit: false, submit: false, withdraw: true, review: false });
    expect(callBrandControls({ status: "draft", approval: "pending", decidedAt: null }, "owner")).toMatchObject({ edit: true, review: true });
    expect(callBrandControls({ status: "open", approval: "none", decidedAt: null }, "staff").decide).toBe(false);
    expect(callBrandControls({ status: "closed", approval: "none", decidedAt: null }, "owner").decide).toBe(true);
    expect(callBrandControls({ status: "contracted", approval: "none", decidedAt: "2026-11-03" }, "owner")).toMatchObject({ decide: false, cancel: false });
  });
});

describe("comparação", () => {
  it("destaca menor valor, maior alcance, mais peças e custo por mil", () => {
    const f = compareFlags([
      { id: "a", amountCents: 2_200_000, reach: 80_000, creators: 1, pieces: 8, deliverBy: null },
      { id: "b", amountCents: 2_000_000, reach: 50_000, creators: 1, pieces: 2, deliverBy: null },
    ]);
    expect(f.a).toMatchObject({ cheapest: false, widestReach: true, mostPieces: true, costPerThousand: 27_500 });
    expect(f.b).toMatchObject({ cheapest: true, widestReach: false, mostPieces: false, costPerThousand: 40_000 });
  });
  it("uma proposta só não ganha destaques", () => {
    const f = compareFlags([{ id: "a", amountCents: 100, reach: 10, creators: 1, pieces: 1, deliverBy: null }]);
    expect(f.a).toMatchObject({ cheapest: false, widestReach: false, mostPieces: false });
  });
});

describe("leitura das RPCs", () => {
  it("marca: chamada, alvo, propostas com creators e rodadas", () => {
    const d = toBrandCallDetail({
      role: "staff",
      call: { id: "c1", title: "X", status: "open", budget_display: "up_to", budget_cents: 300, audience: "selected", approval_status: "none", deliverables: [{ kind: "reels", quantity: 2 }, { kind: "bogus", quantity: 1 }], networks: ["instagram", "nope"] },
      targets: [{ id: "a1", name: "A" }],
      proposals: [{ id: "p1", agency_name: "A", status: "open", awaiting: "brand", amount_cents: 200, pending_owner: true, talents: [{ talent_id: "t1", card: { name: "T", networks: [{ network: "instagram", followers: 10 }] }, deliverables: [] }], history: [{ id: "r1", side: "agency", action: "propose", state: "sent", amount_cents: 200 }] }],
    });
    expect(d?.call.deliverables).toEqual([{ kind: "reels", quantity: 2, network: null }]);
    expect(d?.call.networks).toEqual(["instagram"]);
    expect(d?.proposals[0]).toMatchObject({ amountCents: 200, pendingOwner: true, awaiting: "brand" });
    expect(d?.proposals[0].talents[0].card).toMatchObject({ id: "t1", name: "T" });
    expect(toBrandCallDetail(null)).toBeNull();
  });
  it("agência: sem valor para o gestor (has_amount) e candidatos", () => {
    const d = toAgencyBrandCallDetail({ can_values: false, call: { id: "c1", status: "open" }, proposals: [{ id: "p", status: "draft", has_amount: true }], candidates: [{ id: "t", name: "T", networks: ["tiktok"], interested: true }] });
    expect(d?.canValues).toBe(false);
    expect(d?.proposals[0]).toMatchObject({ amountCents: null, hasAmount: true });
    expect(d?.candidates[0].interested).toBe(true);
  });
  it("creator: nunca valor; situação vista por ele", () => {
    const [c] = toTalentBrandCalls([{ id: "c", status: "open", respond_by: "2026-11-10T00:00:00Z", budget_cents: 999, my_interest: { message: "oi", at: "x" } }]);
    expect(c.budgetCents).toBeNull();
    expect(c.myInterest?.message).toBe("oi");
    expect(talentCallStatus(c, now)).toBe("open");
    expect(talentCallStatus({ ...c, respondBy: "2026-11-01T00:00:00Z" }, now)).toBe("expired");
    expect(talentCallStatus({ ...c, chosen: true }, now)).toBe("chosen");
    expect(talentCallStatus({ ...c, status: "contracted" }, now)).toBe("closed");
  });
});

// 0096: modelo de valor (fixo x por herói) na chamada, na proposta e nas rodadas
describe("modelo de valor da chamada", () => {
  it("por herói exige valor por herói (nunca 'a combinar') e o máximo de heróis", () => {
    const perHero: CallFormInput = { ...base, valueModel: "por_heroi", maxHeroes: 3, budgetDisplay: "exact", budgetCents: 200_000 };
    expect(validateCall(perHero, false, now)).toBeNull();
    expect(validateCall({ ...perHero, maxHeroes: null }, false, now)).toBe("maxHeroes");
    expect(validateCall({ ...perHero, budgetCents: null }, false, now)).toBe("budget");
    expect(validateCall({ ...perHero, budgetDisplay: "open" }, false, now)).toBe("budget");
    // fixo continua como antes (a combinar vale)
    expect(validateCall({ ...base, budgetDisplay: "open", budgetCents: null }, false, now)).toBeNull();
  });
  it("vai ao banco com modelo e máximo; fixo não leva máximo", () => {
    expect(callToDb({ ...base, valueModel: "por_heroi", maxHeroes: 4, budgetDisplay: "exact", budgetCents: 100 })).toMatchObject({ value_model: "por_heroi", max_heroes: 4, budget_cents: 100 });
    expect(callToDb({ ...base, valueModel: "fixo", maxHeroes: 4 })).toMatchObject({ value_model: "fixo", max_heroes: null });
  });
  it("leitura: modelo e máximo da chamada, da proposta (e do acordo congelado) e das rodadas", () => {
    const d = toBrandCallDetail({
      role: "owner",
      call: { id: "c1", status: "open", value_model: "por_heroi", max_heroes: 3, budget_cents: 200_000, budget_display: "exact" },
      proposals: [
        {
          id: "p1", status: "agreed", value_model: "por_heroi", max_heroes: 2, amount_cents: 150_000,
          agreed_value_model: "por_heroi", agreed_max_heroes: 2, agreed_cents: 150_000,
          history: [{ id: "r1", side: "agency", action: "propose", value_model: "fixo", amount_cents: 300_000 }, { id: "r2", side: "brand", action: "decline" }],
        },
        { id: "p2", status: "open", amount_cents: 900 },
      ],
    });
    expect(d?.call).toMatchObject({ valueModel: "por_heroi", maxHeroes: 3 });
    expect(d?.proposals[0]).toMatchObject({ valueModel: "por_heroi", maxHeroes: 2, agreedValueModel: "por_heroi", agreedMaxHeroes: 2 });
    expect(d?.proposals[0].history[0]).toMatchObject({ valueModel: "fixo" });
    expect(d?.proposals[0].history[1]).toMatchObject({ valueModel: null, maxHeroes: null });
    // sem as chaves (banco antigo), tudo é fixo e sem máximo
    expect(d?.proposals[1]).toMatchObject({ valueModel: "fixo", maxHeroes: null, agreedValueModel: null });
  });
  it("o herói não recebe modelo nem máximo", () => {
    const [c] = toTalentBrandCalls([{ id: "c", status: "open", respond_by: "2026-11-10T00:00:00Z" }]);
    expect(c.valueModel).toBe("fixo");
    expect(c.maxHeroes).toBeNull();
  });
});
