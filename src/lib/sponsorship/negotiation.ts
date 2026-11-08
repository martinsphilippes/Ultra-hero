import { z } from "zod";
import { MONEY_ONLY, draftFrom, draftToCompensation, toDb, type Compensation, type CompensationDb, type CompensationDraft, type CompensationError } from "@/lib/compensation/model";
import { compensationDbSchema } from "@/lib/compensation/schema";
import { centsToBrl } from "@/lib/money/brl-input";
import { AGE_BANDS, UFS, type AgeBand } from "@/lib/talent/vocab";

// Cotas e negociação do patrocínio (0088), lógica pura testada em tests/unit/patrocinio-negociacao.test.ts.
// O banco confere tudo de novo (checks e RPCs); aqui ficam o formulário das cotas, a diferença em relação ao pedido,
// as contrapartidas da proposta, o público e quem pode fazer o quê em cada situação.
// 0140: cada cota diz como a marca paga (Valor, Permuta e/ou Performance, por marca); sem dinheiro, a cota não tem
// valor pedido e a proposta não leva valor (acordo só com permuta/performance).

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

// ---------------------------------------------------------------- forma de pagamento (0140)
/**
 * Valor que vai com a proposta/contraproposta: com dinheiro, o digitado (precisa ser válido); sem dinheiro, nenhum
 * (o banco descarta o valor de quem não paga em dinheiro). undefined = valor inválido.
 */
export function termsAmount(money: boolean, cents: number | null | undefined): number | null | undefined {
  if (!money) return null;
  return amountValid(cents) ? cents : undefined;
}

/** Chave do nome da rodada (sponsorship.negotiation.*): aceitar uma cota sem dinheiro é "aceitou como está". */
export function roundActionKey(r: { action: RoundAction; compensation: Compensation }): string {
  return r.action === "accept_asked" && !r.compensation.money ? "action.accept_as_is" : `action.${r.action}`;
}

/** "Aceitar como está" (accept_asked): a cota precisa de contrapartidas e, quando pede dinheiro, do valor pedido. */
export function canAcceptAsked(t: { askCents: number | null; perks: readonly string[]; compensation: Compensation }): boolean {
  return t.perks.length > 0 && (!t.compensation.money || t.askCents !== null);
}

/** A cota pede dinheiro e ainda não tem valor ("a combinar")? Cota sem dinheiro nunca está sem valor. */
export function tierMissingPrice(t: { compensation: Compensation; hasPrice: boolean }): boolean {
  return t.compensation.money && !t.hasPrice;
}

export type TiersPaySummary = {
  full: boolean;
  /** menor valor entre as cotas com vaga que pedem dinheiro; from = há mais de uma cota com dinheiro */
  price: { cents: number; from: boolean } | null;
  /** só dinheiro ainda sem valor (ou nenhuma cota): "Valor a combinar" */
  toCombine: boolean;
  /** formas sem dinheiro presentes nas cotas com vaga, na ordem de leitura */
  kinds: ("barter" | "performance")[];
};

/** Resumo da lista da marca: menor valor pedido, "a combinar" e as formas sem dinheiro (permuta, performance). */
export function tiersPaySummary(tiers: readonly { full: boolean; priceCents: number | null; compensation: Compensation }[]): TiersPaySummary {
  const open = tiers.filter((z) => !z.full);
  if (tiers.length > 0 && open.length === 0) return { full: true, price: null, toCombine: false, kinds: [] };
  const cash = open.filter((z) => z.compensation.money);
  const priced = cash.filter((z) => z.priceCents !== null).map((z) => z.priceCents as number);
  const kinds = (["barter", "performance"] as const).filter((k) => open.some((z) => z.compensation[k] !== null));
  return {
    full: false,
    price: priced.length > 0 ? { cents: Math.min(...priced), from: cash.length > 1 } : null,
    toCombine: priced.length === 0 && (cash.length > 0 || open.length === 0),
    kinds: [...kinds],
  };
}

/**
 * Leitura de um rascunho sem os números (o gestor vê a forma da cota, mas o servidor não manda valores, % nem
 * estimativas): tipo, o que é oferecido em permuta e como a performance é medida.
 */
