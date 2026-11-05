import { describe, expect, it } from "vitest";
import {
  closeWonPending,
  flowDeliverables,
  flowStep,
  flowTerms,
  hasCloseWonPending,
  nextStep,
  nextStepHref,
  stageFromBrandStatus,
  stageFromOpportunity,
  type FlowDeliverable,
  type FlowHero,
  type FlowInput,
  type FlowViewer,
} from "@/lib/deals/next-step";

// "Próximo passo" (04/11): a mesma regra para agência, marca e Hero, do pedido da marca até a campanha concluída.
const hero = (over: Partial<FlowHero> = {}): FlowHero => ({ dealTalentId: "dt1", name: "Ana", status: "proposed", respondBy: null, termsAccepted: null, feeReady: true, ...over });
const deliv = (over: Partial<FlowDeliverable> = {}): FlowDeliverable => ({
  id: "d1", dealTalentId: "dt1", heroName: "Ana", title: "Post mm", kind: "post", status: "in_production", dueAt: "2026-11-04T15:00:00Z", publishAt: null, ...over,
});
const input = (over: Partial<FlowInput> = {}): FlowInput => ({
  stage: "negotiation", outcome: null, offer: null, planMissing: null, terms: { status: "none", brandAccepted: null, validUntil: null },
  heroes: [], contractConfirmed: false, deliverables: [], ...over,
});
const adm: FlowViewer = { party: "agency", canEdit: true, isManager: true, isAdmin: true, canReplyOffer: true, canEditPlan: true };
const staff: FlowViewer = { party: "agency", canEdit: true, isManager: false, isAdmin: false, canReplyOffer: false, canEditPlan: false };
const owner: FlowViewer = { party: "brand", isOwner: true, canAct: true };
const brandStaff: FlowViewer = { party: "brand", isOwner: false, canAct: true };
const me = (status = "proposed", canCreate = true): FlowViewer => ({ party: "hero", dealTalentId: "dt1", status, canCreate });

describe("proposta (0106) e elenco", () => {
  it("proposta da marca: vez da agência (Adm responde; colaborador aguarda; marca aguarda)", () => {
    const x = input({ offer: { open: true, turn: "agency", agreed: false } });
    expect(nextStep(x, adm)).toMatchObject({ mode: "action", code: "answerOffer", target: "offer" });
    expect(nextStep(x, staff)).toMatchObject({ mode: "waiting", code: "waitAdminOffer" });
    expect(nextStep(x, owner)).toMatchObject({ mode: "waiting", code: "waitAgencyOffer" });
    expect(flowStep(x)).toBe("proposal");
  });
  it("contraproposta da agência: vez do dono da marca; a agência não confirma enquanto isso", () => {
    const x = input({ offer: { open: true, turn: "brand", agreed: false }, heroes: [hero({ status: "interested" })] });
    expect(nextStep(x, owner)).toMatchObject({ mode: "action", code: "answerCounter" });
    expect(nextStep(x, brandStaff)).toMatchObject({ mode: "waiting", code: "waitOwnerCounter" });
    expect(nextStep(x, adm)).toMatchObject({ mode: "waiting", code: "waitBrandOffer" });
  });
  it("acordo fechado: sem elenco → montar; consultado → aguardar Heros; interessado → confirmar (Adm)", () => {
    const agreed = { open: false, turn: null, agreed: true } as const;
    expect(nextStep(input({ offer: agreed }), adm)).toMatchObject({ code: "buildCast", target: "talents" });
    const consulted = input({ heroes: [hero({ status: "consulted", respondBy: "2026-11-06T12:00:00Z" }), hero({ dealTalentId: "dt2", name: "Bia", status: "consulted", respondBy: "2026-11-05T12:00:00Z" })] });
    expect(nextStep(consulted, adm)).toMatchObject({ mode: "waiting", code: "waitHeroesAnswer", deadline: "2026-11-05T12:00:00Z", params: { count: 2 } });
    const ready = input({ heroes: [hero({ status: "interested" })] });
    expect(nextStep(ready, adm)).toMatchObject({ code: "confirmDeal", target: "confirm" });
    expect(nextStep(ready, staff)).toMatchObject({ mode: "waiting", code: "waitAdminConfirm" });
    expect(nextStep(input({ heroes: [hero({ status: "interested", feeReady: false })] }), adm)).toMatchObject({ code: "setFees", params: { names: ["Ana"] } });
    expect(nextStep(input({ heroes: [hero({ status: "talk_requested" })] }), adm)).toMatchObject({ code: "talkToHero", params: { hero: "Ana" } });
  });
  it("Hero: convite → responder; interessado → aguarda a agência; recusou → fora", () => {
    const x = input({ heroes: [hero({ status: "consulted", respondBy: "2026-11-06T12:00:00Z" })] });
    expect(nextStep(x, me("consulted"))).toMatchObject({ mode: "action", code: "respondInvite", target: "respond", deadline: "2026-11-06T12:00:00Z" });
    expect(nextStep(x, me("interested"))).toMatchObject({ mode: "waiting", code: "waitProposalHero" });
    expect(nextStep(x, me("talk_requested"))).toMatchObject({ mode: "waiting", code: "waitHeroTalk" });
    expect(nextStep(x, me("declined"))).toMatchObject({ mode: "done", code: "declined" });
  });
});

