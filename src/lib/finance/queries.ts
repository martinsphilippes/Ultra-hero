import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { toBudgetOverview, toBudgetSummary, type BudgetOverview, type BudgetSummary } from "./budget";
import { toAgencyChanges, toBrandChanges, type AgencyChanges, type BrandChanges } from "./budget-change";
import { toAgencyPayments, toBrandPayments, toPaymentSettings, type AgencyPaymentsData, type BrandPaymentsData, type PaymentSettings } from "./payments";
import { latestInvoice, toEarnings, type Earning, type PayoutInvoice } from "./earnings";
import { isEntryKind, isEntryStatus, type EntryFilter, type EntryKind, type EntryStatus } from "./vocab";

// Financeiro simulado (0069): lançamentos pela RLS (só o Adm da agência lê; o creator lê o próprio repasse) e o
// resumo por RPC. Nada aqui é cobrança real.

export type Entry = {
  id: string;
  dealId: string;
  dealTitle: string;
  brandName: string;
  talentId: string | null;
  talentName: string | null;
  dealTalentId: string | null;
  kind: EntryKind;
  amountCents: number;
  status: EntryStatus;
  dueOn: string | null;
  settledAt: string | null;
  note: string;
  createdAt: string;
  /** 0082: data agendada do pagamento (repasse) e a nota fiscal mais recente */
  scheduledOn: string | null;
  invoice: PayoutInvoice | null;
};

export type FinanceSummary = {
  receivableOpenCents: number;
  receivableSettledCents: number;
  commissionOpenCents: number;
  commissionSettledCents: number;
  payoutOpenCents: number;
  payoutSettledCents: number;
  overdueCount: number;
  openCount: number;
  deals: number;
};

const ENTRY_SELECT_BASE = "id, deal_id, talent_id, deal_talent_id, kind, amount_cents, status, due_on, settled_at, note, created_at, deal:deals!financial_entries_deal_fk(title), brand:brands!financial_entries_brand_fk(name), talent:talent_profiles!financial_entries_talent_fk(display_name)";
// 0082: data agendada e notas fiscais (o Adm lê pela RLS); sem a migração, a leitura volta à forma da 0072
const ENTRY_SELECT = `${ENTRY_SELECT_BASE}, scheduled_on, invoices:payout_invoices!payout_invoices_entry_fk(id, status, review_note, document_id, created_at, reviewed_at)`;
type Row = {
  id: string; deal_id: string; talent_id: string | null; deal_talent_id: string | null; kind: string; amount_cents: number; status: string; due_on: string | null; settled_at: string | null; note: string; created_at: string;
  deal: { title: string } | null; brand: { name: string } | null; talent: { display_name: string } | null;
  scheduled_on?: string | null; invoices?: unknown;
};
const toEntry = (r: Row): Entry => ({
  id: r.id,
  dealId: r.deal_id,
  dealTitle: r.deal?.title ?? "",
  brandName: r.brand?.name ?? "",
  talentId: r.talent_id,
  talentName: r.talent?.display_name ?? null,
  dealTalentId: r.deal_talent_id,
  kind: isEntryKind(r.kind) ? r.kind : "commission",
  amountCents: Number(r.amount_cents),
  status: isEntryStatus(r.status) ? r.status : "planned",
  dueOn: r.due_on,
  settledAt: r.settled_at,
  note: r.note ?? "",
  createdAt: r.created_at,
  scheduledOn: r.scheduled_on ?? null,
  invoice: latestInvoice(r.invoices),
});

export async function listEntries(agencyId: string, filter: EntryFilter = "open"): Promise<{ available: boolean; items: Entry[] }> {
  const supabase = await createClient();
  const run = async (select: string) => {
    let query = supabase.from("financial_entries").select(select).eq("agency_id", agencyId).order("due_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(500);
    if (filter === "open") query = query.in("status", ["planned", "due"]);
    if (filter === "overdue") query = query.in("status", ["planned", "due"]).lt("due_on", new Date().toISOString().slice(0, 10));
    if (filter === "settled") query = query.eq("status", "settled");
    if (filter === "cancelled") query = query.eq("status", "cancelled");
    // notas para conferir: repasses abertos cuja última nota foi enviada (filtrado abaixo)
    if (filter === "invoices") query = query.eq("kind", "talent_payout").in("status", ["planned", "due"]);
    return query;
  };
  let { data, error } = await run(ENTRY_SELECT);
  if (error && isMissingSchema(error)) ({ data, error } = await run(ENTRY_SELECT_BASE));
  if (error) return { available: !isMissingSchema(error), items: [] };
  const items = ((data ?? []) as unknown as Row[]).map(toEntry);
  return { available: true, items: filter === "invoices" ? items.filter((e) => e.invoice?.status === "submitted") : items };
}

/** Lançamentos de um negócio (Adm, pela RLS). */
export async function dealEntries(dealId: string): Promise<{ available: boolean; items: Entry[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { available: true, items: [] };
  const supabase = await createClient();
  const run = (select: string) => supabase.from("financial_entries").select(select).eq("deal_id", dealId).order("kind").order("created_at");
  let { data, error } = await run(ENTRY_SELECT);
  if (error && isMissingSchema(error)) ({ data, error } = await run(ENTRY_SELECT_BASE));
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as unknown as Row[]).map(toEntry) };
}

