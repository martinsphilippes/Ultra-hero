import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgencyProposalsPanel } from "@/components/sponsorship/AgencyProposalsPanel";
import { BrandNegotiationPanel } from "@/components/sponsorship/BrandNegotiationPanel";
import { SponsorshipForm, type SponsorshipFormValues } from "@/components/sponsorship/SponsorshipForm";
import { TermsComposer } from "@/components/sponsorship/TermsComposer";
import { MONEY_ONLY, draftFrom, type Compensation } from "@/lib/compensation/model";
import { centsToBrl } from "@/lib/money/brl-input";
import { EMPTY_PUBLIC, newTierDraft } from "@/lib/sponsorship/negotiation";
import { toAgencySponsorshipDetail, toBrandNegotiation } from "@/lib/sponsorship/vocab";

// Forma de pagamento (0140) nas telas do patrocínio: cota sem dinheiro mostra a permuta/performance no lugar de
// "a combinar", tem "Aceitar como está"; proposta sem dinheiro sem valor; gestor vê a forma sem números.

vi.mock("@/lib/sponsorship/actions", () => ({
  saveSponsorshipAction: async () => ({ ok: true, message: "" }),
  searchOpportunityHeroesAction: async () => ({ ok: true, items: [], hasMore: false }),
  proposeSponsorshipAction: async () => ({ ok: true, message: "" }),
  brandReplySponsorshipAction: async () => ({ ok: true, message: "" }),
  reviewSponsorshipRoundAction: async () => ({ ok: true, message: "" }),
  agencyReplySponsorshipAction: async () => ({ ok: true, message: "" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined, back: () => undefined }) }));

function messages(locale: string): Record<string, unknown> {
  const dir = path.join(process.cwd(), "messages", locale);
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(path.join(dir, f), "utf8"))]));
}
const PT = messages("pt-BR");
const render = (node: ReactNode) =>
  // arquivo .ts (sem JSX): o tipo do provider exige children nas props
  // eslint-disable-next-line react/no-children-prop
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "pt-BR", timeZone: "America/Sao_Paulo", messages: PT, children: node }));
const count = (html: string, text: string) => html.split(text).length - 1;

const O1 = "00000000-0000-4000-8000-000000000001";
const T1 = "00000000-0000-4000-8000-000000000011";
const T2 = "00000000-0000-4000-8000-000000000012";
const P1 = "00000000-0000-4000-8000-000000000021";
const TZ = "America/Sao_Paulo";
const BARTER_DB = { money: false, barter: { offer: "50 caixas de bebida", value_cents: 250000 }, performance: null };
const BARTER: Compensation = { money: false, barter: { offer: "50 caixas de bebida", valueCents: 250_000 }, performance: null };

describe("marca: cotas e negociação sem dinheiro", () => {
  it("cota sem dinheiro: permuta no lugar de 'a combinar' e 'Aceitar como está'", () => {
    const negotiation = toBrandNegotiation({
      role: "owner",
      can_propose: true,
      tiers: [
        { id: T1, name: "Bebidas", price_cents: null, ask_cents: null, perks: ["Logo na camiseta"], slots: 2, full: false, compensation: BARTER_DB },
        { id: T2, name: "Master", price_cents: null, ask_cents: null, perks: ["Logo"], slots: 1, full: false },
      ],
      proposals: [],
    })!;
    const html = render(createElement(BrandNegotiationPanel, { opportunityId: O1, timeZone: TZ, negotiation, hasRole: true, eventPublic: null }));
    expect(html).toContain("50 caixas de bebida");
    expect(html).toMatch(/estimada em R\$\s2\.500,00/);
    expect(html).toContain("Aceitar como está");
    // só a cota com dinheiro e sem valor segue "a combinar"
    expect(count(html, "Valor a combinar")).toBe(1);
  });

  it("acordo sem dinheiro: sem valor, 'aceitou como está' e o aviso sem valor", () => {
    const negotiation = toBrandNegotiation({
      role: "owner",
      can_propose: false,
      tiers: [{ id: T1, name: "Bebidas", price_cents: null, ask_cents: null, perks: ["Logo na camiseta"], slots: 2, full: false, compensation: BARTER_DB }],
      proposals: [
        {
          id: P1, tier_id: T1, tier_name: "Bebidas", status: "agreed", awaiting: null, asked_cents: null, amount_cents: null, agreed_cents: null,
          perks: ["Logo na camiseta"], agreed_perks: ["Logo na camiseta"], compensation: BARTER_DB, agreed_compensation: BARTER_DB, agreed_at: "2026-11-08T10:00:00Z",
          history: [{ id: "r1", seq: 1, side: "brand", action: "accept_asked", amount_cents: null, perks: ["Logo na camiseta"], state: "sent", compensation: BARTER_DB, created_at: "2026-11-08T10:00:00Z" }],
        },
      ],
    })!;
    const html = render(createElement(BrandNegotiationPanel, { opportunityId: O1, timeZone: TZ, negotiation, hasRole: true, eventPublic: null }));
    expect(html).toContain("Aceitou a cota como está");
    expect(html).toContain("Forma de pagamento e contrapartidas ficaram congeladas");
    expect(html).not.toMatch(/R\$\s0,00/);
  });

  it("proposta: o valor só aparece com 'Valor' marcado", () => {
    const base = { basePerks: ["Logo"], askedCents: null, initialCents: null, withAudience: false, submitLabel: "Enviar", pending: false, onSubmit: () => undefined, onCancel: () => undefined };
    expect(render(createElement(TermsComposer, { ...base, initialCompensation: BARTER }))).not.toContain('data-testid="composer-amount"');
    const cash = render(createElement(TermsComposer, { ...base, initialCompensation: MONEY_ONLY }));
    expect(cash).toContain('data-testid="composer-amount"');
    expect(cash).toContain('data-testid="composer-compensation"');
  });
});