describe("termos e contratação", () => {
  const base = { stage: "approved" as const, heroes: [hero({ termsAccepted: false })] };
  it("sem condições de pagamento (0108): o Adm define antes de enviar os termos", () => {
    const x = input({ ...base, planMissing: true, terms: { status: "draft", brandAccepted: null, validUntil: null } });
    expect(nextStep(x, adm)).toMatchObject({ code: "setPlan", target: "plan" });
    expect(nextStep(x, staff)).toMatchObject({ code: "waitAdminPlan" });
    expect(nextStep(x, owner)).toMatchObject({ code: "waitTerms" });
    expect(nextStep(x, me())).toMatchObject({ code: "waitTerms" });
    expect(flowStep(x)).toBe("terms");
  });
  it("com condições: gestor envia; quem não é gestor aguarda", () => {
    const x = input({ ...base, planMissing: false, terms: { status: "draft", brandAccepted: null, validUntil: null } });
    expect(nextStep(x, adm)).toMatchObject({ code: "sendTerms", target: "terms" });
    expect(nextStep(x, staff)).toMatchObject({ code: "waitManagerTerms" });
  });
  it("termos enviados: marca (dono) e Hero aceitam em paralelo; a agência vê quem falta", () => {
    const x = input({ ...base, terms: { status: "sent", brandAccepted: false, validUntil: "2026-11-10" } });
    expect(nextStep(x, owner)).toMatchObject({ mode: "action", code: "acceptTerms", target: "terms", deadline: "2026-11-10" });
    expect(nextStep(x, brandStaff)).toMatchObject({ mode: "waiting", code: "waitOwnerTerms" });
    expect(nextStep(x, me())).toMatchObject({ mode: "action", code: "acceptTerms" });
    expect(nextStep(x, adm)).toMatchObject({ mode: "waiting", code: "waitAcceptances", params: { brand: true, names: ["Ana"], count: 2 } });
    const brandDone = input({ ...base, terms: { status: "sent", brandAccepted: true, validUntil: null } });
    expect(nextStep(brandDone, owner)).toMatchObject({ code: "waitHeroTerms", params: { names: ["Ana"] } });
    const heroDone = input({ ...base, heroes: [hero({ termsAccepted: true })], terms: { status: "sent", brandAccepted: false, validUntil: null } });
    expect(nextStep(heroDone, me())).toMatchObject({ code: "waitBrandTerms" });
  });
  it("todos aceitaram: gestor confirma a contratação; marca e Hero aguardam", () => {
    const x = input({ ...base, heroes: [hero({ termsAccepted: true })], terms: { status: "sent", brandAccepted: true, validUntil: null } });
    expect(nextStep(x, adm)).toMatchObject({ code: "confirmContract", target: "terms" });
    expect(nextStep(x, staff)).toMatchObject({ code: "waitManagerContract" });
    expect(nextStep(x, owner)).toMatchObject({ code: "waitContract" });
    expect(nextStep(x, me())).toMatchObject({ code: "waitContract" });
    expect(flowStep(x)).toBe("contracting");
    // versão aceita por todos (status 'accepted'): a barra também fica em "Contratação"
    expect(flowStep(input({ ...base, heroes: [hero({ termsAccepted: true })], terms: { status: "accepted", brandAccepted: true, validUntil: null } }))).toBe("contracting");
  });
});