/** Repasses do próprio creator, pela RPC talent_payouts (0072 + 0082: marca, agendamento, entrega feita e nota).
 *  O app nativo esconde o valor (native:hidden); a web mostra. */
export type Payout = Earning;
export async function myPayouts(): Promise<{ available: boolean; items: Payout[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_payouts");
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: toEarnings(data) };
}

/** Painel da verba de uma campanha (0082): reservado, comprometido, pago, por influenciador. null sem acesso. */
export async function brandBudgetSummary(requestId: string): Promise<{ available: boolean; data: BudgetSummary | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_budget_summary", { p_request: requestId });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toBudgetSummary(data) };
}

/** Visão geral da verba da marca (0082). */
export async function brandBudgetOverview(brandId: string): Promise<{ available: boolean; data: BudgetOverview | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_budget_overview", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toBudgetOverview(data) };
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
export function toSummary(raw: unknown): FinanceSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const k = raw as Record<string, unknown>;
  return {
    receivableOpenCents: num(k.receivable_open_cents),
    receivableSettledCents: num(k.receivable_settled_cents),
    commissionOpenCents: num(k.commission_open_cents),
    commissionSettledCents: num(k.commission_settled_cents),
    payoutOpenCents: num(k.payout_open_cents),
    payoutSettledCents: num(k.payout_settled_cents),
    overdueCount: num(k.overdue_count),
    openCount: num(k.open_count),
    deals: num(k.deals),
  };
}

export async function financeSummary(agencyId: string): Promise<{ available: boolean; data: FinanceSummary | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_finance_summary", { p_agency: agencyId });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toSummary(data) };
}

/** Taxas (Adm, pela RPC agency_rates): padrão da agência, sobrescrita do negócio e se já há contratação. null sem a 0069. */
export async function agencyRates(agencyId: string, dealId?: string | null): Promise<{ agencyRateBp: number; dealRateBp: number | null; contracted: boolean } | null> {
  if (dealId && !/^[0-9a-f-]{36}$/i.test(dealId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_rates", { p_agency: agencyId, p_deal: dealId ?? null });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const k = data as Record<string, unknown>;
  return { agencyRateBp: num(k.agency_rate_bp), dealRateBp: k.deal_rate_bp === null || k.deal_rate_bp === undefined ? null : num(k.deal_rate_bp), contracted: Boolean(k.contracted) };
}

// ---------------------------------------------------------------- 0090: pedido de alteração de verba e pagamentos da marca

/** Pedidos de alteração de verba de uma campanha (marca: com valores; pode pedir?). */
export async function brandBudgetChanges(requestId: string): Promise<BrandChanges | null> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_budget_changes", { p_request: requestId });
  if (error) return null;
  return toBrandChanges(data);
}

/** Pedidos de um negócio para a agência (Adm com valores; gestor/equipe do negócio só a situação). */
export async function agencyBudgetChanges(dealId: string): Promise<AgencyChanges | null> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_budget_changes", { p_deal: dealId });
  if (error) return null;
  return toAgencyChanges(data);
}

/** O que a marca deve às agências, com parcelas, informes e os dados de pagamento. */
export async function brandPayments(brandId: string): Promise<{ available: boolean; data: BrandPaymentsData | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_payments", { p_brand: brandId });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toBrandPayments(data) };
}

/** Pagamentos das marcas para o Adm da agência. */
export async function agencyBrandPayments(agencyId: string): Promise<{ available: boolean; data: AgencyPaymentsData | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_brand_payments", { p_agency: agencyId });
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toAgencyPayments(data) };
}

/** Dados de pagamento da agência (só o Adm lê, pela RLS). */
export async function agencyPaymentSettings(agencyId: string): Promise<{ available: boolean; data: PaymentSettings | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("agency_payment_settings").select("*").eq("agency_id", agencyId).maybeSingle();
  if (error) return { available: !isMissingSchema(error), data: null };
  return { available: true, data: toPaymentSettings(data) };
}
