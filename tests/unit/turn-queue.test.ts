import { describe, expect, it } from "vitest";
import { nextStep } from "@/lib/deals/next-step";
import {
  agencyNeedsRefine,
  agencySource,
  brandSource,
  buildTurnQueue,
  compareTurn,
  deadlineDay,
  heroSource,
  offerState,
  termsFor,
  type AgencyDealRow,
  type AgencyViewer,
  type DeliverableRowLite,
  type TurnItem,
} from "@/lib/deals/turn-queue";

// "Sua vez" na tela inicial (05/11): linhas lidas em lote → motor do próximo passo → só ações, do mais urgente.
const TZ = "America/Sao_Paulo";
const TODAY = "2026-11-05";

const deal = (over: Partial<AgencyDealRow> = {}): AgencyDealRow => ({
  id: "deal-1", title: "Verão", stage: "contracting", outcome: null, stageChangedAt: "2026-11-01T12:00:00Z", ownerId: null, team: [], requestId: "req-1",
  brandName: "Marca X", brandVisible: true, origin: "brand", contractConfirmedAt: null,
  talents: [{ id: "dt1", status: "proposed", respondBy: null, termsReady: true, name: "Ana" }], ...over,
});
const manager: AgencyViewer = { userId: "u-man", isManager: true, isAdmin: false, canWork: () => true };
const staff: AgencyViewer = { userId: "u-staff", isManager: false, isAdmin: false, canWork: (own) => own };
const admin: AgencyViewer = { userId: "u-adm", isManager: true, isAdmin: true, canWork: () => true };
const accepted = (dealId = "deal-1") => ({
  terms: [{ id: `t-${dealId}`, dealId, status: "accepted", validUntil: null, version: 1 }],
  acceptances: [],
  deliverables: [] as DeliverableRowLite[],
});
const deliv = (over: Partial<DeliverableRowLite> = {}): DeliverableRowLite => ({
  id: "dv1", dealId: "deal-1", dealTalentId: "dt1", heroName: "Ana", title: "Reels", kind: "reel", status: "submitted", dueAt: "2026-11-10T15:00:00Z", publishAt: null, ...over,
});