describe("produção, aprovação, publicação", () => {
  const prod = (deliverables: FlowDeliverable[]) => input({ stage: "production", contractConfirmed: true, heroes: [hero({ status: "contracted", termsAccepted: true })], terms: { status: "accepted", brandAccepted: true, validUntil: null }, deliverables });
  it("em criação: Hero cria (atalho 'Criar para esta campanha'); marca e agência aguardam o Hero até o prazo", () => {
    const x = prod([deliv()]);
    expect(nextStep(x, me())).toMatchObject({ mode: "action", code: "createDeliverable", target: "create", deadline: "2026-11-04T15:00:00Z", params: { item: "Post mm" } });
    expect(nextStep(x, me("contracted", false))).toMatchObject({ target: "deliverables" });
    expect(nextStep(x, owner)).toMatchObject({ mode: "waiting", code: "waitHeroDeliverable", deadline: "2026-11-04T15:00:00Z", params: { hero: "Ana", item: "Post mm" } });
    expect(nextStep(x, adm)).toMatchObject({ mode: "waiting", code: "waitHeroDeliverable" });
    expect(flowStep(x)).toBe("production");
  });
  it("enviado: marca aprova; Hero aguarda a marca", () => {
    const x = prod([deliv({ status: "submitted", publishAt: "2026-11-08T12:00:00Z" })]);
    expect(nextStep(x, owner)).toMatchObject({ code: "approveDeliverable", target: "deliverables", deadline: "2026-11-08T12:00:00Z" });
    expect(nextStep(x, brandStaff)).toMatchObject({ code: "approveDeliverable" });
    expect(nextStep(x, me())).toMatchObject({ mode: "waiting", code: "waitBrandApproval" });
    expect(flowStep(x)).toBe("approval");
  });
  it("ajuste, aprovado, publicado, comprovado: Hero ajusta/publica/comprova; agência conclui", () => {
    expect(nextStep(prod([deliv({ status: "changes_requested" })]), me())).toMatchObject({ code: "fixDeliverable" });
    expect(nextStep(prod([deliv({ status: "approved", publishAt: "2026-11-08T12:00:00Z" })]), me())).toMatchObject({ code: "publishDeliverable", deadline: "2026-11-08T12:00:00Z" });
    expect(nextStep(prod([deliv({ status: "published" })]), me())).toMatchObject({ code: "proofDeliverable", deadline: null });
    expect(nextStep(prod([deliv({ status: "published" })]), owner)).toMatchObject({ code: "waitHeroProof" });
    const proof = prod([deliv({ status: "proof_submitted" })]);
    expect(nextStep(proof, adm)).toMatchObject({ code: "closeDeliverable", target: "deliverables" });
    expect(nextStep(proof, me())).toMatchObject({ code: "waitAgencyClose" });
    expect(flowStep(proof)).toBe("publication");
  });
  it("prazo mais próximo primeiro; Hero vê só as dele", () => {
    const x = prod([deliv({ id: "a", title: "Longe", dueAt: "2026-11-20T12:00:00Z" }), deliv({ id: "b", title: "Perto", dueAt: "2026-11-05T12:00:00Z" }), deliv({ id: "c", dealTalentId: "dt2", heroName: "Bia", title: "Outra", dueAt: "2026-11-01T12:00:00Z" })]);
    expect(nextStep(x, me())).toMatchObject({ params: { item: "Perto" } });
    expect(nextStep(x, owner)).toMatchObject({ params: { item: "Outra", hero: "Bia" } });
  });
  it("tudo concluído: gestor encerra como ganha; os outros aguardam; sem entregas: agência cadastra", () => {
    const x = prod([deliv({ status: "done" }), deliv({ id: "x", status: "cancelled" })]);
    expect(nextStep(x, adm)).toMatchObject({ code: "finishDeal", target: "stage" });
    expect(nextStep(x, staff)).toMatchObject({ code: "waitManagerFinish" });
    expect(nextStep(x, owner)).toMatchObject({ code: "waitAgencyFinish" });
    expect(nextStep(x, me())).toMatchObject({ code: "waitAgencyFinish" });
    expect(flowStep(x)).toBe("done");
    expect(nextStep(prod([]), adm)).toMatchObject({ code: "planDeliverables" });
    expect(nextStep(prod([]), me())).toMatchObject({ code: "waitDeliverablesPlan" });
  });
  it("encerrada: ganha (marca vai ao relatório) ou encerrada", () => {
    expect(nextStep(input({ stage: "closed", outcome: "won" }), owner)).toMatchObject({ mode: "done", code: "won", target: "report" });
    expect(nextStep(input({ stage: "closed", outcome: "won" }), adm)).toMatchObject({ mode: "done", code: "won", target: null });
    expect(nextStep(input({ stage: "closed", outcome: "lost" }), me())).toMatchObject({ mode: "done", code: "closed" });
  });
});