export function compensationPreview(d: CompensationDraft): Compensation {
  return {
    money: d.money || (!d.barter && !d.performance),
    barter: d.barter ? { offer: d.barterOffer.trim(), valueCents: null } : null,
    performance: d.performance ? { kind: d.perfKind, rate: 0, measure: d.perfMeasure.trim(), estimateCents: null } : null,
  };
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
// 0108: modelo de valor da cota, como na área das marcas — "fixo" = valor total da cota no evento (as marcas que
// entram completam, até "slots"); "por_marca" = valor por marca × quantidade de marcas (o padrão, comportamento antigo).
export const TIER_MODELS = ["fixo", "por_marca"] as const;
export type TierModel = (typeof TIER_MODELS)[number];
/** 0140: compensation = como a marca paga esta cota (por marca): Valor (priceText), Permuta, Performance. Só o Adm edita. */
export type TierDraft = { id: string | null; name: string; priceText: string; perksText: string; slots: number; valueModel: TierModel; compensation: CompensationDraft };

/** Cota nova do formulário: só valor, por marca, uma marca. */
export function newTierDraft(name = ""): TierDraft {
  return { id: null, name, priceText: "", perksText: "", slots: 1, valueModel: "por_marca", compensation: draftFrom(MONEY_ONLY, centsToBrl) };
}

/** Total da cota: fixo = o próprio valor; por marca = valor × quantidade de marcas (teto). */
export function tierTotalCents(t: { valueModel: TierModel; priceCents: number | null; slots: number }): number | null {
  if (t.priceCents === null) return null;
  return t.valueModel === "fixo" ? t.priceCents : t.priceCents * Math.max(1, t.slots);
}

/** Quanto cada marca paga a partir de: por marca = o valor; fixo = (total − coberto) ÷ vagas que sobram, arredondado
 *  para cima (mesma conta de public.sponsorship_tier_ask). null = a combinar ou já coberto. */
export function tierShareCents(t: { valueModel: TierModel; priceCents: number | null; slots: number }, coveredCents = 0, agreedCount = 0): number | null {
  if (t.priceCents === null) return null;
  if (t.valueModel === "por_marca") return t.priceCents;
  const remaining = t.priceCents - coveredCents;
  if (remaining < 1) return null;
  const left = Math.max(1, t.slots - agreedCount);
  return Math.ceil(remaining / left);
}

export const tierSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(1).max(MAX_AMOUNT_CENTS).nullable(),
  perks: z.array(z.string()).max(MAX_PERKS),
  slots: z.number().int().min(1).max(MAX_TIER_SLOTS),
  // sem o campo (formato antigo) = por marca, o comportamento de antes
  valueModel: z.enum(TIER_MODELS).default("por_marca"),
  // 0140: forma de pagamento da cota (formato do banco). null = não mexe: o gestor não envia (o banco ignora a dele)
  compensation: compensationDbSchema.nullable().default(null),
});
export type TierInput = z.infer<typeof tierSchema>;

export type TierError = "name" | "nameRepeated" | "price" | "perks" | "slots" | "compensation";
export type TierCheck = { ok: true; tiers: TierInput[] } | { ok: false; index: number; error: TierError | "count"; reason?: CompensationError };

/**
 * Confere as cotas digitadas. parsePrice converte o texto em centavos (null = vazio, undefined = inválido);
 * canValues=false (gestor) ignora o valor e a forma de pagamento. Devolve as cotas prontas ou o primeiro erro (com o
 * índice; na forma de pagamento, o motivo em `reason`). 0140: cota sem dinheiro não tem valor pedido.
 */
export function validateTiers(
  drafts: readonly TierDraft[],
  parsePrice: (text: string) => number | null | undefined,
  parsePerks: (text: string) => string[],
  canValues: boolean,
): TierCheck {
  if (drafts.length < 1 || drafts.length > MAX_TIERS) return { ok: false, index: -1, error: "count" };
  const names = new Set<string>();
  const tiers: TierInput[] = [];
  for (const [index, d] of drafts.entries()) {
    const name = d.name.replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 40) return { ok: false, index, error: "name" };
    if (names.has(name.toLowerCase())) return { ok: false, index, error: "nameRepeated" };
    names.add(name.toLowerCase());
    let priceCents: number | null = null;
    let compensation: CompensationDb | null = null;
    if (canValues) {
      const comp = draftToCompensation(d.compensation, (text) => parsePrice(text) ?? null);
      if (!comp.ok) return { ok: false, index, error: "compensation", reason: comp.error };
      compensation = toDb(comp.value);
      if (comp.value.money) {
        const parsed = parsePrice(d.priceText);
        if (parsed === undefined || (parsed !== null && !amountValid(parsed))) return { ok: false, index, error: "price" };
        priceCents = parsed;
      }
    }
    const perks = parsePerks(d.perksText);
    if (!perksValid(perks)) return { ok: false, index, error: "perks" };
    if (!Number.isInteger(d.slots) || d.slots < 1 || d.slots > MAX_TIER_SLOTS) return { ok: false, index, error: "slots" };
    tiers.push({ id: d.id, name, priceCents, perks, slots: d.slots, valueModel: d.valueModel, compensation });
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
