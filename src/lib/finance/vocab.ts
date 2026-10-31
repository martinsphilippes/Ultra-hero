import { z } from "zod";

// Financeiro simulado (0069): listas fechadas iguais aos checks do banco e a conta que o banco também faz.
// F = soma dos cachês dos creators contratados; taxa em pontos-base; C = F × taxa; V = F + C (o que a marca paga).
export const ENTRY_KINDS = ["brand_receivable", "commission", "talent_payout"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const ENTRY_STATUSES = ["planned", "due", "settled", "cancelled"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export const ENTRY_FILTERS = ["open", "overdue", "settled", "cancelled", "all"] as const;
export type EntryFilter = (typeof ENTRY_FILTERS)[number];
export const MAX_RATE_BP = 5000;

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === "string" && (ENTRY_STATUSES as readonly string[]).includes(value);
}
export function isEntryKind(value: unknown): value is EntryKind {
  return typeof value === "string" && (ENTRY_KINDS as readonly string[]).includes(value);
}

/** Mesma aritmética da RPC agency_finance_generate (inteiros em centavos; arredondamento meio para cima). */
export function computeFinance(feesCents: number[], rateBp: number): { payouts: number; commission: number; total: number } {
  const payouts = feesCents.reduce((acc, f) => acc + Math.max(0, Math.trunc(f)), 0);
  const commission = Math.round((payouts * rateBp) / 10000);
  return { payouts, commission, total: payouts + commission };
}

/** Próximas situações possíveis (o banco decide de verdade): planejado → a vencer/liquidado/cancelado; a vencer → liquidado/cancelado. */
export function nextEntryStatuses(status: EntryStatus): ("due" | "settled" | "cancelled")[] {
  if (status === "planned") return ["due", "settled", "cancelled"];
  if (status === "due") return ["settled", "cancelled"];
  return [];
}

/** "20", "20,5", "12.75" → pontos-base (2000, 2050, 1275); fora da faixa ou inválido → null. */
export function parseRatePercent(input: string): number | null {
  const clean = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$|^\d{1,2}$/.test(clean)) return null;
  const bp = Math.round(Number(clean) * 100);
  if (!Number.isFinite(bp) || bp < 0 || bp > MAX_RATE_BP) return null;
  return bp;
}

export function formatRate(bp: number, locale = "pt-BR"): string {
  return `${(bp / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
}

const uuid = z.uuid();
export const entryStatusSchema = z.object({ entryId: uuid, status: z.enum(["due", "settled", "cancelled"]), note: z.string().trim().max(500) });
export const rateSchema = z.object({ rateBp: z.number().int().min(0).max(MAX_RATE_BP) });
export const dealRateSchema = z.object({ dealId: uuid, rateBp: z.number().int().min(0).max(MAX_RATE_BP).nullable() });
export const sponsorshipSchema = z.object({ dealTalentId: uuid, dealId: uuid });