describe("agência: propostas e cotas", () => {
  const stripped = { money: false, barter: { offer: "50 caixas de bebida", value_cents: null }, performance: { kind: "percent", rate: null, measure: "cupom HERO10", estimate_cents: null } };
  const detail = (canValues: boolean, comp: unknown) =>
    toAgencySponsorshipDetail({
      can_values: canValues,
      opportunity: { id: O1, agency_id: "a", status: "open" },
      tiers: [{ id: T1, name: "Bebidas", price_cents: null, has_price: false, perks: ["Logo"], slots: 2, compensation: comp }],
      proposals: [
        { id: P1, tier_id: T1, tier_name: "Bebidas", brand_name: "Beta", status: "open", awaiting: "agency", amount_cents: null, asked_cents: null, perks: ["Logo"], compensation: comp, history: [], sent_at: "2026-11-08T10:00:00Z" },
      ],
      brands: [],
    })!;

  it("gestor: a forma sem números (nem R$, nem %)", () => {
    const d = detail(false, stripped);
    const html = render(createElement(AgencyProposalsPanel, { proposals: d.proposals, tiers: d.tiers, canValues: false, timeZone: TZ }));
    expect(html).toContain("50 caixas de bebida");
    expect(html).toContain("% das vendas");
    expect(html).toContain("cupom HERO10");
    expect(html).not.toMatch(/R\$/);
  });

  it("Adm: proposta sem dinheiro com as ações e sem 'R$ 0,00'", () => {
    const d = detail(true, BARTER_DB);
    const html = render(createElement(AgencyProposalsPanel, { proposals: d.proposals, tiers: d.tiers, canValues: true, timeZone: TZ }));
    expect(html).toContain('data-testid="agency-reply-actions"');
    expect(html).toMatch(/estimada em R\$\s2\.500,00/);
    expect(html).not.toMatch(/R\$\s0,00/);
  });
});

describe("formulário da agência: forma de pagamento da cota", () => {
  const initial = (tiers: SponsorshipFormValues["tiers"]): SponsorshipFormValues => ({
    id: O1, hero: null, title: "Maratona", description: "", location: "", date: "2026-11-20", endDate: "", startTime: "08:00", endTime: "13:00", allDay: false,
    expectedReach: "", tiers, public: EMPTY_PUBLIC, networks: ["instagram"], respondDate: "2026-11-15", respondTime: "18:00", audience: "all", brandIds: [],
  });
  const barterTier = { ...newTierDraft("Bebidas"), id: T1, compensation: draftFrom(BARTER, centsToBrl) };

  it("Adm: a forma na cota; sem 'Valor', sem campo de valor pedido", () => {
    const html = render(createElement(SponsorshipForm, { initial: initial([barterTier]), brands: [], status: "open", canValues: true }));
    expect(html).toContain('data-testid="sponsorship-tier-0-compensation"');
    expect(html).not.toContain('data-testid="sponsorship-tier-price"');
    expect(html).toContain("cada uma com a sua permuta ou performance");
    const cash = render(createElement(SponsorshipForm, { initial: initial([newTierDraft("Master")]), brands: [], status: "new", canValues: true }));
    expect(cash).toContain('data-testid="sponsorship-tier-price"');
  });

  it("gestor: vê a forma gravada sem números; sem dinheiro, nada de 'o Adm define o valor'", () => {
    const html = render(createElement(SponsorshipForm, { initial: initial([barterTier]), brands: [], status: "open", canValues: false }));
    expect(html).not.toContain('data-testid="sponsorship-tier-0-compensation"');
    expect(html).toContain("50 caixas de bebida");
    expect(html).not.toContain("O Adm define o valor");
    expect(html).not.toMatch(/R\$\s2\.500/);
    const cash = render(createElement(SponsorshipForm, { initial: initial([newTierDraft("Master")]), brands: [], status: "new", canValues: false }));
    expect(cash).toContain("O Adm define o valor");
  });
});
