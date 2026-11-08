// Forma de pagamento (0140, pedido de 08/11/2026): todo negócio ou oportunidade pode ser pago em Valor (dinheiro),
// Permuta e/ou Performance — combináveis (ex.: R$ 5.000 + kit de produtos; valor fixo + 10% das vendas).
//   • Valor: o dinheiro continua nos campos de sempre (valor oferecido, verba, cota, cachê); aqui só a marcação.
//   • Permuta: o que oferece (obrigatório) e o valor estimado total em R$ (opcional: nota fiscal e Projeção).
//   • Performance: a regra (% sobre vendas, R$ por venda ou R$ por cadastro), como mede (cupom, link) e uma
//     estimativa total em R$ (opcional).
// Lógica pura, sem tela nem banco; o banco confere de novo (compensation_valid).

export const PERF_KINDS = ["percent", "per_sale", "per_lead"] as const;
export type PerfKind = (typeof PERF_KINDS)[number];
export const COMP_KINDS = ["money", "barter", "performance"] as const;
export type CompKind = (typeof COMP_KINDS)[number];

export type Barter = { offer: string; valueCents: number | null };
/** `rate` = 0 quando o servidor escondeu o número (quem não lê valores): a regra e o como mede continuam visíveis. */
export type Performance = { kind: PerfKind; rate: number; measure: string; estimateCents: number | null };
export type Compensation = { money: boolean; barter: Barter | null; performance: Performance | null };

/** Formato gravado no banco (jsonb). */
export type CompensationDb = {
  money: boolean;
  barter: { offer: string; value_cents: number | null } | null;
  performance: { kind: PerfKind; rate: number; measure: string; estimate_cents: number | null } | null;
};

export const MONEY_ONLY: Compensation = { money: true, barter: null, performance: null };
export const OFFER_MIN = 3;
export const OFFER_MAX = 300;
export const MEASURE_MIN = 2;
export const MEASURE_MAX = 200;
export const MAX_CENTS = 10_000_000_000;

export type CompensationError =
  | "none_selected"
  | "barter_offer"
  | "barter_value"
  | "perf_rate"
  | "perf_measure"
  | "perf_estimate";

const isPerfKind = (x: unknown): x is PerfKind => typeof x === "string" && (PERF_KINDS as readonly string[]).includes(x);
const centsOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_CENTS ? v : null);

/** jsonb do banco → forma de pagamento; ausente ou estranho vira "só valor" (o padrão de tudo que já existia). */
export function parseCompensation(v: unknown): Compensation {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...MONEY_ONLY };
  const r = v as Record<string, unknown>;
  const b = r.barter && typeof r.barter === "object" && !Array.isArray(r.barter) ? (r.barter as Record<string, unknown>) : null;
  const p = r.performance && typeof r.performance === "object" && !Array.isArray(r.performance) ? (r.performance as Record<string, unknown>) : null;
  const barter: Barter | null = b && typeof b.offer === "string" && b.offer.trim() ? { offer: b.offer.trim(), valueCents: centsOrNull(b.value_cents) } : null;
  // sem o número (compensation_public), a performance continua: só a taxa fica 0 (desconhecida)
  const rate = typeof p?.rate === "number" && Number.isFinite(p.rate) && p.rate > 0 ? p.rate : 0;
  const performance: Performance | null =
    p && isPerfKind(p.kind) && (rate > 0 || p.rate === null || p.rate === undefined)
      ? { kind: p.kind, rate, measure: typeof p.measure === "string" ? p.measure.trim() : "", estimateCents: centsOrNull(p.estimate_cents) }
      : null;
  const money = typeof r.money === "boolean" ? r.money : true;
  if (!money && !barter && !performance) return { ...MONEY_ONLY };
  return { money, barter, performance };
}

export function toDb(c: Compensation): CompensationDb {
  return {
    money: c.money,
    barter: c.barter ? { offer: c.barter.offer.trim(), value_cents: c.barter.valueCents } : null,
    performance: c.performance
      ? { kind: c.performance.kind, rate: c.performance.rate, measure: c.performance.measure.trim(), estimate_cents: c.performance.estimateCents }
      : null,
  };
}

