import { z } from "zod";
import { AGE_BANDS, UFS, type AgeBand } from "@/lib/talent/vocab";

// Cotas e negociação do patrocínio (0088), lógica pura testada em tests/unit/patrocinio-negociacao.test.ts.
// O banco confere tudo de novo (checks e RPCs); aqui ficam o formulário das cotas, a diferença em relação ao pedido,
// as contrapartidas da proposta, o público e quem pode fazer o quê em cada situação.

export const MAX_PERKS = 10;

/** Mesma regra de public.sponsorship_perks_valid: até 10, de 3 a 120 letras, sem repetir. */
export function perksValid(perks: readonly string[]): boolean {
  if (perks.length > MAX_PERKS) return false;
  const lower = new Set(perks.map((p) => p.toLowerCase()));
  return lower.size === perks.length && perks.every((p) => p === p.trim() && p.length >= 3 && p.length <= 120);
}

export const MAX_TIERS = 3;
export const MAX_TIER_SLOTS = 20;
export const MAX_AMOUNT_CENTS = 10_000_000_000;

export const PROPOSAL_STATUSES = ["draft", "open", "agreed", "declined", "closed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_END_REASONS = ["declined_brand", "declined_agency", "tier_full", "decided", "cancelled", "returned"] as const;
export type ProposalEndReason = (typeof PROPOSAL_END_REASONS)[number];
export const ROUND_ACTIONS = ["accept_asked", "propose", "counter", "accept", "decline"] as const;
export type RoundAction = (typeof ROUND_ACTIONS)[number];
export const ROUND_STATES = ["sent", "pending_owner", "returned"] as const;
export type RoundState = (typeof ROUND_STATES)[number];
export type Side = "brand" | "agency";
export const REPLY_ACTIONS = ["accept", "decline", "counter"] as const;
export type ReplyAction = (typeof REPLY_ACTIONS)[number];

// ---------------------------------------------------------------- dinheiro
/** Diferença do valor proposto em relação ao pedido: centavos e % (1 casa). null sem pedido. */
export function priceDiff(askedCents: number | null, proposedCents: number | null): { cents: number; pct: number } | null {
  if (askedCents === null || proposedCents === null || askedCents <= 0) return null;
  const cents = proposedCents - askedCents;
  return { cents, pct: Math.round((cents / askedCents) * 1000) / 10 };
}

/** Valor de uma proposta é válido? (inteiro, de R$ 0,01 até o teto do banco) */
export function amountValid(cents: number | null | undefined): cents is number {
  return typeof cents === "number" && Number.isInteger(cents) && cents >= 1 && cents <= MAX_AMOUNT_CENTS;
}

// ---------------------------------------------------------------- contrapartidas
/** Contrapartidas da proposta: pelo menos uma e a regra da 0085 (até 10, 3 a 120 letras, sem repetir). */
export function proposalPerksValid(perks: readonly string[]): boolean {
  return perks.length >= 1 && perksValid(perks);
}

/** Itens da cota marcados (na ordem da cota) + pedidos novos (sem repetir o que já está), limpos. */
export function composePerks(tierPerks: readonly string[], kept: readonly string[], extras: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item || seen.has(item.toLowerCase())) return;
    seen.add(item.toLowerCase());
    out.push(item);
  };
  for (const p of tierPerks) if (kept.includes(p)) push(p);
  for (const p of extras) push(p);
  return out;
}

/** O que mudou em relação às contrapartidas de referência (da cota ou da rodada anterior). */
export function perksDiff(base: readonly string[], next: readonly string[]): { kept: string[]; removed: string[]; added: string[] } {
  const lower = (list: readonly string[]) => new Set(list.map((p) => p.toLowerCase()));
  const b = lower(base);
  const n = lower(next);
  return {
    kept: next.filter((p) => b.has(p.toLowerCase())),
    removed: base.filter((p) => !n.has(p.toLowerCase())),
    added: next.filter((p) => !b.has(p.toLowerCase())),
  };
}

// ---------------------------------------------------------------- público (mesmos campos da campanha)
export type SponsorshipPublic = { targetAudience: string; targetAgeBands: AgeBand[]; targetStates: string[]; regionNote: string };
export const EMPTY_PUBLIC: SponsorshipPublic = { targetAudience: "", targetAgeBands: [], targetStates: [], regionNote: "" };

export const publicSchema = z.object({
  targetAudience: z.string().trim().max(500),
  targetAgeBands: z.array(z.enum(AGE_BANDS)).max(AGE_BANDS.length),
  targetStates: z.array(z.string()).max(UFS.length).refine((list) => list.every((x) => (UFS as readonly string[]).includes(x))),
  regionNote: z.string().trim().max(200),
});

export function publicIsEmpty(p: SponsorshipPublic | null | undefined): boolean {
  return !p || (!p.targetAudience.trim() && !p.regionNote.trim() && p.targetAgeBands.length === 0 && p.targetStates.length === 0);
}

/** Para o banco (snake_case), em ordem fixa (faixas na ordem da lista, UFs em ordem alfabética); null se vazio. */
export type PublicDb = { target_audience: string; target_age_bands: string[]; target_states: string[]; region_note: string };

export function publicToDb(p: SponsorshipPublic | null | undefined): PublicDb | null {
  if (!p || publicIsEmpty(p)) return null;
  return {
    target_audience: p.targetAudience.trim(),
    target_age_bands: AGE_BANDS.filter((a) => p.targetAgeBands.includes(a)),
    target_states: Array.from(new Set(p.targetStates.map((s) => s.toUpperCase()))).sort(),
    region_note: p.regionNote.trim(),
  };
}

