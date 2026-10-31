import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
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

const ENTRY_SELECT = "id, deal_id, talent_id, deal_talent_id, kind, amount_cents, status, due_on, settled_at, note, created_at, deal:deals!financial_entries_deal_fk(title), brand:brands!financial_entries_brand_fk(name), talent:talent_profiles!financial_entries_talent_fk(display_name)";
type Row = {
  id: string; deal_id: string; talent_id: string | null; deal_talent_id: string | null; kind: string; amount_cents: number; status: string; due_on: string | null; settled_at: string | null; note: string; created_at: string;
  deal: { title: string } | null; brand: { name: string } | null; talent: { display_name: string } | null;
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
});

export async function listEntries(agencyId: string, filter: EntryFilter = "open"): Promise<{ available: boolean; items: Entry[] }> {
  const supabase = await createClient();
  let query = supabase.from("financial_entries").select(ENTRY_SELECT).eq("agency_id", agencyId).order("due_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(500);
  if (filter === "open") query = query.in("status", ["planned", "due"]);
  if (filter === "overdue") query = query.in("status", ["planned", "due"]).lt("due_on", new Date().toISOString().slice(0, 10));
  if (filter === "settled") query = query.eq("status", "settled");
  if (filter === "cancelled") query = query.eq("status", "cancelled");
  const { data, error } = await query;
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as unknown as Row[]).map(toEntry) };
}

/** Lançamentos de um negócio (Adm, pela RLS). */
export async function dealEntries(dealId: string): Promise<{ available: boolean; items: Entry[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { available: true, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.from("financial_entries").select(ENTRY_SELECT).eq("deal_id", dealId).order("kind").order("created_at");
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: ((data ?? []) as unknown as Row[]).map(toEntry) };
}

/** Repasses do próprio creator, pela RPC talent_payouts (título do negócio incluído; o app esconde o valor). */
export type Payout = { id: string; dealTitle: string; dealTalentId: string; status: EntryStatus; amountCents: number; dueOn: string | null; settledAt: string | null };
export async function myPayouts(): Promise<{ available: boolean; items: Payout[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_payouts");
  if (error) return { available: !isMissingSchema(error), items: [] };
  if (!Array.isArray(data)) return { available: true, items: [] };
  return {
    available: true,
    items: (data as Record<string, unknown>[]).map((p) => ({
      id: String(p.id),
      dealTitle: String(p.deal_title ?? ""),
      dealTalentId: String(p.deal_talent_id),
      status: isEntryStatus(p.status) ? p.status : "planned",
      amountCents: Number(p.amount_cents ?? 0),
      dueOn: p.due_on === null || p.due_on === undefined ? null : String(p.due_on),
      settledAt: p.settled_at === null || p.settled_at === undefined ? null : String(p.settled_at),
    })),
  };
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
