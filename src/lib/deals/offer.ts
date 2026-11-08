// Negociação da proposta da marca no negócio (0106): rodadas de aceite/contraproposta/recusa entre a agência (Adm) e
// a marca (dono). Lógica pura, espelho de public.deal_offer_state / deal_offer_brand_terms; o banco confere tudo de novo.
// 0140: cada termo traz a forma de pagamento (valor, permuta e/ou performance); sem dinheiro, não há valor.
import { parseCompensation, type Compensation, type CompensationDb } from "@/lib/compensation/model";
import { isValueModel, validateTerms, type ValueModel, type ValueTermsError } from "@/lib/value-model/model";

export type OfferSide = "agency" | "brand";
export type OfferAction = "accept" | "counter" | "decline";

export type OfferTerms = {
  amountCents: number | null;
  valueModel: ValueModel;
  maxHeroes: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** 0140: forma de pagamento; sem permissão para valores (gestor, equipe), chega sem os números. */
  compensation: Compensation;
};

export type OfferRound = OfferTerms & {
  id: string;
  seq: number;
  side: OfferSide;
  action: OfferAction;
  note: string;
  actorLabel: string;
  createdAt: string;
};

export type OfferView = {
  enabled: boolean;
  viewer: OfferSide;
  /** lê valores e notas (Adm da agência, marca) */
  values: boolean;
  /** negócio aberto e antes da confirmação */
  open: boolean;
  canReply: boolean;
  role: string | null;
  turn: OfferSide | null;
  agreed: boolean;
  brandTerms: (OfferTerms & { source: "counter" | "request" }) | null;
  agreedTerms: (OfferTerms & { side: OfferSide }) | null;
  rounds: OfferRound[];
};

/** Vez de quem e se já há acordo: sem rodadas → agência; contraproposta da agência → marca; resposta da marca → agência. */
export function offerState(rounds: Pick<OfferRound, "seq" | "side" | "action">[]): { turn: OfferSide | null; agreed: boolean } {
  const last = [...rounds].sort((a, b) => b.seq - a.seq)[0];
  if (!last) return { turn: "agency", agreed: false };
  if (last.action === "accept") return { turn: null, agreed: true };
  return { turn: last.side === "agency" ? "brand" : "agency", agreed: false };
}

export type OfferStatus = "agreed" | "closed" | "brand_proposal" | "brand_countered" | "brand_declined" | "agency_countered";

/** Linha de situação (mesma para as duas telas; cada portal escreve do seu jeito). */
export function offerStatus(view: Pick<OfferView, "open" | "rounds">): OfferStatus {
  const { turn, agreed } = offerState(view.rounds);
  if (agreed) return "agreed";
  if (!view.open || turn === null) return "closed";
  if (turn === "brand") return "agency_countered";
  const last = [...view.rounds].sort((a, b) => b.seq - a.seq)[0];
  if (!last) return "brand_proposal";
  return last.action === "decline" ? "brand_declined" : "brand_countered";
}

/** Termos na mesa: o acordo; na vez da marca, a última contraproposta da agência; na vez da agência, os da marca. */
export function termsOnTable(view: Pick<OfferView, "agreed" | "turn" | "rounds" | "brandTerms" | "agreedTerms">): OfferTerms | null {
  if (view.agreed) return view.agreedTerms;
  if (view.turn === "brand") return [...view.rounds].sort((a, b) => b.seq - a.seq).find((r) => r.side === "agency" && r.action === "counter") ?? null;
  return view.brandTerms ?? view.agreedTerms;
}

/**
 * Pode aceitar? A marca aceita a contraproposta da agência. A agência só aceita termos da marca com valor ou, desde a
 * 0140, sem dinheiro nenhum (só permuta/performance); com "Valor" marcado e sem valor, contrapropõe (espelho de
 * agency_deal_offer_reply).
 */
export function canAcceptOffer(portal: OfferSide, brandTerms: OfferTerms | null): boolean {
  if (portal === "brand") return true;
  if (!brandTerms) return false;
  return !brandTerms.compensation.money || (brandTerms.amountCents ?? 0) > 0;
}

/** Resposta da tela (já conferida pelo zod da ação): termos da contraproposta e a forma de pagamento no formato do banco. */
export type OfferReplyInput = {
  dealId: string;
  action: OfferAction;
  amountCents: number | null;
  valueModel: ValueModel;
  maxHeroes: number | null;
  /** "" = mantém o período da campanha */
  periodStart: string;
  periodEnd: string;
  note: string;
  /** 0140: obrigatória na contraproposta (sem ela o banco entenderia "só valor"); aceite e recusa não usam. */
  compensation: CompensationDb | null;
};