export function publicFromDb(v: unknown): SponsorshipPublic | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  const out: SponsorshipPublic = {
    targetAudience: typeof r.target_audience === "string" ? r.target_audience : "",
    targetAgeBands: list(r.target_age_bands).filter((a): a is AgeBand => (AGE_BANDS as readonly string[]).includes(a)),
    targetStates: list(r.target_states),
    regionNote: typeof r.region_note === "string" ? r.region_note : "",
  };
  return publicIsEmpty(out) ? null : out;
}

/** Chips curtos do público ("25-34", "RJ, SP", texto livre). */
export function publicChips(p: SponsorshipPublic | null): string[] {
  if (!p) return [];
  const chips: string[] = [];
  if (p.targetAudience.trim()) chips.push(p.targetAudience.trim().length > 60 ? `${p.targetAudience.trim().slice(0, 59)}…` : p.targetAudience.trim());
  chips.push(...p.targetAgeBands);
  if (p.targetStates.length > 0) chips.push(p.targetStates.length > 6 ? `${p.targetStates.slice(0, 6).join(", ")} +${p.targetStates.length - 6}` : p.targetStates.join(", "));
  if (p.regionNote.trim()) chips.push(p.regionNote.trim());
  return chips;
}

// ---------------------------------------------------------------- cotas (formulário da agência)
export type TierDraft = { id: string | null; name: string; priceText: string; perksText: string; slots: number };

export const tierSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(1).max(MAX_AMOUNT_CENTS).nullable(),
  perks: z.array(z.string()).max(MAX_PERKS),
  slots: z.number().int().min(1).max(MAX_TIER_SLOTS),
});
export type TierInput = z.infer<typeof tierSchema>;

export type TierError = "name" | "nameRepeated" | "price" | "perks" | "slots";

/**
 * Confere as cotas digitadas. parsePrice converte o texto em centavos (null = vazio, undefined = inválido);
 * canValues=false (gestor) ignora o valor. Devolve as cotas prontas ou o primeiro erro (com o índice).
 */
export function validateTiers(
  drafts: readonly TierDraft[],
  parsePrice: (text: string) => number | null | undefined,
  parsePerks: (text: string) => string[],
  canValues: boolean,
): { ok: true; tiers: TierInput[] } | { ok: false; index: number; error: TierError | "count" } {
  if (drafts.length < 1 || drafts.length > MAX_TIERS) return { ok: false, index: -1, error: "count" };
  const names = new Set<string>();
  const tiers: TierInput[] = [];
  for (const [index, d] of drafts.entries()) {
    const name = d.name.replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 40) return { ok: false, index, error: "name" };
    if (names.has(name.toLowerCase())) return { ok: false, index, error: "nameRepeated" };
    names.add(name.toLowerCase());
    let priceCents: number | null = null;
    if (canValues) {
      const parsed = parsePrice(d.priceText);
      if (parsed === undefined || (parsed !== null && !amountValid(parsed))) return { ok: false, index, error: "price" };
      priceCents = parsed;
    }
    const perks = parsePerks(d.perksText);
    if (!perksValid(perks)) return { ok: false, index, error: "perks" };
    if (!Number.isInteger(d.slots) || d.slots < 1 || d.slots > MAX_TIER_SLOTS) return { ok: false, index, error: "slots" };
    tiers.push({ id: d.id, name, priceCents, perks, slots: d.slots });
  }
  return { ok: true, tiers };
}

// ---------------------------------------------------------------- quem pode o quê
export type ProposalState = {
  status: ProposalStatus;
  awaiting: Side | null;
  /** há rodada da equipe da marca esperando o dono */
  pendingOwner: boolean;
};

/** Ações da marca numa proposta (o dono ou a equipe; aceitar/contrapropor da equipe vão para o dono). */
export function brandReplyActions(p: ProposalState, hasRole: boolean): ReplyAction[] {
  if (!hasRole || p.status !== "open" || p.awaiting !== "brand" || p.pendingOwner) return [];
  return ["accept", "counter", "decline"];
}

/** Ações da agência: só o Adm, na vez dela. */
export function agencyReplyActions(p: Pick<ProposalState, "status" | "awaiting">, canValues: boolean): ReplyAction[] {
  if (!canValues || p.status !== "open" || p.awaiting !== "agency") return [];
  return ["accept", "counter", "decline"];
}

/** A rodada da equipe precisa do dono? (recusar não compromete dinheiro: vai direto) */
export function needsOwnerApproval(role: "owner" | "staff" | null, action: RoundAction): boolean {
  return role === "staff" && action !== "decline";
}

/** Situação curta da proposta para selo: em quem está a vez, ou o desfecho. */
export type ProposalBadge = "waitingOwner" | "waitingAgency" | "waitingBrand" | "agreed" | "declined" | "closed";
export function proposalBadge(p: ProposalState): ProposalBadge {
  if (p.status === "draft" || p.pendingOwner) return "waitingOwner";
  if (p.status === "open") return p.awaiting === "agency" ? "waitingAgency" : "waitingBrand";
  if (p.status === "agreed") return "agreed";
  if (p.status === "declined") return "declined";
  return "closed";
}

/** A marca pode abrir uma proposta nesta cota? */
export function canProposeOnTier(t: { full: boolean }, canPropose: boolean, hasRole: boolean): boolean {
  return hasRole && canPropose && !t.full;
}
