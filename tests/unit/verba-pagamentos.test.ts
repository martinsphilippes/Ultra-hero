import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { brandNavKeys } from "@/lib/agency/roles";
import {
  brandChangeActions,
  budgetRowLocked,
  changeDelta,
  changeFinalCents,
  isOpenChange,
  parsePerks,
  planProblem,
  planToDb,
  toAgencyChanges,
  toBrandChanges,
  toBudgetChange,
  type PlanDraft,
} from "@/lib/finance/budget-change";
import { toBudgetSummary } from "@/lib/finance/budget";
import {
  canReport,
  daysUntil,
  filterReceivables,
  formatPixKey,
  installmentState,
  normalizePixKey,
  paymentTotals,
  settingsProblem,
  splitEvenly,
  splitProblem,
  splitRemaining,
  toBrandPayments,
  toReceivable,
  type Receivable,
  type SettingsDraft,
} from "@/lib/finance/payments";
import { inboxKindEmails, inboxKindPushes, INBOX_KINDS } from "@/lib/inbox/kinds";
import { isWorkEmailKind } from "@/lib/email/work-message";

const draft = (p: Partial<PlanDraft> = {}): PlanDraft => ({
  creators: [],
  changeDeliverables: false,
  deliverables: [],
  periodStart: "",
  periodEnd: "",
  scheduleNote: "",
  perksText: "",
  note: "",
  ...p,
});

