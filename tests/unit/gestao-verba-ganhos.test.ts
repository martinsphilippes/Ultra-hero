import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENCY_ERROR_CODES, agencyErrorCode } from "@/lib/agency/error-codes";
import { isDocumentsRevalidatePath } from "@/lib/documents/constants";
import { budgetNeedsAttention, budgetTone, budgetUsedPercent, toBudgetOverview, toBudgetSummary } from "@/lib/finance/budget";
import {
  canSendInvoice,
  earningGroup,
  earningTotals,
  expectedPayDate,
  latestInvoice,
  payStep,
  sortEarnings,
  toEarnings,
  validPayDate,
  type Earning,
} from "@/lib/finance/earnings";
import { budgetSetSchema, ENTRY_FILTERS, invoiceAttachSchema, invoiceReviewSchema, payoutScheduleSchema } from "@/lib/finance/vocab";
import { buildBrandToday, buildTalentToday, type BrandWorkboard, type TalentTodayData, type TdPayout } from "@/lib/today/logic";
import { toTalentToday } from "@/lib/today/normalize";

// Bloco 5 (0082): verba da marca, ganhos do influenciador, nota fiscal e pagamento — regras de tela.

const ID = "11111111-1111-4111-8111-111111111111";
const earning = (over: Partial<Earning> = {}): Earning => ({
  id: "e1", dealId: "d1", dealTalentId: "dt1", agencyId: "a1", dealTitle: "Verão", brandName: "Alfa", status: "planned", amountCents: 100000,
  dueOn: "2026-12-01", scheduledOn: null, settledAt: null, delivered: false, invoice: null, payoutMethod: null, invoiceRequired: false, ...over,
});
const inv = (status: "submitted" | "approved" | "rejected", over: Record<string, unknown> = {}) => ({ id: `i-${status}`, status, reviewNote: "", documentId: "doc", submittedAt: "2026-11-01T10:00:00Z", reviewedAt: null, ...over });

describe("situação do pagamento", () => {
  it("segue a ordem aguardando nota → enviada → aprovada → agendado → pago", () => {
    expect(payStep(earning())).toBe("awaiting_invoice");
    expect(payStep(earning({ invoice: inv("submitted") }))).toBe("invoice_sent");
    expect(payStep(earning({ invoice: inv("approved") }))).toBe("invoice_approved");
    expect(payStep(earning({ invoice: inv("approved"), scheduledOn: "2026-11-10", status: "due" }))).toBe("scheduled");
    expect(payStep(earning({ status: "settled", scheduledOn: "2026-11-10" }))).toBe("paid");
    expect(payStep(earning({ status: "cancelled" }))).toBe("cancelled");
  });
  it("nota recusada volta a aguardando nota; agendado sem nota vale (RPA)", () => {
    expect(payStep(earning({ invoice: inv("rejected") }))).toBe("awaiting_invoice");
    expect(payStep(earning({ scheduledOn: "2026-11-10", status: "due" }))).toBe("scheduled");
  });
  it("enviar nota: só repasse aberto, sem nota enviada/aprovada", () => {
    expect(canSendInvoice(earning())).toBe(true);
    expect(canSendInvoice(earning({ invoice: inv("rejected") }))).toBe(true);
    expect(canSendInvoice(earning({ invoice: inv("submitted") }))).toBe(false);
    expect(canSendInvoice(earning({ invoice: inv("approved") }))).toBe(false);
    expect(canSendInvoice(earning({ status: "settled" }))).toBe(false);
    expect(canSendInvoice(earning({ status: "cancelled" }))).toBe(false);
  });
  it("data prevista: a agendada manda; sem ela, o vencimento", () => {
    expect(expectedPayDate(earning())).toBe("2026-12-01");
    expect(expectedPayDate(earning({ scheduledOn: "2026-11-20" }))).toBe("2026-11-20");
  });
});