describe("adaptadores (linhas em lote → FlowInput)", () => {
  it("termos: versão mais nova primeiro, com os aceites daquela versão", () => {
    const rows = termsFor(
      "d",
      [
        { id: "a", dealId: "d", status: "superseded", validUntil: null, version: 1 },
        { id: "b", dealId: "d", status: "sent", validUntil: "2026-11-20", version: 2 },
        { id: "c", dealId: "outro", status: "sent", validUntil: null, version: 9 },
      ],
      [{ termsId: "b", party: "brand", dealTalentId: null }],
    );
    expect(rows.map((r) => r.status)).toEqual(["sent", "superseded"]);
    expect(rows[0].acceptances).toEqual([{ party: "brand", dealTalentId: null }]);
  });

  it("negociação: sem rodadas a vez é da agência; aceite fecha; última da agência passa para a marca", () => {
    expect(offerState([])).toEqual({ turn: "agency", agreed: false, hasRounds: false });
    expect(offerState([{ dealId: "d", seq: 1, side: "agency", action: "counter" }])).toMatchObject({ turn: "brand", agreed: false });
    expect(offerState([{ dealId: "d", seq: 2, side: "brand", action: "decline" }, { dealId: "d", seq: 1, side: "agency", action: "counter" }])).toMatchObject({ turn: "agency" });
    expect(offerState([{ dealId: "d", seq: 3, side: "brand", action: "accept" }])).toMatchObject({ turn: null, agreed: true });
  });

  it("agência: todos aceitaram → gestor confirma a contratação (um clique); colaborador fora da equipe não", () => {
    const d = deal();
    const asManager = agencySource(d, accepted(), manager, null);
    expect(nextStep(asManager.flow, asManager.viewer)).toMatchObject({ mode: "action", code: "confirmContract" });
    const asStaff = agencySource(d, accepted(), staff, null);
    expect(nextStep(asStaff.flow, asStaff.viewer).mode).toBe("waiting");
    const q = buildTurnQueue("agency", [asManager], { today: TODAY, timeZone: TZ });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ quick: "confirmContract", href: "/agencia/negocios/deal-1/termos", counterpart: "Marca X", flow: "contracting" });
  });

  it("agência: Adm lê rodadas e condições em lote (proposta da marca → responder; sem condições → definir)", () => {
    const pre = deal({ stage: "negotiation", talents: [] });
    const s = agencySource(pre, accepted(), admin, { rounds: [{ dealId: "deal-1", seq: 1, side: "brand", action: "counter" }], planDealIds: new Set() });
    expect(nextStep(s.flow, s.viewer)).toMatchObject({ code: "answerOffer" });
    const terms = deal({ stage: "contracting" });
    const noPlan = agencySource(terms, { terms: [], acceptances: [], deliverables: [] }, admin, { rounds: [], planDealIds: new Set() });
    expect(nextStep(noPlan.flow, noPlan.viewer)).toMatchObject({ code: "setPlan" });
    const withPlan = agencySource(terms, { terms: [], acceptances: [], deliverables: [] }, admin, { rounds: [], planDealIds: new Set(["deal-1"]) });
    expect(nextStep(withPlan.flow, withPlan.viewer)).toMatchObject({ code: "sendTerms" });
  });

  it("gestor: sem ler rodadas/condições, pede a RPC só onde mudaria a resposta", () => {
    const pre = deal({ stage: "negotiation", talents: [] });
    const s = agencySource(pre, accepted(), manager, null);
    expect(agencyNeedsRefine(pre, nextStep(s.flow, s.viewer))).toEqual({ offer: true, plan: false });
    const refined = agencySource(pre, accepted(), manager, null, { offer: { open: true, turn: "agency", agreed: false, canReply: false } });
    expect(nextStep(refined.flow, refined.viewer)).toMatchObject({ mode: "waiting", code: "waitAdminOffer" });
    const terms = deal({ stage: "contracting" });
    const st = agencySource(terms, { terms: [], acceptances: [], deliverables: [] }, manager, null);
    expect(agencyNeedsRefine(terms, nextStep(st.flow, st.viewer))).toEqual({ offer: false, plan: true });
    const noPlan = agencySource(terms, { terms: [], acceptances: [], deliverables: [] }, manager, null, { plan: { hasPlan: false, canEdit: false } });
    expect(nextStep(noPlan.flow, noPlan.viewer)).toMatchObject({ mode: "waiting", code: "waitAdminPlan" });
  });

  it("colaborador da equipe do negócio age; o responsável também", () => {
    const d = deal({ stage: "production", contractConfirmedAt: "2026-11-02T00:00:00Z", team: ["u-staff"] });
    const s = agencySource(d, { terms: [], acceptances: [], deliverables: [deliv({ status: "proof_submitted" })] }, staff, null);
    expect(nextStep(s.flow, s.viewer)).toMatchObject({ mode: "action", code: "closeDeliverable" });
  });

  it("marca: dono aceita os termos; equipe aguarda; entrega enviada → aprovar", () => {
    const c = { requestId: "req-1", dealId: "deal-1", title: "Verão", status: "contracting", updatedAt: null, talentName: "Ana" };
    const rows = { terms: [{ id: "t", dealId: "deal-1", status: "sent", validUntil: "2026-11-08", version: 1 }], acceptances: [], deliverables: [], rounds: [] };
    const asOwner = buildTurnQueue("brand", [brandSource(c, rows, { isOwner: true, canAct: true })], { today: TODAY, timeZone: TZ });
    expect(asOwner[0]).toMatchObject({ step: { code: "acceptTerms" }, href: "/marca/campanhas/req-1#camp-terms", day: "2026-11-08", late: false, quick: null });
    expect(buildTurnQueue("brand", [brandSource(c, rows, { isOwner: false, canAct: true })], { today: TODAY, timeZone: TZ })).toHaveLength(0);
    const running = { ...c, status: "running" };
    const q = buildTurnQueue("brand", [brandSource(running, { ...rows, deliverables: [deliv()] }, { isOwner: false, canAct: true })], { today: TODAY, timeZone: TZ });
    expect(q[0]).toMatchObject({ step: { code: "approveDeliverable" }, href: "/marca/campanhas/req-1#camp-deliverables" });
  });

  it("marca: contraproposta da agência espera o dono", () => {
    const c = { requestId: "req-1", dealId: "deal-1", title: "Verão", status: "proposal", updatedAt: null, talentName: null };
    const rows = { terms: [], acceptances: [], deliverables: [], rounds: [{ dealId: "deal-1", seq: 1, side: "agency" as const, action: "counter" as const }] };
    expect(buildTurnQueue("brand", [brandSource(c, rows, { isOwner: true, canAct: true })], { today: TODAY, timeZone: TZ })[0]).toMatchObject({ step: { code: "answerCounter" } });
  });

  it("Hero: convite a responder, termos a aceitar e entrega a criar", () => {
    const base = { respondBy: "2026-11-07", consultedAt: "2026-11-01T00:00:00Z", brandName: "Marca X", deliverables: [] };
    const invite = heroSource({ ...base, id: "dt1", status: "consulted", deal: { id: "deal-1", title: "Verão", status: "open" } }, { terms: [], acceptances: [] }, false);
    const terms = heroSource(
      { ...base, id: "dt2", status: "proposed", deal: { id: "deal-2", title: "Inverno", status: "confirmed" } },
      { terms: [{ id: "t2", dealId: "deal-2", status: "sent", validUntil: null, version: 1 }], acceptances: [] },
      true,
    );
    const create = heroSource(
      { ...base, id: "dt3", status: "contracted", deal: { id: "deal-3", title: "Outono", status: "running" }, deliverables: [{ id: "x", kind: "reel", title: "", dueAt: "2026-11-03T12:00:00Z", publishAt: null, status: "planned" }] },
      { terms: [], acceptances: [] },
      true,
    );
    const q = buildTurnQueue("hero", [invite, terms, create], { today: TODAY, timeZone: TZ });
    expect(q.map((x) => x.step.code)).toEqual(["createDeliverable", "respondInvite", "acceptTerms"]);
    expect(q[0]).toMatchObject({ late: true, href: "/heroi/oportunidades/dt3#campaign-create" });
    expect(q[1].href).toBe("/heroi/oportunidades/dt1#opp-respond");
    // já aceitou: só espera
    const done = heroSource(
      { ...base, id: "dt2", status: "proposed", deal: { id: "deal-2", title: "Inverno", status: "confirmed" } },
      { terms: [{ id: "t2", dealId: "deal-2", status: "sent", validUntil: null, version: 1 }], acceptances: [{ termsId: "t2", party: "talent", dealTalentId: "dt2" }] },
      true,
    );
    expect(buildTurnQueue("hero", [done], { today: TODAY, timeZone: TZ })).toHaveLength(0);
  });
});