describe("pedido de alteração de verba: lógica pura", () => {
  it("situações abertas e valor final (contraproposta vence o pedido)", () => {
    expect(isOpenChange("pending_owner")).toBe(true);
    expect(isOpenChange("proposed")).toBe(true);
    expect(isOpenChange("confirmed")).toBe(false);
    expect(changeFinalCents({ requestedCents: 350000, counterCents: null })).toBe(350000);
    expect(changeFinalCents({ requestedCents: 350000, counterCents: 330000 })).toBe(330000);
    expect(changeDelta(300000, 330000)).toBe(30000);
    expect(changeDelta(null, 1)).toBeNull();
  });

  it("trava: só a linha já definida trava depois de enviada a campanha", () => {
    expect(budgetRowLocked(true, 100)).toBe(true);
    expect(budgetRowLocked(true, null)).toBe(false);
    expect(budgetRowLocked(false, 100)).toBe(false);
    expect(toBudgetSummary({ locked: true, change_status: "open" })).toMatchObject({ locked: true, changeStatus: "open" });
    expect(toBudgetSummary({})).toMatchObject({ locked: false, changeStatus: null });
  });

  it("quem faz o quê: equipe monta, dono envia/devolve/confirma, quem pediu retira", () => {
    expect(brandChangeActions({ status: "pending_owner", createdByMe: true }, "staff")).toEqual(["withdraw"]);
    expect(brandChangeActions({ status: "pending_owner", createdByMe: false }, "owner")).toEqual(["send", "return", "withdraw"]);
    expect(brandChangeActions({ status: "open", createdByMe: false }, "staff")).toEqual([]);
    expect(brandChangeActions({ status: "proposed", createdByMe: true }, "staff")).toEqual([]);
    expect(brandChangeActions({ status: "proposed", createdByMe: false }, "owner")).toEqual(["confirm", "decline"]);
    expect(brandChangeActions({ status: "confirmed", createdByMe: true }, "owner")).toEqual([]);
    expect(brandChangeActions({ status: "open", createdByMe: true }, null)).toEqual([]);
  });

  it("contrapartidas: uma por linha, sem vazias nem repetidas, até 10", () => {
    expect(parsePerks("Post fixado\n\n post fixado \nStories extra\nx")).toEqual(["Post fixado", "Stories extra"]);
    expect(parsePerks(Array.from({ length: 15 }, (_, i) => `Item ${i}`).join("\n"))).toHaveLength(10);
  });

  it("plano: só o que muda vai ao banco; problemas conferidos antes", () => {
    const d = draft({
      creators: [
        { dealTalentId: "a", name: "Ana", action: "keep", note: "" },
        { dealTalentId: "b", name: "Bia", action: "remove", note: "Sai" },
        { dealTalentId: "x", name: " Nova ", action: "add", note: "" },
      ],
      changeDeliverables: true,
      deliverables: [{ kind: "reels", quantity: 3, network: "instagram" }],
      periodStart: "2026-12-01",
      perksText: "Post fixado",
    });
    expect(planToDb(d)).toEqual({
      creators: [
        { deal_talent_id: "b", name: "Bia", action: "remove", note: "Sai" },
        { deal_talent_id: null, name: "Nova", action: "add", note: "" },
      ],
      deliverables: [{ kind: "reels", quantity: 3, network: "instagram" }],
      period_start: "2026-12-01",
      perks: ["Post fixado"],
    });
    expect(planToDb(draft())).toEqual({});
    expect(planProblem(d)).toBeNull();
    expect(planProblem(draft({ creators: [{ dealTalentId: null, name: " ", action: "add", note: "" }] }))).toBe("creator_name");
    expect(planProblem(draft({ periodStart: "2026-12-10", periodEnd: "2026-12-01" }))).toBe("period_order");
    expect(planProblem(draft({ note: "x".repeat(1001) }))).toBe("too_long");
  });

  it("leitura das RPCs: marca com valores, gestor sem valores", () => {
    const brand = toBrandChanges({
      role: "owner",
      can_request: false,
      items: [
        {
          id: "c1", status: "proposed", request_id: "r", deal_id: "d", created_label: "Ari", created_at: "2026-11-01T10:00:00Z", created_by_me: false,
          requested_cents: 350000, reason: "Mais alcance", counter_cents: 330000, final_cents: null, before_reserved_cents: 300000, before_offered_cents: 300000,
          plan: { creators: [{ deal_talent_id: "b", name: "Bia", action: "remove" }, { action: "zzz", name: "?" }], deliverables: [{ kind: "reels", quantity: 2 }], perks: ["A"] },
          talent_cents: [{ deal_talent_id: "a", name: "Ana", cents: 140000 }],
          events: [{ side: "brand", action: "sent", label: "Dora", at: "2026-11-01T10:00:00Z", note: "" }, { side: "x", action: "sent" }],
        },
        { id: "bad", status: "zzz" },
      ],
    });
    expect(brand.items).toHaveLength(1);
    const c = brand.items[0];
    expect(c.values?.counterCents).toBe(330000);
    expect(c.values?.plan?.creators).toEqual([{ dealTalentId: "b", name: "Bia", action: "remove", note: "" }]);
    expect(c.values?.plan?.deliverables).toEqual([{ kind: "reels", quantity: 2 }]);
    expect(c.values?.talents).toEqual([{ dealTalentId: "a", name: "Ana", cents: 140000 }]);
    expect(c.events).toHaveLength(1);
    const manager = toAgencyChanges({ can_decide: false, items: [{ id: "c1", status: "open", events: [] }] });
    expect(manager.canDecide).toBe(false);
    expect(manager.items[0].values).toBeNull();
    expect(toBudgetChange(null)).toBeNull();
  });
});

const receivable = (p: Partial<Receivable> = {}): Receivable => ({
  entryId: "e",
  dealId: "d",
  requestId: "r",
  title: "Verão",
  brandId: "b",
  brandName: "Alfa",
  agencyId: "a",
  agencyName: "Ag",
  origin: "campaign",
  totalCents: 300000,
  entryStatus: "due",
  installments: [],
  plan: null,
  ...p,
});