describe("painel de ganhos", () => {
  it("a receber = entregue e não pago; previsão = em produção; pagos; cancelado fora", () => {
    expect(earningGroup(earning({ delivered: true }))).toBe("receivable");
    expect(earningGroup(earning())).toBe("forecast");
    expect(earningGroup(earning({ status: "settled" }))).toBe("paid");
    expect(earningGroup(earning({ status: "cancelled", delivered: true }))).toBeNull();
    const totals = earningTotals([
      earning({ delivered: true, amountCents: 100000 }),
      earning({ delivered: true, amountCents: 50000, status: "due" }),
      earning({ amountCents: 70000 }),
      earning({ status: "settled", amountCents: 30000 }),
      earning({ status: "cancelled", amountCents: 999999 }),
    ]);
    expect(totals).toEqual({ receivable: { cents: 150000, count: 2 }, forecast: { cents: 70000, count: 1 }, paid: { cents: 30000, count: 1 } });
  });
  it("ordem: a receber sem nota primeiro, depois por data; pagos (mais recente primeiro) e cancelados no fim", () => {
    const list = sortEarnings([
      earning({ id: "paid-old", status: "settled", settledAt: "2026-10-01T00:00:00Z" }),
      earning({ id: "cancel", status: "cancelled" }),
      earning({ id: "forecast", dueOn: "2026-11-05" }),
      earning({ id: "sent", delivered: true, invoice: inv("submitted"), dueOn: "2026-11-03" }),
      earning({ id: "todo-late", delivered: true, dueOn: "2026-12-10" }),
      earning({ id: "todo-soon", delivered: true, dueOn: "2026-11-10" }),
      earning({ id: "paid-new", status: "settled", settledAt: "2026-10-20T00:00:00Z" }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["todo-soon", "todo-late", "sent", "forecast", "paid-new", "paid-old", "cancel"]);
  });
  it("normaliza talent_payouts (0072 + 0082) e a nota mais recente do financeiro", () => {
    const [e] = toEarnings([{ id: "x", deal_id: "d", deal_talent_id: "dt", agency_id: "a", deal_title: "T", brand_name: "B", status: "due", amount_cents: "12345",
      due_on: "2026-12-01", scheduled_on: "2026-11-20", settled_at: null, delivered: true, invoice: { id: "i", status: "rejected", review_note: "CNPJ", document_id: "doc", submitted_at: "2026-11-01" } }]);
    expect(e).toMatchObject({ amountCents: 12345, scheduledOn: "2026-11-20", delivered: true, invoice: { status: "rejected", reviewNote: "CNPJ", documentId: "doc" } });
    expect(toEarnings([{ id: "y", status: "zzz", invoice: { status: "bad" } }])[0]).toMatchObject({ status: "planned", invoice: null, delivered: false });
    expect(toEarnings(null)).toEqual([]);
    expect(latestInvoice([{ id: "a", status: "rejected", created_at: "2026-11-01T00:00:00Z" }, { id: "b", status: "submitted", created_at: "2026-11-02T00:00:00Z" }])?.id).toBe("b");
    expect(latestInvoice(undefined)).toBeNull();
    // mesmo instante (mesma transação): a aberta vale
    expect(latestInvoice([{ id: "z", status: "rejected", created_at: "2026-11-02T00:00:00Z" }, { id: "a", status: "approved", created_at: "2026-11-02T00:00:00Z" }])?.id).toBe("a");
  });
  it("data de pagamento: de hoje até 366 dias", () => {
    expect(validPayDate("2026-11-02", "2026-11-02")).toBe(true);
    expect(validPayDate("2027-11-03", "2026-11-02")).toBe(true);
    expect(validPayDate("2027-11-04", "2026-11-02")).toBe(false);
    expect(validPayDate("2026-11-01", "2026-11-02")).toBe(false);
    expect(validPayDate("02/11/2026", "2026-11-02")).toBe(false);
  });
});

describe("verba da marca", () => {
  it("situação: sem verba, folgada, quase no limite (≥ 90%), estourada", () => {
    expect(budgetTone(null, 100)).toBe("none");
    expect(budgetTone(100000, 50000)).toBe("ok");
    expect(budgetTone(100000, 90000)).toBe("near");
    expect(budgetTone(100000, 100000)).toBe("near");
    expect(budgetTone(100000, 100001)).toBe("over");
    expect(budgetTone(0, 0)).toBe("ok");
    expect(budgetUsedPercent(300000, 280000)).toBe(93);
    expect(budgetUsedPercent(null, 1)).toBeNull();
    expect(budgetUsedPercent(0, 1)).toBeNull();
  });
  it("normaliza o painel e a visão geral (valores nulos preservados)", () => {
    const s = toBudgetSummary({ request_id: "r", title: "Verão", brand_status: "running", reserved_cents: 280000, reserved_source: "set", offered_cents: 300000,
      committed_cents: 300000, paid_cents: 0, open_cents: 300000, remaining_cents: -20000, over: true, talents_over: 0, payment_due_on: "2026-12-01", payment_status: "planned",
      can_edit: true, talents: [{ deal_talent_id: "dt", talent_name: "Ana", status: "contracted", reserved_cents: null, committed_cents: "120000", paid_cents: 0, over: false }] });
    expect(s).toMatchObject({ reservedCents: 280000, reservedSource: "set", remainingCents: -20000, over: true, canEdit: true, brandStatus: "running" });
    expect(s?.talents[0]).toEqual({ dealTalentId: "dt", talentName: "Ana", status: "contracted", reservedCents: null, committedCents: 120000, paidCents: 0, over: false });
    expect(toBudgetSummary({ reserved_cents: null, reserved_source: "zzz", brand_status: "x" })).toMatchObject({ reservedCents: null, reservedSource: "none", brandStatus: "draft", remainingCents: null });
    const o = toBudgetOverview({ role: "staff", items: [{ request_id: "r", over: false, talents_over: 1 }, null], reserved_cents: 1, committed_cents: 2, paid_cents: 0, over_count: 1 });
    expect(o).toMatchObject({ role: "staff", overCount: 1 });
    expect(o?.items).toHaveLength(1);
    expect(budgetNeedsAttention(o!.items[0])).toBe(true);
    expect(toBudgetOverview([])).toBeNull();
  });
  it("formas dos formulários", () => {
    expect(budgetSetSchema.safeParse({ requestId: ID, dealTalentId: null, totalCents: null }).success).toBe(true);
    expect(budgetSetSchema.safeParse({ requestId: ID, dealTalentId: ID, totalCents: -1 }).success).toBe(false);
    expect(invoiceAttachSchema.safeParse({ entryId: ID, documentId: "x" }).success).toBe(false);
    expect(invoiceReviewSchema.safeParse({ invoiceId: ID, decision: "approve", note: "", payOn: "2026-11-10" }).success).toBe(true);
    expect(invoiceReviewSchema.safeParse({ invoiceId: ID, decision: "maybe", note: "", payOn: null }).success).toBe(false);
    expect(payoutScheduleSchema.safeParse({ entryId: ID, payOn: "10/11/2026" }).success).toBe(false);
    expect(ENTRY_FILTERS).toContain("invoices");
  });
});

describe("\"Hoje\" com verba e pagamentos", () => {
  const NOW = new Date("2026-11-02T15:00:00Z");
  const pay = (over: Partial<TdPayout>): TdPayout => ({
    id: "p1", dealTalentId: "dt1", dealTitle: "Verão", brandName: "Alfa", status: "planned", dueOn: "2026-12-01", scheduledOn: null, delivered: true,
    invoiceStatus: null, invoiceNote: "", ...over,
  });
  const td = (payouts: TdPayout[]): TalentTodayData => ({ timezone: "America/Sao_Paulo", tasks: [], offers: [], deliverables: [], terms: [], payouts });

  it("creator: entregue sem nota (ou recusada) pede a nota; enviada/aprovada ou em produção não", () => {
    const items = buildTalentToday(td([
      pay({ id: "missing" }),
      pay({ id: "rejected", invoiceStatus: "rejected", invoiceNote: "CNPJ errado" }),
      pay({ id: "sent", invoiceStatus: "submitted" }),
      pay({ id: "approved", invoiceStatus: "approved" }),
      pay({ id: "prod", delivered: false }),
      pay({ id: "paid", status: "settled" }),
    ]), NOW);
    expect(items.map((i) => i.key).sort()).toEqual(["invoice:missing", "invoice:rejected"]);
    expect(items.find((i) => i.key === "invoice:rejected")).toMatchObject({ status: "rejected", note: "CNPJ errado", href: "/heroi/financeiro#pay-rejected", urgency: "waiting" });
    expect(items.find((i) => i.key === "invoice:missing")?.status).toBe("missing");
  });
  it("creator: pagamento agendado para os próximos dias entra; mais longe não; agendado não pede nota", () => {
    const items = buildTalentToday(td([
      pay({ id: "today", scheduledOn: "2026-11-02", status: "due" }),
      pay({ id: "soon", scheduledOn: "2026-11-04", status: "due", invoiceStatus: "approved" }),
      pay({ id: "far", scheduledOn: "2026-11-20", status: "due" }),
    ]), NOW);
    expect(items.map((i) => i.key)).toEqual(["payment:today", "payment:soon"]);
    expect(items[0]).toMatchObject({ kind: "payment", urgency: "today", deadline: "2026-11-02" });
    expect(buildTalentToday(td([]), NOW)).toEqual([]);
    expect(buildTalentToday({ ...td([]), payouts: undefined }, NOW)).toEqual([]);
  });
  it("normaliza os repasses do talent_today (sem valor)", () => {
    const n = toTalentToday({ payouts: [{ id: "p", deal_talent_id: "dt", status: "due", scheduled_on: "2026-11-03", delivered: true, invoice_status: "approved", invoice_note: "" }, { id: "q", invoice_status: "zzz" }] });
    expect(n?.payouts?.[0]).toMatchObject({ scheduledOn: "2026-11-03", delivered: true, invoiceStatus: "approved" });
    expect(n?.payouts?.[1]).toMatchObject({ invoiceStatus: null, delivered: false });
  });
  it("marca: verba estourada (campanha ou influenciador) vira pendência para quem tem papel", () => {
    const wb = (role: "owner" | "staff" | null): BrandWorkboard => ({ role, timezone: "America/Sao_Paulo", campaigns: [], talents: [], deliverables: [], scriptApprovals: [], termsPending: [], threads: [] });
    const budgets = [
      { requestId: "r1", title: "Verão", over: true, talentsOver: 0 },
      { requestId: "r2", title: "Inverno", over: false, talentsOver: 2 },
      { requestId: "r3", title: "Ok", over: false, talentsOver: 0 },
    ];
    const items = buildBrandToday(wb("staff"), NOW, { budgets });
    expect(items.map((i) => i.key).sort()).toEqual(["budget:r1", "budget:r2"]);
    expect(items.find((i) => i.key === "budget:r1")).toMatchObject({ kind: "budget", status: "over", href: "/marca/campanhas/r1#camp-budget" });
    expect(items.find((i) => i.key === "budget:r2")?.status).toBe("talents_over");
    expect(buildBrandToday(wb(null), NOW, { budgets })).toEqual([]);
    expect(buildBrandToday(wb("owner"), NOW)).toEqual([]);
  });
});

describe("integração", () => {
  it("códigos de erro novos com mensagem nos três idiomas", () => {
    for (const c of ["invoice_open", "invalid_date"]) expect(AGENCY_ERROR_CODES).toContain(c);
    expect(agencyErrorCode({ message: "invoice_open" })).toBe("invoice_open");
    expect(agencyErrorCode({ message: "invalid_date" })).toBe("invalid_date");
    for (const locale of ["pt-BR", "en", "es"]) {
      const agency = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "agency.json"), "utf8")) as { errors: Record<string, string> };
      for (const c of ["invoice_open", "invalid_date"]) expect(agency.errors[c], `${locale} ${c}`).toBeTruthy();
    }
  });
  it("a tela de ganhos pode revalidar após enviar a nota (e só ela)", () => {
    expect(isDocumentsRevalidatePath("/heroi/financeiro")).toBe(true);
    expect(isDocumentsRevalidatePath("/heroi/ganhos/x")).toBe(false);
  });
});

