import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignForm } from "@/components/brand-portal/CampaignForm";
import { DealOffer } from "@/components/deals/DealOffer";
import { RequestSummary } from "@/components/deals/RequestSummary";
import { campaignValuePayload, EMPTY_CAMPAIGN, type CampaignFormValues } from "@/lib/brand-portal/campaign-form";
import { EMPTY_BRIEF } from "@/lib/brief/brief";
import { draftFrom, MONEY_ONLY, type Compensation, type CompensationDraft } from "@/lib/compensation/model";
import { toOfferView, type OfferView } from "@/lib/deals/offer";
import type { RequestRow } from "@/lib/deals/queries";
import { centsToBrl } from "@/lib/money/brl-input";

// Forma de pagamento (0140) na campanha da marca e na negociação da proposta: o que vai ao banco (sem "Valor", sem
// dinheiro) e o que as telas mostram (sem "não informado" quando não há dinheiro; aceite de proposta só de permuta).

vi.mock("@/lib/deals/offer-actions", () => ({ agencyOfferReplyAction: async () => ({ ok: true }), brandOfferReplyAction: async () => ({ ok: true }) }));
vi.mock("@/app/marca/actions", () => ({ saveRequestAction: async () => ({ ok: true }), submitRequestAction: async () => ({ ok: true }) }));
vi.mock("@/lib/selection/actions", () => ({ askApprovalAction: async () => ({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

function messages(locale: string): Record<string, unknown> {
  const dir = path.join(process.cwd(), "messages", locale);
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(path.join(dir, f), "utf8"))]));
}
const PT = messages("pt-BR");
const render = (node: ReactNode) =>
  // arquivo .ts (sem JSX): o tipo do provider exige children nas props
  // eslint-disable-next-line react/no-children-prop
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "pt-BR", timeZone: "America/Sao_Paulo", messages: PT, children: node }));

const BARTER: Compensation = { money: false, barter: { offer: "Kit de produtos", valueCents: 300_000 }, performance: null };
const draft = (c: Compensation, patch: Partial<CompensationDraft> = {}): CompensationDraft => ({ ...draftFrom(c, centsToBrl), ...patch });
const values = (patch: Partial<Pick<CampaignFormValues, "budgetText" | "valueModel" | "maxHeroes">> = {}) => ({ budgetText: "", valueModel: "fixo" as const, maxHeroes: null, ...patch });

describe("bloco Pagamento da campanha → pedido", () => {
  it("só valor: o valor de sempre e a forma de pagamento junto", () => {
    expect(campaignValuePayload(values({ budgetText: "15.000,00" }), draft(MONEY_ONLY), "editable")).toEqual({
      ok: true,
      value: { budgetMaxCents: 1_500_000, valueModel: "fixo", maxHeroes: null, compensation: { money: true, barter: null, performance: null } },
    });
  });
  it("sem 'Valor': sem dinheiro, modelo fixo e sem máximo — os campos de valor escondidos não contam", () => {
    const r = campaignValuePayload(values({ budgetText: "abc", valueModel: "por_heroi", maxHeroes: null }), draft(BARTER), "editable");
    expect(r).toEqual({
      ok: true,
      value: { budgetMaxCents: null, valueModel: "fixo", maxHeroes: null, compensation: { money: false, barter: { offer: "Kit de produtos", value_cents: 300_000 }, performance: null } },
    });
  });
  it("valor + performance: os dois vão juntos", () => {
    const d = draft(MONEY_ONLY, { performance: true, perfKind: "percent", perfRateText: "10", perfMeasure: "cupom HERO10" });
    const r = campaignValuePayload(values({ budgetText: "5.000" }), d, "editable");
    expect(r.ok && r.value).toEqual({
      budgetMaxCents: 500_000,
      valueModel: "fixo",
      maxHeroes: null,
      compensation: { money: true, barter: null, performance: { kind: "percent", rate: 10, measure: "cupom HERO10", estimate_cents: null } },
    });
  });
  it("erros: forma de pagamento incompleta, valor inválido e por Hero sem máximo", () => {
    expect(campaignValuePayload(values(), draft(MONEY_ONLY, { money: false }), "editable")).toEqual({ ok: false, error: { kind: "compensation", code: "none_selected" } });
    expect(campaignValuePayload(values(), draft(BARTER, { barterOffer: "  " }), "editable")).toEqual({ ok: false, error: { kind: "compensation", code: "barter_offer" } });
    expect(campaignValuePayload(values({ budgetText: "1,234" }), draft(MONEY_ONLY), "editable")).toEqual({ ok: false, error: { kind: "budget" } });
    expect(campaignValuePayload(values({ budgetText: "2.000", valueModel: "por_heroi" }), draft(MONEY_ONLY), "editable")).toEqual({ ok: false, error: { kind: "value", code: "max_heroes_required" } });
  });
  it("campanha de um acordo (chamada congelada, patrocínio): a forma de pagamento não vai — o banco mantém a do acordo", () => {
    for (const mode of ["frozen", "hidden"] as const) {
      const r = campaignValuePayload(values({ budgetText: "8.000,00", valueModel: "fixo" }), draft(BARTER, { barterOffer: "" }), mode);
      expect(r).toEqual({ ok: true, value: { budgetMaxCents: 800_000, valueModel: "fixo", maxHeroes: null } });
    }
  });
  it("campanha nova começa em 'só valor'", () => {
    expect(EMPTY_CAMPAIGN.compensation).toEqual(MONEY_ONLY);
  });
});