export type OfferReplyArgs = {
  p_deal: string;
  p_action: OfferAction;
  p_amount_cents: number | null;
  p_value_model: ValueModel | null;
  p_max_heroes: number | null;
  p_period_start: string | null;
  p_period_end: string | null;
  p_note: string | null;
  p_compensation: CompensationDb | null;
};

export type OfferReplyError = ValueTermsError | "invalid_compensation";

/**
 * Resposta → argumentos de agency_deal_offer_reply / brand_deal_offer_reply. Contraproposta: a forma de pagamento vai
 * SEMPRE; com "Valor" marcado, o valor é obrigatório (e por Hero, o máximo); sem dinheiro, vai sem valor, no modelo fixo
 * e sem máximo (o banco faz o mesmo). Aceite e recusa não levam termos.
 */
export function offerReplyArgs(d: OfferReplyInput): { ok: true; args: OfferReplyArgs } | { ok: false; error: OfferReplyError } {
  const counter = d.action === "counter";
  let money = false;
  if (counter) {
    if (!d.compensation) return { ok: false, error: "invalid_compensation" };
    money = d.compensation.money;
    if (money) {
      const problem = validateTerms({ model: d.valueModel, amountCents: d.amountCents, maxHeroes: d.valueModel === "por_heroi" ? d.maxHeroes : null }, { requireAmount: true });
      if (problem) return { ok: false, error: problem };
    }
    if (d.periodEnd && (!d.periodStart || d.periodEnd < d.periodStart)) return { ok: false, error: "invalid_input" };
  }
  return {
    ok: true,
    args: {
      p_deal: d.dealId,
      p_action: d.action,
      p_amount_cents: money ? d.amountCents : null,
      p_value_model: counter ? (money ? d.valueModel : "fixo") : null,
      p_max_heroes: money && d.valueModel === "por_heroi" ? d.maxHeroes : null,
      p_period_start: counter && d.periodStart ? d.periodStart : null,
      p_period_end: counter && d.periodStart ? d.periodEnd || d.periodStart : null,
      p_note: d.note || null,
      p_compensation: counter ? d.compensation : null,
    },
  };
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const side = (v: unknown): OfferSide | null => (v === "agency" || v === "brand" ? v : null);

function toTerms(r: Record<string, unknown>): OfferTerms {
  const model: ValueModel = isValueModel(r.value_model) ? r.value_model : "fixo";
  return {
    amountCents: num(r.amount_cents),
    valueModel: model,
    maxHeroes: model === "por_heroi" ? num(r.max_heroes) : null,
    periodStart: str(r.period_start),
    periodEnd: str(r.period_end),
    // rodadas e propostas de antes da 0140 (sem a chave) são "só valor"
    compensation: parseCompensation(r.compensation),
  };
}

/** JSON de public.deal_offer_rounds_json → visão da tela (tolerante a campos ausentes). */
export function toOfferView(raw: unknown): OfferView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const viewer = side(r.viewer);
  if (!viewer) return null;
  const rounds: OfferRound[] = Array.isArray(r.rounds)
    ? (r.rounds as Record<string, unknown>[])
        .map((x) => {
          const action: OfferAction = x.action === "accept" || x.action === "decline" ? x.action : "counter";
          return { ...toTerms(x), id: String(x.id ?? ""), seq: Number(x.seq) || 0, side: side(x.side) ?? "agency", action, note: String(x.note ?? ""), actorLabel: String(x.actor_label ?? ""), createdAt: String(x.created_at ?? "") };
        })
        .sort((a, b) => a.seq - b.seq)
    : [];
  const bt = r.brand_terms && typeof r.brand_terms === "object" ? (r.brand_terms as Record<string, unknown>) : null;
  const at = r.agreed_terms && typeof r.agreed_terms === "object" ? (r.agreed_terms as Record<string, unknown>) : null;
  return {
    enabled: r.enabled === true,
    viewer,
    values: r.values === true,
    open: r.open === true,
    canReply: r.can_reply === true,
    role: str(r.role),
    turn: side(r.turn),
    agreed: r.agreed === true,
    brandTerms: bt ? { ...toTerms(bt), source: bt.source === "counter" ? "counter" : "request" } : null,
    agreedTerms: at ? { ...toTerms(at), side: side(at.side) ?? "agency" } : null,
    rounds,
  };
}