describe("guarda do encerrar como ganho", () => {
  it("o caso do Post mm: aprovado, termos em rascunho, contrato não confirmado e entrega planejada", () => {
    const x = input({ stage: "approved", terms: { status: "draft", brandAccepted: null, validUntil: null }, deliverables: [deliv({ status: "planned" }), deliv({ id: "z", status: "cancelled" })] });
    const p = closeWonPending(x);
    expect(p).toMatchObject({ termsPending: true, contractPending: true });
    expect(p.deliverables.map((d) => d.id)).toEqual(["d1"]);
    expect(hasCloseWonPending(p)).toBe(true);
  });
  it("contratado e tudo concluído: sem pendência", () => {
    const x = input({ stage: "production", contractConfirmed: true, terms: { status: "accepted", brandAccepted: true, validUntil: null }, deliverables: [deliv({ status: "done" })] });
    expect(hasCloseWonPending(closeWonPending(x))).toBe(false);
  });
});

describe("links e adaptadores", () => {
  it("cada portal abre a aba/âncora certa", () => {
    expect(nextStepHref("agency", "terms", { dealId: "D" })).toBe("/agencia/negocios/D/termos");
    expect(nextStepHref("agency", "offer", { dealId: "D" })).toBe("/agencia/negocios/D#deal-offer");
    expect(nextStepHref("agency", "plan", { dealId: "D" })).toBe("/agencia/negocios/D#payment-plan");
    expect(nextStepHref("brand", "terms", { dealId: "D", requestId: "R" })).toBe("/marca/campanhas/R#camp-terms");
    expect(nextStepHref("brand", "report", { dealId: "D", requestId: "R" })).toBe("/marca/campanhas/R/relatorio");
    expect(nextStepHref("hero", "create", { dealId: "D", dealTalentId: "T" })).toBe("/heroi/oportunidades/T#campaign-create");
    expect(nextStepHref("hero", "respond", { dealId: "D", dealTalentId: "T" })).toBe("/heroi/oportunidades/T#opp-respond");
    expect(nextStepHref("hero", null, { dealId: "D" })).toBeNull();
    expect(nextStepHref("brand", "terms", { dealId: "D" })).toBeNull();
  });
  it("termos: versão viva e aceites (rascunho não conta)", () => {
    const draft = flowTerms([{ status: "draft", validUntil: null, acceptances: [] }]);
    expect(draft.status).toBe("draft");
    expect(draft.acceptedBy("dt1")).toBeNull();
    const sent = flowTerms([{ status: "sent", validUntil: "2026-11-10", acceptances: [{ party: "talent", dealTalentId: "dt1" }] }]);
    expect(sent).toMatchObject({ status: "sent", brandAccepted: false, validUntil: "2026-11-10" });
    expect(sent.acceptedBy("dt1")).toBe(true);
    expect(sent.acceptedBy("dt2")).toBe(false);
  });
  it("etapa aproximada de quem não lê a etapa", () => {
    expect(stageFromBrandStatus("done")).toEqual({ stage: "closed", outcome: "won" });
    expect(stageFromBrandStatus("received").stage).toBe("negotiation");
    expect(stageFromOpportunity("confirmed").stage).toBe("approved");
    expect(stageFromOpportunity("lost")).toEqual({ stage: "closed", outcome: "lost" });
    expect(flowDeliverables([{ id: "d", dealTalentId: "t", talentName: "Ana", title: "", kind: "post", status: "planned", dueAt: null, publishAt: null }])[0]).toMatchObject({ heroName: "Ana" });
  });
});
