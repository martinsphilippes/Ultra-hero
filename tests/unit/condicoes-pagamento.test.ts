import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { payStep } from "@/lib/finance/earnings";
import {
  addDays,
  addMonths,
  defaultDraft,
  draftToPlan,
  manualDates,
  payoutDue,
  planCommission,
  planParts,
  planToDraft,
  planToJson,
  toPaymentPlan,
  toPaymentPlanView,
  type PaymentPlan,
  type PlanEvents,
} from "@/lib/finance/payment-plan";
import { filterReceivables, forecastTotal, paymentTotals, receivableInstallmentState, type Receivable } from "@/lib/finance/payments";
import { INBOX_KINDS, inboxKindEmails } from "@/lib/inbox/kinds";
import { tierShareCents, tierTotalCents } from "@/lib/sponsorship/negotiation";

// Condições de pagamento (0108): mesma conta do banco (payment_plan_parts / payment_plan_payout_due, conferidas também
// no cenário S114 com os mesmos números).

const TODAY = "2026-11-04";
const EV: PlanEvents = { signature: "2026-11-10", delivery: "2026-12-01", publication: "2026-12-05" };
const base = (p: Partial<PaymentPlan> = {}): PaymentPlan => ({ ...(draftToPlan(defaultDraft(TODAY), 100, 0, TODAY) as { ok: true; plan: PaymentPlan }).plan, ...p });