describe("pagamentos da marca: lógica pura", () => {
  it("chave PIX: mesma normalização do banco", () => {
    expect(normalizePixKey("email", " Financeiro@Agencia.COM ")).toBe("financeiro@agencia.com");
    expect(normalizePixKey("email", "sem-arroba")).toBeNull();
    expect(normalizePixKey("phone", "(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePixKey("phone", "+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizePixKey("phone", "0800 123 456")).toBeNull();
    expect(normalizePixKey("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizePixKey("cpf", "111.111.111-11")).toBeNull();
    expect(normalizePixKey("cnpj", "11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizePixKey("random", "123E4567-E89B-12D3-A456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(normalizePixKey("random", "nao-e-uuid")).toBeNull();
    expect(formatPixKey("cnpj", "11222333000181")).toBe("11.222.333/0001-81");
    expect(formatPixKey("phone", "+5511987654321")).toBe("+55 (11) 98765-4321");
    expect(formatPixKey("email", "a@b.co")).toBe("a@b.co");
  });

  it("dados de pagamento: PIX ou banco, favorecido e CNPJ válidos", () => {
    const ok: SettingsDraft = { pixKeyType: "email", pixKey: "a@b.co", bankName: "", bankBranch: "", bankAccount: "", bankAccountType: "checking", holderName: "Agência", holderTaxId: "11.222.333/0001-81", instructions: "" };
    expect(settingsProblem(ok)).toBeNull();
    expect(settingsProblem({ ...ok, pixKey: "x" })).toBe("pix_key");
    expect(settingsProblem({ ...ok, pixKeyType: "", pixKey: "" })).toBe("method");
    expect(settingsProblem({ ...ok, pixKeyType: "", pixKey: "", bankName: "Itaú", bankBranch: "0001", bankAccount: "12345-6" })).toBeNull();
    expect(settingsProblem({ ...ok, bankName: "Itaú", bankBranch: "", bankAccount: "1" })).toBe("bank");
    expect(settingsProblem({ ...ok, holderName: " " })).toBe("holder");
    expect(settingsProblem({ ...ok, holderTaxId: "11222333000100" })).toBe("tax_id");
  });

  it("parcelas: divisão exata, soma conferida", () => {
    expect(splitEvenly(300000, 2)).toEqual([150000, 150000]);
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitEvenly(10, 99)).toHaveLength(12);
    const parts = [
      { label: "Assinatura", amountCents: 150000, dueOn: "2026-11-10" },
      { label: "Entrega", amountCents: 149999, dueOn: "2026-12-10" },
    ];
    expect(splitProblem(300000, parts)).toBe("sum");
    expect(splitRemaining(300000, parts)).toBe(1);
    expect(splitProblem(300000, [{ ...parts[0] }, { ...parts[1], amountCents: 150000 }])).toBeNull();
    expect(splitProblem(300000, [])).toBe("count");
    expect(splitProblem(300000, [{ label: "", amountCents: 0, dueOn: "2026-11-10" }])).toBe("amount");
    expect(splitProblem(300000, [{ label: "", amountCents: 300000, dueOn: "" }])).toBe("date");
  });

  it("situação: a vencer, vencido, informado, pago; informe recusado volta a valer o vencimento", () => {
    expect(daysUntil("2026-11-06", "2026-11-03")).toBe(3);
    expect(daysUntil("2026-10-31", "2026-11-03")).toBe(-3);
    const base = { status: "open" as const, dueOn: "2026-11-01", report: null };
    expect(installmentState(base, "2026-11-03")).toBe("overdue");
    expect(installmentState({ ...base, dueOn: "2026-11-03" }, "2026-11-03")).toBe("upcoming");
    const reported = { id: "r", status: "reported" as const, paidOn: "2026-11-02", amountCents: 1, note: "", reviewNote: "", documentId: null, reportedLabel: "", reviewedLabel: "", createdAt: "", reviewedAt: null };
    expect(installmentState({ ...base, report: reported }, "2026-11-03")).toBe("reported");
    expect(installmentState({ ...base, report: { ...reported, status: "rejected" } }, "2026-11-03")).toBe("overdue");
    expect(installmentState({ ...base, status: "paid" }, "2026-11-03")).toBe("paid");
    expect(canReport({ status: "open", report: reported }, "due")).toBe(false);
    expect(canReport({ status: "open", report: { ...reported, status: "rejected" } }, "due")).toBe(true);
    expect(canReport({ status: "open", report: null }, "settled")).toBe(false);
  });

  it("totais e filtros da agência", () => {
    const inst = (id: string, amount: number, dueOn: string, status: "open" | "paid" = "open", reported = false) => ({
      id, seq: 1, label: "", amountCents: amount, dueOn, status, paidAt: null, fromPlan: false,
      report: reported ? { id: "r" + id, status: "reported" as const, paidOn: dueOn, amountCents: amount, note: "", reviewNote: "", documentId: null, reportedLabel: "", reviewedLabel: "", createdAt: "", reviewedAt: null } : null,
    });
    const a = receivable({ entryId: "a", installments: [inst("1", 100, "2026-11-01", "paid"), inst("2", 200, "2026-11-01")] });
    const b = receivable({ entryId: "b", installments: [inst("3", 300, "2026-11-20", "open", true)] });
    const c = receivable({ entryId: "c", entryStatus: "settled", installments: [inst("4", 400, "2026-10-01")] });
    expect(paymentTotals([a, b, c], "2026-11-03")).toEqual({ openCents: 200, overdueCents: 200, reportedCents: 300, paidCents: 500, overdueCount: 1, reportedCount: 1 });
    expect(filterReceivables([a, b, c], "reported", "2026-11-03").map((r) => r.entryId)).toEqual(["b"]);
    expect(filterReceivables([a, b, c], "open", "2026-11-03").map((r) => r.entryId)).toEqual(["a"]);
    expect(filterReceivables([a, b, c], "paid", "2026-11-03").map((r) => r.entryId)).toEqual(["c"]);
    expect(filterReceivables([a, b, c], "all", "2026-11-03")).toHaveLength(3);
  });

  it("leitura das RPCs", () => {
    const r = toReceivable({ entry_id: "e", origin: "call", entry_status: "due", total_cents: 300000, installments: [{ id: "i", seq: 1, amount_cents: 300000, due_on: "2026-11-10", status: "open", report: { status: "zzz" } }] });
    expect(r?.origin).toBe("call");
    expect(r?.installments[0].report).toBeNull();
    const data = toBrandPayments({ role: "staff", items: [{ entry_id: "e" }], agencies: [{ agency_id: "a", name: "Ag", settings: { pix_key_type: "email", pix_key: "a@b.co", holder_name: "Ag", holder_tax_id: "11222333000181" } }] });
    expect(data.role).toBe("staff");
    expect(data.agencies[0].settings?.pixKeyType).toBe("email");
    expect(data.agencies[0].timezone).toBe("America/Sao_Paulo");
    expect(toBrandPayments(null).items).toEqual([]);
  });
});

describe("avisos, menu, erros e migração 0090", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0090_verba_alteracao_pagamentos_marca.sql"), "utf8");

  it("cinco avisos novos, todos no check do banco; e-mail para a outra parte; nenhum vira push", () => {
    for (const kind of ["budget_change", "payment_reported", "payment_reviewed", "payment_due", "payment_plan"]) {
      expect(INBOX_KINDS).toContain(kind);
      expect(sql).toContain(`'${kind}'`);
      expect(isWorkEmailKind(kind)).toBe(true);
      expect(inboxKindPushes(kind, "/heroi")).toBe(false);
    }
    expect(inboxKindEmails("budget_change", "/agencia/negocios/x", { status: "requested" })).toBe(true);
    expect(inboxKindEmails("budget_change", "/marca/campanhas/x", { status: "review" })).toBe(false);
    expect(inboxKindEmails("budget_change", "/marca/campanhas/x", { status: "returned" })).toBe(false);
    expect(inboxKindEmails("payment_due", "/marca/pagamentos")).toBe(true);
  });

  it("Pagamentos no menu da marca, logo depois de Patrocínios", () => {
    const keys = brandNavKeys();
    expect(keys.indexOf("payments")).toBe(keys.indexOf("sponsorships") + 1);
  });

  it("erros novos com código conhecido", () => {
    for (const c of ["budget_locked", "change_open", "reason_required", "no_change", "installments_sum", "payment_open", "invalid_pix_key", "invalid_bank", "payment_method_required"]) {
      expect(AGENCY_ERROR_CODES).toContain(c);
      expect(agencyErrorCode(new Error(c))).toBe(c);
    }
  });

  it("migração: nada para o visitante, funções com search_path, sem sobrecarga das recriadas", () => {
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
    const fns = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    for (const f of fns) expect(sql, f).toMatch(new RegExp(`revoke execute on function public\\.${f}\\([^)]*\\) from public, anon`));
    expect([...sql.matchAll(/create or replace function [^\n]*\n(?:returns[^\n]*set search_path)/g)].length).toBeGreaterThan(0);
    expect(sql).toMatch(/create or replace function public\.brand_budget_set\(p_request uuid, p_deal_talent uuid, p_total_cents bigint\)/);
    expect(sql).toMatch(/raise exception 'budget_locked'/);
    expect(sql).not.toMatch(/\bdrop (table|column)\b/i);
  });
});
