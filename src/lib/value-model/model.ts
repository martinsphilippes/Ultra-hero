// Modelo de valor do valor oferecido (0096): "fixo" = valor TOTAL do evento/campanha, dividido entre os Heros
// indicados; "por_heroi" = valor POR HERO com um MÁXIMO de Heros obrigatório, que limita o investimento
// (teto = valor × máximo). Lógica pura, sem tela nem banco; o banco confere de novo (value_terms_check).

export const VALUE_MODELS = ["fixo", "por_heroi"] as const;
export type ValueModel = (typeof VALUE_MODELS)[number];

export const MAX_HEROES_LIMIT = 50;
const MAX_CENTS = 10_000_000_000;

export type ValueTerms = { model: ValueModel; amountCents: number | null; maxHeroes: number | null };

export type ValueTermsError = "invalid_input" | "value_per_hero_required" | "max_heroes_required";

export function isValueModel(x: unknown): x is ValueModel {
  return x === "fixo" || x === "por_heroi";
}

/** Valores do banco/forma → termos coerentes (fixo nunca guarda máximo). */
export function normalizeTerms(model: unknown, amountCents: number | null | undefined, maxHeroes: number | null | undefined): ValueTerms {
  const m: ValueModel = isValueModel(model) ? model : "fixo";
  return { model: m, amountCents: amountCents ?? null, maxHeroes: m === "por_heroi" ? (maxHeroes ?? null) : null };
}

/**
 * Regras do banco: por Hero exige valor por Hero > 0 e máximo de 1 a 50; fixo aceita valor vazio (opcional) e
 * nunca leva máximo. `requireAmount` vale para fixo quando o valor é obrigatório (contraproposta, proposta enviada).
 */
export function validateTerms(t: ValueTerms, opts: { requireAmount?: boolean } = {}): ValueTermsError | null {
  if (t.amountCents !== null && (!Number.isInteger(t.amountCents) || t.amountCents < 0 || t.amountCents > MAX_CENTS)) return "invalid_input";
  if (t.model === "por_heroi") {
    if (t.amountCents === null || t.amountCents < 1) return "value_per_hero_required";
    if (t.maxHeroes === null || !Number.isInteger(t.maxHeroes) || t.maxHeroes < 1 || t.maxHeroes > MAX_HEROES_LIMIT) return "max_heroes_required";
    if (t.amountCents * t.maxHeroes > MAX_CENTS) return "invalid_input";
    return null;
  }
  if (opts.requireAmount && (t.amountCents === null || t.amountCents < 1)) return "invalid_input";
  return null;
}

/** Teto de investimento: por Hero = valor × máximo; fixo = o próprio valor. Sem valor, sem teto. */
export function ceilingCents(t: ValueTerms): number | null {
  if (t.amountCents === null) return null;
  if (t.model === "por_heroi") return t.maxHeroes === null ? null : t.amountCents * t.maxHeroes;
  return t.amountCents;
}

/** Quantos Heros ainda cabem (por Hero); fixo não limita (null). */
export function slotsLeft(t: ValueTerms, used: number): number | null {
  if (t.model !== "por_heroi" || t.maxHeroes === null) return null;
  return Math.max(0, t.maxHeroes - used);
}

/** Orçamento de cachês: o valor total não inclui a comissão da agência (V = F + C), então F = V ÷ (1 + taxa). */
export function feeBudgetCents(totalCents: number, rateBp: number): number {
  if (totalCents <= 0) return 0;
  return Math.floor((totalCents * 10_000) / (10_000 + Math.max(0, rateBp)));
}

/** Divide um total em partes proporcionais aos pesos, somando EXATAMENTE o total (maior resto). Sem peso, divide igual. */
export function splitProportional(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = Math.max(0, Math.trunc(total));
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  const w = sum > 0 ? weights.map((x) => Math.max(0, x)) : weights.map(() => 1);
  const denom = sum > 0 ? sum : n;
  const raw = w.map((x) => (t * x) / denom);
  const base = raw.map((x) => Math.floor(x));
  let rest = t - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) base[order[k].i] += 1;
  return base;
}

export const splitEvenly = (total: number, n: number): number[] => splitProportional(total, Array.from({ length: n }, () => 1));

/** Texto "Valor total" / "Valor por Hero": a chave de tradução do rótulo do campo. */
export const valueLabelKey = (model: ValueModel): "total" | "perHero" => (model === "por_heroi" ? "perHero" : "total");