/** Regras do banco (compensation_valid), para avisar antes de enviar. */
export function validateCompensation(c: Compensation): CompensationError | null {
  if (!c.money && !c.barter && !c.performance) return "none_selected";
  if (c.barter) {
    const o = c.barter.offer.trim();
    if (o.length < OFFER_MIN || o.length > OFFER_MAX) return "barter_offer";
    if (c.barter.valueCents !== null && (!Number.isInteger(c.barter.valueCents) || c.barter.valueCents < 1 || c.barter.valueCents > MAX_CENTS)) return "barter_value";
  }
  if (c.performance) {
    const { kind, rate } = c.performance;
    if (kind === "percent") {
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100 || Math.abs(Math.round(rate * 100) - rate * 100) > 1e-9) return "perf_rate";
    } else if (!Number.isInteger(rate) || rate < 1 || rate > MAX_CENTS) return "perf_rate";
    const m = c.performance.measure.trim();
    if (m.length < MEASURE_MIN || m.length > MEASURE_MAX) return "perf_measure";
    const e = c.performance.estimateCents;
    if (e !== null && (!Number.isInteger(e) || e < 1 || e > MAX_CENTS)) return "perf_estimate";
  }
  return null;
}

/** Quais formas estão marcadas, na ordem de leitura (Valor, Permuta, Performance). */
export function compensationKinds(c: Compensation): CompKind[] {
  return COMP_KINDS.filter((k) => (k === "money" ? c.money : k === "barter" ? c.barter !== null : c.performance !== null));
}

/** Só dinheiro (o caso de sempre): as telas antigas não precisam mostrar nada a mais. */
export function isMoneyOnly(c: Compensation): boolean {
  return c.money && !c.barter && !c.performance;
}

// ---------------------------------------------------------------- rascunho do formulário (textos digitados)

export type CompensationDraft = {
  money: boolean;
  barter: boolean;
  barterOffer: string;
  barterValueText: string;
  performance: boolean;
  perfKind: PerfKind;
  /** % (ex.: "10" ou "7,5") quando a regra é percentual; R$ (máscara) por venda/cadastro. */
  perfRateText: string;
  perfMeasure: string;
  perfEstimateText: string;
};

export function draftFrom(c: Compensation, centsToText: (cents: number | null) => string): CompensationDraft {
  const p = c.performance;
  return {
    money: c.money,
    barter: c.barter !== null,
    barterOffer: c.barter?.offer ?? "",
    barterValueText: centsToText(c.barter?.valueCents ?? null),
    performance: p !== null,
    perfKind: p?.kind ?? "percent",
    perfRateText: p ? (p.kind === "percent" ? String(p.rate).replace(".", ",") : centsToText(p.rate)) : "",
    perfMeasure: p?.measure ?? "",
    perfEstimateText: centsToText(p?.estimateCents ?? null),
  };
}

/** "10", "7,5", "12.25" → número; vazio ou inválido → NaN. */
export function parsePercent(text: string): number {
  const s = text.trim().replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Number(s);
}

/** Rascunho → forma de pagamento validada. `textToCents` lê a máscara de R$ (brlToCents). */
export function draftToCompensation(
  d: CompensationDraft,
  textToCents: (text: string) => number | null,
): { ok: true; value: Compensation } | { ok: false; error: CompensationError } {
  let barter: Barter | null = null;
  if (d.barter) {
    const valueText = d.barterValueText.trim();
    const valueCents = valueText ? textToCents(valueText) : null;
    if (valueText && (valueCents === null || valueCents < 1)) return { ok: false, error: "barter_value" };
    barter = { offer: d.barterOffer.trim(), valueCents };
  }
  let performance: Performance | null = null;
  if (d.performance) {
    const rate = d.perfKind === "percent" ? parsePercent(d.perfRateText) : (textToCents(d.perfRateText) ?? Number.NaN);
    const estText = d.perfEstimateText.trim();
    const estimateCents = estText ? textToCents(estText) : null;
    if (estText && (estimateCents === null || estimateCents < 1)) return { ok: false, error: "perf_estimate" };
    performance = { kind: d.perfKind, rate, measure: d.perfMeasure.trim(), estimateCents };
  }
  const value: Compensation = { money: d.money, barter, performance };
  const error = validateCompensation(value);
  return error ? { ok: false, error } : { ok: true, value };
}

/** Mesma forma sem os números (quem não lê valores: gestor, equipe, Hero) — espelho de compensation_public do banco. */
export function withoutNumbers(c: Compensation): Compensation {
  return {
    money: c.money,
    barter: c.barter ? { offer: c.barter.offer, valueCents: null } : null,
    performance: c.performance ? { ...c.performance, rate: 0, estimateCents: null } : null,
  };
}

/** Soma estimada de permuta e de performance (Projeção, resumos); valores ausentes contam zero. */
export function estimateParts(c: Compensation): { barter: number; performance: number } {
  return { barter: c.barter?.valueCents ?? 0, performance: c.performance?.estimateCents ?? 0 };
}
