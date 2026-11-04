// Negociação da proposta da marca no negócio (0106): rodadas de aceite/contraproposta/recusa entre a agência (Adm) e
// a marca (dono). Lógica pura, espelho de public.deal_offer_state / deal_offer_brand_terms; o banco confere tudo de novo.
import { isValueModel, type ValueModel } from "@/lib/value-model/model";

export type OfferSide = "agency" | "brand";
export type OfferAction = "accept" | "counter" | "decline";

export type OfferTerms = {
  amountCents: number | null;
  valueModel: ValueModel;
  maxHeroes: number | null;
  periodStart: string | null;
  periodEnd: string | null;
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

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const side = (v: unknown): OfferSide | null => (v === "agency" || v === "brand" ? v : null);

function toTerms(r: Record<string, unknown>): OfferTerms {
  const model: ValueModel = isValueModel(r.value_model) ? r.value_model : "fixo";
  return { amountCents: num(r.amount_cents), valueModel: model, maxHeroes: model === "por_heroi" ? num(r.max_heroes) : null, periodStart: str(r.period_start), periodEnd: str(r.period_end) };
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
