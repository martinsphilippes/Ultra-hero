import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AbstractIntlMessages } from "next-intl";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { buildWorkEmail, formatLocalStamp, isWorkEmailKind, WORK_EMAIL_KINDS } from "@/lib/email/work-message";
import { INBOX_KINDS, inboxKindEmails } from "@/lib/inbox/kinds";
import { cleanSignerName, clientIpFrom, formatTaxId, normalizeTaxId, taxIdKind } from "@/lib/signature/tax-id";
import { metricEntries, onTimeRate, portfolioTotals, toKitMetrics, toKitStats, toPortfolio } from "@/lib/talent/kit-auto";
import { buildKit, FORBIDDEN_KIT_KEYS, type KitSource } from "@/lib/talent/media-kit";
import { talentErrorCode } from "@/lib/talent/error-codes";
import { DEFAULT_KIT_FIELDS, KIT_FIELDS } from "@/lib/talent/vocab";

const messages = (locale: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "email.json"), "utf8")) as AbstractIntlMessages;
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k] ?? null });

describe("CPF e CNPJ (mesmo cálculo de public.br_tax_id_kind)", () => {
  it("valida pelos dígitos verificadores, com ou sem pontuação", () => {
    expect(taxIdKind("529.982.247-25")).toBe("cpf");
    expect(taxIdKind("52998224725")).toBe("cpf");
    expect(taxIdKind("11.222.333/0001-81")).toBe("cnpj");
    expect(taxIdKind("11222333000181")).toBe("cnpj");
  });
  it("aceita o CNPJ alfanumérico (IN RFB 2.229/2024)", () => {
    expect(taxIdKind("12.ABC.345/01DE-35")).toBe("cnpj");
    expect(taxIdKind("12abc34501de35")).toBe("cnpj");
    expect(taxIdKind("12ABC34501DE36")).toBeNull();
  });
  it("recusa dígito errado, sequência repetida e tamanho errado", () => {
    expect(taxIdKind("529.982.247-24")).toBeNull();
    expect(taxIdKind("111.111.111-11")).toBeNull();
    expect(taxIdKind("00000000000000")).toBeNull();
    expect(taxIdKind("123")).toBeNull();
    expect(taxIdKind("")).toBeNull();
  });
  it("normaliza e formata", () => {
    expect(normalizeTaxId(" 529.982.247-25 ")).toBe("52998224725");
    expect(formatTaxId("52998224725")).toBe("529.982.247-25");
    expect(formatTaxId("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("assinatura: nome e IP", () => {
  it("nome completo exige nome e sobrenome e limpa espaços", () => {
    expect(cleanSignerName("  Dora   Dona da Silva ")).toBe("Dora Dona da Silva");
    expect(cleanSignerName("Dora")).toBeNull();
    expect(cleanSignerName("A B")).toBeNull();
    expect(cleanSignerName("x".repeat(60) + " " + "y".repeat(60))).toBeNull();
  });
  it("IP do primeiro x-forwarded-for, senão x-real-ip; lixo vira null", () => {
    expect(clientIpFrom(headers({ "x-forwarded-for": "200.10.20.30, 10.0.0.1" }))).toBe("200.10.20.30");
    expect(clientIpFrom(headers({ "x-real-ip": "2804:14c::1" }))).toBe("2804:14c::1");
    expect(clientIpFrom(headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIpFrom(headers({}))).toBeNull();
  });
  it("códigos de erro novos traduzidos nos dois portais", () => {
    for (const c of ["signature_required", "already_signed", "terms_changed", "invalid_tax_id", "name_required"]) {
      expect(AGENCY_ERROR_CODES).toContain(c);
      expect(talentErrorCode(new Error(c))).toBe(c);
    }
    expect(agencyErrorCode({ message: "invalid_tax_id" })).toBe("invalid_tax_id");
  });
});

describe("avisos por e-mail (espelho de public.inbox_kind_emails)", () => {
  it("só os avisos combinados, com a parte certa", () => {
    expect(INBOX_KINDS).toContain("task_due_soon");
    expect(inboxKindEmails("opportunity_received", "/heroi/oportunidades/x")).toBe(true);
    expect(inboxKindEmails("opportunity_received", "/agencia/negocios/x")).toBe(false);
    expect(inboxKindEmails("deliverable_decided", "/heroi/oportunidades/x", { status: "changes_requested" })).toBe(true);
    expect(inboxKindEmails("deliverable_decided", "/heroi/oportunidades/x", { status: "approved" })).toBe(false);
    expect(inboxKindEmails("deliverable_submitted", "/marca/campanhas/x")).toBe(true);
    expect(inboxKindEmails("deliverable_submitted", "/agencia/negocios/x/entregas")).toBe(false);
    expect(inboxKindEmails("opportunity_updated", "/heroi/oportunidades/x", { status: "counter_accepted" })).toBe(true);
    expect(inboxKindEmails("opportunity_updated", "/heroi/oportunidades/x", { status: "deal_lost" })).toBe(false);
    expect(inboxKindEmails("contract_acceptance_requested", "/marca/campanhas/x")).toBe(true);
    expect(inboxKindEmails("task_due_soon", "/agencia/tarefas")).toBe(true);
    expect(inboxKindEmails("message_received", "/heroi")).toBe(false);
  });
  it("todo tipo que vai por e-mail tem texto nos 3 idiomas", () => {
    for (const locale of ["pt-BR", "en", "es"] as const)
      for (const kind of WORK_EMAIL_KINDS) {
        const email = buildWorkEmail({ kind, params: { deal: "Verão", brand: "Alfa", talent: "Ana", status: "counter_accepted", date: "2026-11-03 14:00" }, link: "/creator/escritorio/tarefas", origin: "https://app.test/", locale, messages: messages(locale) });
        expect(email).not.toBeNull();
        expect(email!.subject.length).toBeGreaterThan(3);
        expect(email!.text).toContain("https://app.test/heroi/tarefas");
      }
    expect(isWorkEmailKind("member_joined")).toBe(false);
  });
  it("link absoluto e seguro, HTML escapado, data no formato do idioma", () => {
    const email = buildWorkEmail({ kind: "deliverable_submitted", params: { deal: "<b>Verão</b>", talent: "Ana" }, link: "//evil.test", origin: "https://app.test", locale: "pt-BR", messages: messages("pt-BR") })!;
    expect(email.text).toContain("https://app.test/");
    expect(email.text).not.toContain("evil.test");
    expect(email.html).toContain("&lt;b&gt;Verão&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Verão</b>");
    const due = buildWorkEmail({ kind: "task_due_soon", params: { deal: "Verão", date: "2026-11-03 14:00" }, link: "/heroi/tarefas", origin: "https://app.test", locale: "pt-BR", messages: messages("pt-BR") })!;
    expect(due.text).toContain("03/11/2026 14:00");
    expect(formatLocalStamp("2026-11-03 14:00", "en")).toBe("11/03/2026 14:00");
    expect(formatLocalStamp("2026-11-03", "es")).toBe("03/11/2026");
  });
  it("contraproposta: aceita e recusada têm textos diferentes", () => {
    const base = { kind: "opportunity_updated", link: "/heroi/oportunidades/x", origin: "https://app.test", locale: "pt-BR" as const, messages: messages("pt-BR") };
    const ok = buildWorkEmail({ ...base, params: { deal: "Verão", status: "counter_accepted" } })!;
    const no = buildWorkEmail({ ...base, params: { deal: "Verão", status: "counter_rejected" } })!;
    expect(ok.subject).not.toBe(no.subject);
  });
});

describe("migração 0084", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0084_assinatura_emails_kit_portfolio.sql"), "utf8");
  it("recria o check de avisos com TODOS os tipos e não abre nada para o visitante", () => {
    // os avisos do patrocínio chegaram depois, na 0085; os da chamada da marca, na 0089; verba e pagamentos, na 0090
    for (const kind of INBOX_KINDS.filter((k) => !k.startsWith("sponsorship_") && !k.startsWith("brand_call_") && k !== "budget_change" && !k.startsWith("payment_") && !k.startsWith("roadmap_") && k !== "payout_due" && k !== "hero_account_linked" && k !== "brand_access_granted" && !k.startsWith("agency_access_") && !k.startsWith("casting_access_") && !k.startsWith("brand_approval_") && !k.startsWith("profile_claim_") && !k.startsWith("brand_login_") && !k.startsWith("onda_") && !k.startsWith("creator_") && !k.startsWith("group_project_")))
      expect(sql).toContain(`'${kind}'`);
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
    expect(sql).toMatch(/revoke execute on function public\.terms_signature_create\([^)]*\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke execute on function public\.email_outbox_claim\(int\) from public, anon, authenticated/);
  });
  it("o check de campos do kit mantém os antigos e acrescenta stats e portfolio", () => {
    for (const f of KIT_FIELDS) expect(sql).toContain(`'${f}'`);
  });
});

describe("media kit automático e portfólio", () => {
  const raw = {
    completed_campaigns: 1,
    published_deliverables: 2,
    on_time_base: 2,
    on_time_count: 1,
    rating_avg: 4.5,
    rating_count: 2,
    metrics: { views: 2000, likes: "120", fee_cents: 9 },
    app_followers: null,
    networks_updated_at: "2026-10-20T10:00:00Z",
    computed_at: "2026-11-02T12:00:00Z",
  };
  it("números do banco viram o formato da tela; taxa no prazo em %", () => {
    const stats = toKitStats(raw)!;
    expect(stats).toMatchObject({ completed_campaigns: 1, rating_avg: 4.5, app_followers: null, metrics: { views: 2000, likes: 120 } });
    expect(stats.metrics).not.toHaveProperty("fee_cents");
    expect(onTimeRate(stats)).toBe(50);
    expect(onTimeRate({ on_time_base: 0, on_time_count: 0 })).toBeNull();
    expect(onTimeRate({ on_time_base: 3, on_time_count: 5 })).toBe(100);
    expect(toKitStats(null)).toBeNull();
    expect(metricEntries({ likes: 1, views: 2 }).map((m) => m.key)).toEqual(["views", "likes"]);
    expect(toKitMetrics({ views: -1, reach: 10 })).toEqual({ reach: 10 });
  });
  it("portfólio: só link https; campanha sem entrega válida some; totais somam", () => {
    const items = toPortfolio([
      { campaign: "Outono", brand: "Alfa", deliverables: [{ title: "Reels", kind: "reels", network: "instagram", url: "https://instagram.com/p/1", metrics: { views: 1500 } }, { title: "X", url: "javascript:alert(1)" }] },
      { campaign: "Vazia", brand: "Beta", deliverables: [{ title: "Y", url: "http://inseguro.test" }] },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].deliverables).toHaveLength(1);
    expect(portfolioTotals(items)).toEqual({ views: 1500 });
    expect(toPortfolio("x")).toEqual([]);
  });
  it("kit: campos novos, padrão com números e portfólio só quando marcado; nenhuma chave de valor", () => {
    expect(KIT_FIELDS).toContain("stats");
    expect(KIT_FIELDS).toContain("portfolio");
    expect(DEFAULT_KIT_FIELDS).toContain("stats");
    expect(DEFAULT_KIT_FIELDS).not.toContain("portfolio");
    const source = (fields: string[]): KitSource => ({
      name: "Talento",
      photoUrl: null,
      city: null,
      state: null,
      segments: [],
      networks: [],
      headline: "",
      about: "",
      visibleFields: fields,
      brands: [],
      agencyName: "Agência",
      agencyEmail: null,
      stats: toKitStats(raw),
      portfolio: toPortfolio([{ campaign: "Outono", brand: "Alfa", deliverables: [{ title: "Reels", url: "https://instagram.com/p/1", metrics: {} }] }]),
    });
    const only = buildKit(source(["stats"]));
    expect(only.stats?.completed_campaigns).toBe(1);
    expect(only.portfolio).toBeUndefined();
    const both = buildKit(source(["stats", "portfolio"]));
    expect(both.portfolio).toHaveLength(1);
    const keys = JSON.stringify(both).match(/"([a-z_]+)":/g) ?? [];
    expect(keys.filter((k) => FORBIDDEN_KIT_KEYS.test(k))).toEqual([]);
  });
});
