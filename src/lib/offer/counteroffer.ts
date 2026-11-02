import { z } from "zod";

// Contraproposta do creator e alerta de exclusividade (0079). Lógica pura (testada com vitest): normaliza o que
// o banco devolve (talent_offer_state / agency_offer_state) e decide o que a tela mostra.
//
// Decisões:
//   • Uma contraproposta aberta por vez (o banco garante com índice único; a tela esconde os botões).
//   • "Outro valor" exige justificativa curta (3 a 300 caracteres); "outra data" aceita observação opcional.
//   • A data proposta vale de hoje até um ano à frente (o banco confere de novo).
//   • Valor só chega a quem pode ver (creator dono e Adm); para os demais vem null e a tela não mostra número.

export const COUNTER_KINDS = ["fee", "date"] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];
export const COUNTER_STATUSES = ["open", "accepted", "rejected", "withdrawn"] as const;
export type CounterStatus = (typeof COUNTER_STATUSES)[number];

export type Counteroffer = {
  id: string;
  dealTalentId: string | null;
  kind: CounterKind;
  feeCents: number | null;
  previousFeeCents: number | null;
  deliverableId: string | null;
  deliverableTitle: string | null;
  proposedDate: string | null;
  previousDate: string | null;
  reason: string;
  status: CounterStatus;
  decisionNote: string;
  decidedAt: string | null;
  createdAt: string;
};

export type Conflict = { dealId: string; dealTitle: string; brandName: string; until: string | null; category: string; segments: string[]; competitor: boolean };

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => Boolean(x) && typeof x === "object" && !Array.isArray(x)) : []);
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

export function toCounteroffers(raw: unknown): Counteroffer[] {
  return rows(raw)
    .filter((c) => (COUNTER_KINDS as readonly unknown[]).includes(c.kind) && (COUNTER_STATUSES as readonly unknown[]).includes(c.status))
    .map((c) => ({
      id: String(c.id),
      dealTalentId: str(c.deal_talent_id),
      kind: c.kind as CounterKind,
      feeCents: num(c.fee_cents),
      previousFeeCents: num(c.previous_fee_cents),
      deliverableId: str(c.deliverable_id),
      deliverableTitle: str(c.deliverable_title),
      proposedDate: str(c.proposed_date),
      previousDate: str(c.previous_date),
      reason: typeof c.reason === "string" ? c.reason : "",
      status: c.status as CounterStatus,
      decisionNote: typeof c.decision_note === "string" ? c.decision_note : "",
      decidedAt: str(c.decided_at),
      createdAt: String(c.created_at ?? ""),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function toConflicts(raw: unknown): Conflict[] {
  return rows(raw).map((c) => ({
    dealId: String(c.deal_id ?? ""),
    dealTitle: typeof c.deal_title === "string" ? c.deal_title : "",
    brandName: typeof c.brand_name === "string" ? c.brand_name : "",
    until: str(c.until),
    category: typeof c.category === "string" ? c.category : "",
    segments: Array.isArray(c.segments) ? c.segments.filter((s): s is string => typeof s === "string") : [],
    competitor: c.competitor === true,
  }));
}

/** agency_offer_state.conflicts ([{talent_id, items}]) → mapa talento → conflitos. */
export function conflictsByTalent(raw: unknown): Record<string, Conflict[]> {
  const out: Record<string, Conflict[]> = {};
  for (const r of rows(raw)) {
    const id = str(r.talent_id);
    const items = toConflicts(r.items);
    if (id && items.length > 0) out[id] = items;
  }
  return out;
}

export function openCounteroffer(list: Counteroffer[]): Counteroffer | null {
  return list.find((c) => c.status === "open") ?? null;
}

/** Contraproposta mais recente já decidida (para mostrar o resultado ao creator). */
export function lastDecided(list: Counteroffer[]): Counteroffer | null {
  return [...list].filter((c) => c.status === "accepted" || c.status === "rejected").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0] ?? null;
}

/** Contrapropostas por creator do negócio (agência). */
export function groupByDealTalent(list: Counteroffer[]): Record<string, Counteroffer[]> {
  const out: Record<string, Counteroffer[]> = {};
  for (const c of list) {
    if (!c.dealTalentId) continue;
    (out[c.dealTalentId] ??= []).push(c);
  }
  return out;
}

/** Diferença em dias entre duas datas YYYY-MM-DD (positivo = depois). */
export function dayShift(from: string | null, to: string | null): number | null {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Hoje (YYYY-MM-DD) num fuso e o limite de um ano à frente: a faixa válida da data proposta. */
export function proposedDateRange(now: Date, timeZone: string): { min: string; max: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const min = fmt(now);
  const max = new Date(Date.parse(`${min}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
  return { min, max };
}

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const counterFeeSchema = z.object({ dealTalentId: uuid, kind: z.literal("fee"), feeCents: z.number().int().min(1).max(10_000_000_000), reason: z.string().trim().min(3).max(300) });
export const counterDateSchema = z.object({ dealTalentId: uuid, kind: z.literal("date"), proposedDate: isoDate, deliverableId: z.union([z.literal(""), uuid]), reason: z.string().trim().max(300) });
export const counterofferSchema = z.discriminatedUnion("kind", [counterFeeSchema, counterDateSchema]);
export type CounterofferInput = z.input<typeof counterofferSchema>;
export const counterDecideSchema = z
  .object({ counterofferId: uuid, dealId: uuid, decision: z.enum(["accepted", "rejected"]), note: z.string().trim().max(300) })
  .refine((v) => v.decision === "accepted" || v.note.length >= 3, { path: ["note"] });

/** Payload da RPC talent_counteroffer_create a partir do que a tela validou. */
export function counterofferPayload(input: z.output<typeof counterofferSchema>): { [key: string]: string | number | null } {
  return input.kind === "fee"
    ? { fee_cents: input.feeCents, reason: input.reason }
    : { proposed_date: input.proposedDate, deliverable_id: input.deliverableId || null, reason: input.reason };
}