describe("migração 0082", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0082_verba_ganhos_nota_fiscal.sql"), "utf8");
  it("recria talent_today e talent_payouts com a mesma assinatura e fecha tudo para visitante", () => {
    for (const sig of ["talent_today()", "talent_payouts()"]) expect(sql).toContain(`create or replace function public.${sig}`);
    const created = [...sql.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    for (const fn of created) expect(sql, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon`));
    expect(sql).not.toMatch(/grant execute[^;]*to [^;]*anon/);
    expect(sql).not.toMatch(/drop (table|column)/i);
  });
  it("o check de avisos mantém todos os tipos da 0081", () => {
    const prev = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0081_preselecao_aprovacao_notas.sql"), "utf8");
    const kinds = (text: string) => {
      const block = text.slice(text.indexOf("add constraint inbox_notifications_kind_check"), text.indexOf("));", text.indexOf("add constraint inbox_notifications_kind_check")));
      return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    };
    for (const k of kinds(prev)) expect(kinds(sql)).toContain(k);
    for (const k of ["invoice_submitted", "invoice_reviewed", "payout_scheduled", "budget_exceeded"]) expect(kinds(sql)).toContain(k);
  });
  it("avisos sem valor: nenhum parâmetro de dinheiro nos avisos novos", () => {
    const notifies = [...sql.matchAll(/inbox_notify(?:_agency|_brand)?\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(notifies.length).toBeGreaterThanOrEqual(4);
    // as chaves dos parâmetros (jsonb_build_object) são só tokens de texto do sino
    for (const n of notifies) {
      const keys = [...n.matchAll(/jsonb_build_object\(([^)]*)/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)',/g)].map((k) => k[1]));
      for (const k of keys) expect(["deal", "talent", "status", "date"], k).toContain(k);
    }
  });
});