describe("ordem por urgência", () => {
  const item = (key: string, deadline: string | null, updatedAt: string | null = null): Pick<TurnItem, "day" | "step" | "updatedAt" | "title" | "key"> => ({
    key,
    title: key,
    updatedAt,
    day: deadlineDay(deadline, TZ),
    step: { mode: "action", code: "sendTerms", target: "terms", deadline, params: {} },
  });

  it("vencido primeiro, depois o prazo mais próximo; sem prazo por último (parado há mais tempo antes)", () => {
    const list = [
      item("sem-prazo-novo", null, "2026-11-04T00:00:00Z"),
      item("dia-10", "2026-11-10"),
      item("vencido", "2026-11-01"),
      item("sem-prazo-antigo", null, "2026-10-01T00:00:00Z"),
      item("dia-06-tarde", "2026-11-06T20:00:00Z"),
      item("dia-06-manha", "2026-11-06T12:00:00Z"),
    ];
    expect([...list].sort(compareTurn).map((x) => x.key)).toEqual(["vencido", "dia-06-manha", "dia-06-tarde", "dia-10", "sem-prazo-antigo", "sem-prazo-novo"]);
  });

  it("dia do prazo no fuso de quem lê (01:00 UTC ainda é o dia anterior em São Paulo)", () => {
    expect(deadlineDay("2026-11-06T01:00:00Z", TZ)).toBe("2026-11-05");
    expect(deadlineDay("2026-11-06", TZ)).toBe("2026-11-06");
    expect(deadlineDay(null, TZ)).toBeNull();
  });

  it("esperas e concluídas não entram; agência encerra como ganha em um clique", () => {
    const won = agencySource(deal({ stage: "delivery", contractConfirmedAt: "x" }), { terms: [], acceptances: [], deliverables: [deliv({ status: "done" })] }, manager, null);
    const waiting = agencySource(deal({ id: "deal-2", stage: "production", contractConfirmedAt: "x" }), { terms: [], acceptances: [], deliverables: [deliv({ dealId: "deal-2", status: "in_production" })] }, manager, null);
    const q = buildTurnQueue("agency", [won, waiting], { today: TODAY, timeZone: TZ });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ quick: "finishDeal", href: "/agencia/negocios/deal-1#deal-stage" });
  });
});