const request: RequestRow = {
  id: "r1",
  title: "Lançamento",
  objective: null,
  product: "",
  targetAudience: "",
  targetAgeBands: [],
  targetStates: [],
  regionNote: "",
  periodStart: null,
  periodEnd: null,
  desiredAt: null,
  durationMinutes: null,
  format: null,
  location: "",
  networks: [],
  deliverables: [],
  notes: "",
  brief: { ...EMPTY_BRIEF },
  status: "submitted",
  origin: "brand",
  talentId: null,
  submittedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("resumo da proposta da marca", () => {
  it("sem dinheiro: mostra a permuta (com a observação), nunca 'não informado'", () => {
    const html = render(createElement(RequestSummary, { request, budget: { min: null, max: null, note: "Frete por conta da marca", valueModel: "fixo", maxHeroes: null, compensation: BARTER } }));
    expect(html).toContain("Forma de pagamento");
    expect(html).toContain("Kit de produtos");
    expect(html).toContain("sem dinheiro");
    expect(html).toContain("Frete por conta da marca");
    expect(html).not.toContain("não informado");
  });
  it("só valor, sem valor: 'não informado' como antes (sem a observação)", () => {
    const html = render(createElement(RequestSummary, { request, budget: { min: null, max: null, note: "Depende do Hero", valueModel: "fixo", maxHeroes: null, compensation: MONEY_ONLY } }));
    expect(html).toContain("Valor oferecido pela marca");
    expect(html).toContain("não informado");
    expect(html).not.toContain("Depende do Hero");
    expect(html).not.toContain("compensation-view");
  });
  it("valor + permuta: o valor e a permuta", () => {
    const html = render(createElement(RequestSummary, { request, budget: { min: null, max: 1_000_000, note: "", valueModel: "fixo", maxHeroes: null, compensation: { ...BARTER, money: true } } }));
    expect(html).toMatch(/R\$\s10\.000,00/);
    expect(html).toContain("Kit de produtos");
    expect(html).not.toContain("sem dinheiro");
  });
});

const offerJson = (compensation: unknown, patch: Record<string, unknown> = {}) => ({
  enabled: true,
  viewer: "agency",
  values: true,
  open: true,
  can_reply: true,
  role: null,
  turn: "agency",
  agreed: false,
  brand_terms: { source: "request", amount_cents: null, value_model: "fixo", compensation },
  agreed_terms: null,
  rounds: [],
  ...patch,
});
const renderOffer = (raw: unknown, portal: "agency" | "brand" = "agency") => render(createElement(DealOffer, { portal, dealId: "d1", requestId: "r1", view: toOfferView(raw) as OfferView }));
const acceptButton = (html: string) => html.match(/<button[^>]*data-testid="deal-offer-accept"[^>]*>/)?.[0] ?? "";
const BARTER_DB = { money: false, barter: { offer: "Kit de produtos", value_cents: 300_000 }, performance: null };

describe("proposta da marca no negócio", () => {
  it("proposta só de permuta: a agência pode aceitar, e a tela não fala em 'não informou valor'", () => {
    const html = renderOffer(offerJson(BARTER_DB));
    expect(acceptButton(html)).not.toMatch(/\sdisabled=""/);
    expect(html).not.toContain("Sem valor da marca para aceitar");
    expect(html).not.toContain("A marca não informou valor.");
    expect(html).toContain("Kit de produtos");
    expect(html).toContain("sem dinheiro");
  });
  it("proposta com 'Valor' e sem valor: aceitar fica bloqueado e a dica pede contraproposta", () => {
    const html = renderOffer(offerJson({ money: true, barter: null, performance: null }));
    expect(acceptButton(html)).toMatch(/\sdisabled=""/);
    expect(html).toContain("Sem valor da marca para aceitar");
    expect(html).toContain("A marca não informou valor.");
  });
  it("histórico: rodada sem dinheiro mostra a permuta", () => {
    const html = renderOffer(
      offerJson(BARTER_DB, { turn: "brand", can_reply: false, rounds: [{ id: "a", seq: 1, side: "agency", action: "counter", amount_cents: null, value_model: "fixo", compensation: BARTER_DB, actor_label: "Ana", created_at: "2026-11-08T12:00:00Z" }] }),
    );
    expect(html).toContain("deal-offer-history");
    expect(html.split("Kit de produtos").length - 1).toBeGreaterThanOrEqual(2);
  });
  it("gestor (sem valores): a forma de pagamento sem números", () => {
    const html = renderOffer(offerJson({ money: false, barter: { offer: "Kit de produtos", value_cents: null }, performance: null }, { values: false, can_reply: false }));
    // o que aparece na tela (as janelas fechadas vêm depois, no mesmo HTML)
    const visible = html.split("<dialog")[0];
    expect(visible).toContain("Kit de produtos");
    expect(visible).not.toContain("deal-offer-terms");
    expect(visible).not.toMatch(/R\$/);
  });
});

describe("formulário da campanha", () => {
  const initial = (compensation: Compensation): CampaignFormValues => ({ ...EMPTY_CAMPAIGN, id: "11111111-1111-4111-8111-111111111111", title: "Lançamento", compensation });
  it("campanha livre: os botões Valor/Permuta/Performance e, com Valor, o campo de valor", () => {
    const html = render(createElement(CampaignForm, { initial: initial(MONEY_ONLY), creatorName: null, canEdit: true }));
    expect(html).toContain('data-testid="campaign-compensation"');
    expect(html).toContain('data-testid="campaign-budget"');
    expect(html).not.toContain("campaign-compensation-agreed");
  });
  it("campanha livre sem dinheiro: sem campo de valor, com os campos da permuta", () => {
    const html = render(createElement(CampaignForm, { initial: initial(BARTER), creatorName: null, canEdit: true }));
    expect(html).not.toContain('data-testid="campaign-budget"');
    expect(html).toContain('data-testid="campaign-comp-barter-offer"');
  });
  it("chamada acordada sem dinheiro: a forma de pagamento do acordo, só leitura, sem campo de valor", () => {
    const html = render(createElement(CampaignForm, { initial: initial(BARTER), creatorName: null, canEdit: true, valueMode: "frozen", sponsorshipBudget: "agreed" }));
    expect(html).toContain("campaign-compensation-agreed");
    expect(html).toContain("Kit de produtos");
    expect(html).not.toContain('data-testid="campaign-budget"');
    expect(html).not.toContain('data-testid="campaign-compensation"');
  });
  it("patrocínio em negociação: o valor de sempre, sem escolher a forma de pagamento", () => {
    const html = render(createElement(CampaignForm, { initial: initial(MONEY_ONLY), creatorName: null, canEdit: true, valueMode: "hidden", sponsorshipBudget: "negotiating" }));
    expect(html).toContain('data-testid="campaign-budget"');
    expect(html).not.toContain("campaign-compensation-agreed");
    expect(html).not.toContain('data-testid="campaign-compensation"');
  });
});