describe("datas em dias corridos", () => {
  it("soma dias e meses como o Postgres (fim do mês vira o último dia)", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2027-01-31", 2)).toBe("2027-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("parcelas da marca", () => {
  it("à vista na assinatura + N dias", () => {
    expect(planParts(base({ firstRule: "signature", firstDays: 5 }), 300000, EV)).toEqual([{ seq: 1, amountCents: 300000, dueOn: "2026-11-15" }]);
  });
  it("sinal 30% na assinatura + saldo 15 dias após a publicação (igual ao S114)", () => {
    const plan = base({ structure: "down_payment", downPaymentPct: 30, firstRule: "signature", firstDays: 0, balanceRule: "publication", balanceDays: 15 });
    expect(planParts(plan, 300000, EV)).toEqual([
      { seq: 1, amountCents: 90000, dueOn: "2026-11-10" },
      { seq: 2, amountCents: 210000, dueOn: "2026-12-20" },
    ]);
    // sinal nunca é zero nem o total
    expect(planParts({ ...plan, downPaymentPct: 1 }, 2, EV).map((p) => p.amountCents)).toEqual([1, 1]);
  });
  it("3 parcelas mensais a partir de 31/01: o centavo que sobra vai para as primeiras", () => {
    const plan = base({ structure: "installments", installments: 3, interval: "monthly", firstRule: "date", firstOn: "2027-01-31" });
    expect(planParts(plan, 100001, EV)).toEqual([
      { seq: 1, amountCents: 33334, dueOn: "2027-01-31" },
      { seq: 2, amountCents: 33334, dueOn: "2027-02-28" },
      { seq: 3, amountCents: 33333, dueOn: "2027-03-31" },
    ]);
  });
  it("quinzenal soma 14 dias; manual usa as datas digitadas", () => {
    const bi = base({ structure: "installments", installments: 2, interval: "biweekly", firstRule: "date", firstOn: "2026-11-09" });
    expect(planParts(bi, 70000, EV).map((p) => p.dueOn)).toEqual(["2026-11-09", "2026-11-23"]);
    const manual = base({ structure: "installments", installments: 2, interval: "manual", dates: ["2026-12-01", "2027-01-15"], firstRule: null, firstDays: null, firstOn: null });
    expect(planParts(manual, 70000, EV)).toEqual([
      { seq: 1, amountCents: 35000, dueOn: "2026-12-01" },
      { seq: 2, amountCents: 35000, dueOn: "2027-01-15" },
    ]);
    expect(planParts(manual, 0, EV)).toEqual([]);
  });
  it("comissão = acordado − repasses", () => {
    expect(planCommission(300000, 180000)).toEqual({ commissionCents: 120000, ok: true });
    expect(planCommission(150000, 180000).ok).toBe(false);
  });
});

describe("repasse ao herói", () => {
  it("depois de receber (última parcela), em data fixa ou depois da entrega", () => {
    expect(payoutDue({ payoutRule: "after_receipt", payoutDays: 10, payoutOn: null }, "2026-12-20", EV.delivery)).toBe("2026-12-30");
    expect(payoutDue({ payoutRule: "fixed_date", payoutDays: 0, payoutOn: "2027-01-05" }, "2026-12-20", EV.delivery)).toBe("2027-01-05");
    expect(payoutDue({ payoutRule: "after_delivery", payoutDays: 7, payoutOn: null }, null, EV.delivery)).toBe("2026-12-08");
    expect(payoutDue({ payoutRule: "after_receipt", payoutDays: 10, payoutOn: null }, null, EV.delivery)).toBeNull();
  });
});

describe("rascunho do formulário", () => {
  it("confere como o banco", () => {
    const d = defaultDraft(TODAY);
    expect(draftToPlan(d, null, 0, TODAY)).toEqual({ ok: false, problem: "total" });
    expect(draftToPlan({ ...d, method: "other", methodNote: " " }, 1000, 0, TODAY)).toEqual({ ok: false, problem: "methodNote" });
    expect(draftToPlan({ ...d, structure: "down_payment", downPaymentPct: 100 }, 1000, 0, TODAY)).toEqual({ ok: false, problem: "downPayment" });
    expect(draftToPlan({ ...d, structure: "installments", installments: 13 }, 1000, 0, TODAY)).toEqual({ ok: false, problem: "installments" });
    expect(draftToPlan({ ...d, structure: "installments", installments: 2, interval: "manual", dates: ["2027-01-10", "2026-12-01"] }, 1000, 0, TODAY)).toEqual({
      ok: false,
      problem: "dates",
    });
    expect(draftToPlan({ ...d, structure: "down_payment", firstRule: "date", firstOn: "2026-12-10", balanceRule: "date", balanceOn: "2026-12-01" }, 1000, 0, TODAY)).toEqual({
      ok: false,
      problem: "balanceOn",
    });
    expect(draftToPlan(d, 1000, 2000, TODAY)).toEqual({ ok: false, problem: "belowPayouts" });
  });
  it("normaliza: o que não se aplica vira null (mesmo formato de payment_plan_clean)", () => {
    const r = draftToPlan({ ...defaultDraft(TODAY), method: "pix", methodNote: "ignorado", firstRule: "date", firstOn: "2026-12-01", firstDays: 9 }, 1000, 0, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan).toMatchObject({ methodNote: "", firstDays: 0, downPaymentPct: null, installments: null, interval: null, dates: null, balanceRule: null });
    const json = planToJson(r.plan);
    expect(Object.keys(json).sort()).toEqual(
      ["balance_days", "balance_on", "balance_rule", "dates", "down_payment_pct", "first_days", "first_on", "first_rule", "installments", "interval", "invoice_agency", "invoice_talent", "method", "method_note", "notes", "payout_days", "payout_method", "payout_on", "payout_rule", "structure"].sort(),
    );
    // ida e volta
    expect(toPaymentPlan(json)).toEqual(r.plan);
    expect(planToDraft(r.plan, TODAY).firstOn).toBe("2026-12-01");
  });
  it("datas manuais completam mês a mês a partir do 1º vencimento", () => {
    expect(manualDates({ dates: ["2026-12-01"], installments: 3, firstOn: "2026-12-01" }, TODAY)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
  });
});

describe("leitura e telas", () => {
  it("lê o JSON da RPC por quem vê", () => {
    const v = toPaymentPlanView({
      enabled: true, viewer: "talent", values: true, status: "forecast", has_plan: true,
      plan: { payout_rule: "after_receipt", payout_days: 10, payout_method: "pix", invoice_talent: true },
      my_payout: { deal_talent_id: "dt", amount_cents: 100000, status: "forecast", due_on: "2026-12-30" },
      events: { signature: "2026-11-10", delivery: "2026-12-01", publication: "2026-12-05" },
    });
    expect(v?.viewer).toBe("talent");
    expect(v?.plan?.invoiceTalent).toBe(true);
    expect(v?.myPayout).toEqual({ dealTalentId: "dt", amountCents: 100000, status: "forecast", dueOn: "2026-12-30" });
    expect(toPaymentPlanView(null)).toBeNull();
  });
  it("previsto: parcela não vence, fica fora dos totais e tem filtro próprio", () => {
    const r = (entryStatus: Receivable["entryStatus"], id: string): Receivable => ({
      entryId: id, dealId: "d", requestId: null, title: "T", brandId: "b", brandName: "B", agencyId: "a", agencyName: "A", origin: "campaign",
      totalCents: 1000, entryStatus, plan: null,
      installments: [{ id: `i${id}`, seq: 1, label: "", amountCents: 1000, dueOn: "2026-10-01", status: "open", paidAt: null, report: null, fromPlan: true }],
    });
    const items = [r("forecast", "f"), r("planned", "p")];
    expect(receivableInstallmentState(items[0], items[0].installments[0], TODAY)).toBe("forecast");
    expect(receivableInstallmentState(items[1], items[1].installments[0], TODAY)).toBe("overdue");
    expect(paymentTotals(items, TODAY).openCents).toBe(1000);
    expect(forecastTotal(items)).toEqual({ cents: 1000, count: 1 });
    expect(filterReceivables(items, "forecast", TODAY).map((x) => x.entryId)).toEqual(["f"]);
    expect(filterReceivables(items, "open", TODAY).map((x) => x.entryId)).toEqual(["p"]);
    expect(payStep({ status: "forecast", scheduledOn: null, invoice: null })).toBe("awaiting_contract");
  });
  it("avisos e erros novos", () => {
    expect(INBOX_KINDS).toContain("payout_due");
    expect(inboxKindEmails("payout_due", "/creator/escritorio/ganhos")).toBe(false);
    for (const c of ["payment_terms_required", "agreed_below_payouts", "plan_locked"]) expect(AGENCY_ERROR_CODES).toContain(c);
    expect(agencyErrorCode({ message: "payment_terms_required" })).toBe("payment_terms_required");
  });
});

describe("cotas: valor fixo do evento × por marca", () => {
  it("total e parte de cada marca (mesma conta de sponsorship_tier_ask)", () => {
    expect(tierTotalCents({ valueModel: "por_marca", priceCents: 200000, slots: 2 })).toBe(400000);
    expect(tierTotalCents({ valueModel: "fixo", priceCents: 900000, slots: 3 })).toBe(900000);
    expect(tierShareCents({ valueModel: "fixo", priceCents: 900000, slots: 3 })).toBe(300000);
    expect(tierShareCents({ valueModel: "fixo", priceCents: 900000, slots: 3 }, 300000, 1)).toBe(300000);
    expect(tierShareCents({ valueModel: "fixo", priceCents: 1000000, slots: 3 })).toBe(333334);
    expect(tierShareCents({ valueModel: "fixo", priceCents: 900000, slots: 3 }, 900000, 2)).toBeNull();
    expect(tierShareCents({ valueModel: "por_marca", priceCents: null, slots: 3 })).toBeNull();
  });
});
