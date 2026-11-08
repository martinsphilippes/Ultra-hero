import { describe, expect, it } from "vitest";
import {
  agencyCallActions,
  brandCallActions,
  budgetView,
  callBrandControls,
  callFormSchema,
  callProposalBadge,
  callToDb,
  canPickWinner,
  compareFlags,
  compensationOf,
  compensationWithoutValues,
  counterTermsOk,
  deliverablesCount,
  hasMoney,
  mediaKitUrlValid,
  networksMatch,
  parseNiches,
  periodEndIso,
  proposalTerms,
  sumDeliverables,
  sumReach,
  talentCallStatus,
  toAgencyBrandCallDetail,
  toAgencyBrandCalls,
  toBrandCallDetail,
  toTalentBrandCalls,
  validateCall,
  type CallFormInput,
} from "@/lib/brand-call/logic";
import { MONEY_ONLY, type CompensationDb } from "@/lib/compensation/model";
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

// 0096: modelo de valor (fixo x por Hero) na chamada, na proposta e nas rodadas
describe("modelo de valor da chamada", () => {
  it("por Hero exige valor por Hero (nunca 'a combinar') e o máximo de Heros", () => {
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
  it("o Hero não recebe modelo nem máximo", () => {
    const [c] = toTalentBrandCalls([{ id: "c", status: "open", respond_by: "2026-11-10T00:00:00Z" }]);
    expect(c.valueModel).toBe("fixo");
    expect(c.maxHeroes).toBeNull();
  });
});

// 0140: forma de pagamento (valor, permuta e/ou performance) na chamada, na proposta, no acordo e nas rodadas
describe("forma de pagamento da chamada", () => {
  const barterOnly: CompensationDb = { money: false, barter: { offer: "Kit de produtos", value_cents: 30_000 }, performance: null };
  const perfDb: CompensationDb = { money: false, barter: null, performance: { kind: "percent", rate: 10, measure: "cupom HERO10", estimate_cents: 50_000 } };
  const withBarter: CompensationDb = { money: true, barter: { offer: "Kit de produtos", value_cents: null }, performance: null };

  it("sem a forma de pagamento (formato antigo) é só valor", () => {
    expect(hasMoney(base)).toBe(true);
    expect(hasMoney({ ...base, compensation: barterOnly })).toBe(false);
    expect(hasMoney({ ...base, compensation: withBarter })).toBe(true);
  });

  it("sem dinheiro não confere verba nem modelo de valor (lançamento só com permuta/performance)", () => {
    const noMoney: CallFormInput = { ...base, compensation: barterOnly, budgetCents: null, budgetDisplay: "exact" };
    expect(validateCall(noMoney, false, now)).toBeNull();
    expect(validateCall(noMoney, true, now)).toBeNull();
    expect(validateCall({ ...noMoney, valueModel: "por_heroi", maxHeroes: null }, false, now)).toBeNull();
    // com dinheiro, a verba continua como antes
    expect(validateCall({ ...base, compensation: withBarter, budgetCents: null, budgetDisplay: "exact" }, false, now)).toBe("budget");
    // o resto do formulário continua valendo
    expect(validateCall({ ...noMoney, deliverables: [] }, true, now)).toBe("deliverables");
  });

  it("vai ao banco com a forma de pagamento; sem dinheiro vai sem verba, 'a combinar', fixo e sem máximo", () => {
    const db = callToDb({ ...base, compensation: barterOnly, valueModel: "por_heroi", maxHeroes: 3, budgetDisplay: "exact", budgetCents: 100 });
    expect(db).toMatchObject({ budget_cents: null, budget_display: "open", value_model: "fixo", max_heroes: null, compensation: barterOnly });
    expect(callToDb({ ...base, compensation: withBarter })).toMatchObject({ budget_cents: 3_000_000, budget_display: "up_to", compensation: withBarter });
    // sem a chave, o banco mantém a forma de pagamento atual
    expect("compensation" in callToDb(base)).toBe(false);
  });

  it("o formulário confere a forma de pagamento no formato do banco", () => {
    expect(callFormSchema.safeParse({ ...base, compensation: perfDb }).success).toBe(true);
    expect(callFormSchema.safeParse({ ...base, compensation: { money: false, barter: null, performance: null } }).success).toBe(false);
    expect(callFormSchema.safeParse({ ...base, compensation: { ...barterOnly, barter: { offer: "ok", value_cents: null } } }).success).toBe(false);
  });

  it("contraproposta: entregas sempre; valor só com dinheiro; por Hero pede o máximo", () => {
    const deliverables = [{ kind: "reels", quantity: 1 }];
    expect(counterTermsOk({ money: true, amountCents: null, deliverables })).toBe(false);
    expect(counterTermsOk({ money: false, amountCents: null, deliverables })).toBe(true);
    expect(counterTermsOk({ money: false, amountCents: null, deliverables: [] })).toBe(false);
    expect(counterTermsOk({ money: true, amountCents: 100, deliverables, valueModel: "por_heroi", maxHeroes: null })).toBe(false);
    expect(counterTermsOk({ money: true, amountCents: 100, deliverables, valueModel: "por_heroi", maxHeroes: 2 })).toBe(true);
  });

  it("leitura: a regra da performance chega sem número para quem não lê valores e continua aparecendo", () => {
    expect(compensationOf(perfDb)).toEqual({ money: false, barter: null, performance: { kind: "percent", rate: 10, measure: "cupom HERO10", estimateCents: 50_000 } });
    // compensation_public: rate e estimativas nulos
    const stripped = compensationOf({ money: false, barter: null, performance: { kind: "per_sale", rate: null, measure: "link", estimate_cents: null } });
    expect(stripped.money).toBe(false);
    expect(stripped.performance).toMatchObject({ kind: "per_sale", measure: "link", estimateCents: null });
    expect(compensationOf({ money: true, barter: { offer: "Kit", value_cents: null }, performance: { kind: "percent", rate: null, measure: "cupom", estimate_cents: null } })).toMatchObject({
      money: true,
      barter: { offer: "Kit", valueCents: null },
      performance: { kind: "percent", measure: "cupom" },
    });
    expect(compensationOf(undefined)).toEqual(MONEY_ONLY);
    expect(compensationOf({ money: false, barter: null, performance: { kind: "bogus", rate: null } })).toEqual(MONEY_ONLY);
  });

  it("sem permissão para valores: o tipo e as descrições, nunca os números", () => {
    const c = compensationWithoutValues(compensationOf({ money: true, barter: { offer: "Kit", value_cents: 30_000 }, performance: { kind: "percent", rate: 10, measure: "cupom", estimate_cents: 50_000 } }));
    expect(c.barter).toEqual({ offer: "Kit", valueCents: null });
    expect(c.performance).toMatchObject({ kind: "percent", measure: "cupom", estimateCents: null });
    expect(c.performance?.rate).not.toBe(10);
  });

  it("marca: forma de pagamento da chamada, da proposta, do acordo e de cada rodada", () => {
    const d = toBrandCallDetail({
      role: "owner",
      call: { id: "c1", status: "open", compensation: barterOnly, budget_display: "open" },
      proposals: [
        {
          id: "p1", status: "agreed", compensation: perfDb, agreed_compensation: perfDb, amount_cents: null,
          history: [{ id: "r1", side: "agency", action: "propose", compensation: perfDb }, { id: "r2", side: "brand", action: "decline" }],
        },
        { id: "p2", status: "open", amount_cents: 900 },
      ],
    });
    expect(d?.call.compensation).toEqual({ money: false, barter: { offer: "Kit de produtos", valueCents: 30_000 }, performance: null });
    expect(d?.proposals[0].compensation.performance).toMatchObject({ kind: "percent", rate: 10 });
    expect(d?.proposals[0].agreedCompensation?.money).toBe(false);
    expect(d?.proposals[0].history[0].compensation.performance?.measure).toBe("cupom HERO10");
    expect(d?.proposals[0].history[1].compensation).toEqual(MONEY_ONLY);
    // banco antigo: só valor e sem acordo de forma de pagamento
    expect(d?.proposals[1]).toMatchObject({ compensation: MONEY_ONLY, agreedCompensation: null });
  });

  it("agência: o gestor nunca recebe os números da forma de pagamento (mesmo que o banco mande)", () => {
    const raw = { call: { id: "c1", status: "open", compensation: perfDb }, proposals: [{ id: "p", status: "open", compensation: barterOnly, agreed_compensation: barterOnly, history: [{ id: "r", side: "agency", action: "propose", compensation: barterOnly }] }] };
    const manager = toAgencyBrandCallDetail({ ...raw, can_values: false });
    expect(manager?.call.compensation.performance).toMatchObject({ kind: "percent", measure: "cupom HERO10", estimateCents: null });
    expect(manager?.call.compensation.performance?.rate).not.toBe(10);
    expect(manager?.proposals[0].compensation.barter).toEqual({ offer: "Kit de produtos", valueCents: null });
    expect(manager?.proposals[0].agreedCompensation?.barter?.valueCents).toBeNull();
    expect(manager?.proposals[0].history[0].compensation.barter?.valueCents).toBeNull();
    const admin = toAgencyBrandCallDetail({ ...raw, can_values: true });
    expect(admin?.call.compensation.performance?.rate).toBe(10);
    expect(admin?.proposals[0].compensation.barter?.valueCents).toBe(30_000);
    // lista: o gestor recebe só o tipo e as descrições
    const [row] = toAgencyBrandCalls([{ id: "c1", status: "open", compensation: barterOnly }], false);
    expect(row.compensation).toEqual({ money: false, barter: { offer: "Kit de produtos", valueCents: null }, performance: null });
    expect(toAgencyBrandCalls([{ id: "c1", status: "open", compensation: barterOnly }])[0].compensation.barter?.valueCents).toBe(30_000);
  });

  it("Hero: vê a permuta e a performance sem números", () => {
    const [c] = toTalentBrandCalls([{ id: "c", status: "open", respond_by: "2026-11-10T00:00:00Z", compensation: { money: false, barter: { offer: "Kit", value_cents: 30_000 }, performance: { kind: "per_lead", rate: null, measure: "link", estimate_cents: null } } }]);
    expect(c.compensation.money).toBe(false);
    expect(c.compensation.barter).toEqual({ offer: "Kit", valueCents: null });
    expect(c.compensation.performance).toMatchObject({ kind: "per_lead", measure: "link", estimateCents: null });
  });

  it("termos da proposta: o acordo congela a forma de pagamento; sem dinheiro não há valor", () => {
    const p = toBrandCallDetail({
      role: "owner",
      call: { id: "c1", status: "open" },
      proposals: [
        { id: "a", status: "agreed", amount_cents: null, compensation: barterOnly, agreed_compensation: barterOnly, agreed_value_model: "fixo", agreed_cents: null },
        { id: "b", status: "open", amount_cents: 2_000_000, value_model: "fixo", compensation: withBarter },
        { id: "c", status: "agreed", amount_cents: 150_000, value_model: "por_heroi", max_heroes: 2, agreed_value_model: "por_heroi", agreed_max_heroes: 2, agreed_cents: 150_000 },
      ],
    })!.proposals;
    expect(proposalTerms(p[0])).toMatchObject({ model: "fixo", amountCents: null, maxHeroes: null, compensation: { money: false } });
    expect(proposalTerms(p[1])).toMatchObject({ model: "fixo", amountCents: 2_000_000, compensation: { money: true, barter: { offer: "Kit de produtos" } } });
    expect(proposalTerms(p[2])).toMatchObject({ model: "por_heroi", amountCents: 150_000, maxHeroes: 2, compensation: MONEY_ONLY });
    // a forma de pagamento acordada vale mesmo que a atual mude
    expect(proposalTerms({ ...p[1], status: "agreed", agreedCompensation: compensationOf(barterOnly) })).toMatchObject({ amountCents: null, compensation: { money: false } });
  });

  it("comparação: proposta só com permuta/performance fica fora de menor valor e do custo por mil", () => {
    const f = compareFlags([
      { id: "cash1", amountCents: 2_000_000, reach: 50_000, creators: 1, pieces: 2, deliverBy: null },
      { id: "cash2", amountCents: 2_200_000, reach: 80_000, creators: 1, pieces: 2, deliverBy: null },
      { id: "barter", amountCents: null, reach: 100_000, creators: 1, pieces: 2, deliverBy: null },
    ]);
    expect(f.cash1.cheapest).toBe(true);
    expect(f.barter).toMatchObject({ cheapest: false, costPerThousand: null, widestReach: true });
  });
});
