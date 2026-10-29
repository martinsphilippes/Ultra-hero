// Rendimento estruturado: número + tipo (un, kg, forma…), guardado como texto em
// recipe_details.yield_text ("12 unidades", "1,5 kg"). Sem migração: texto antigo que não segue
// o formato abre como "Outro" e continua igual.

export const YIELD_UNITS = ["unit", "kg", "g", "l", "ml", "pan", "tray", "slice", "piece", "jar"] as const;
export type YieldUnit = (typeof YIELD_UNITS)[number];
export type YieldChoice = YieldUnit | "other";

type Rule = { kind: "integer" | "decimal"; maxInt: number };
/** Contagens e g/ml só inteiros; kg e L aceitam até 2 casas decimais. */
export const YIELD_RULES: Record<YieldUnit, Rule> = {
  unit: { kind: "integer", maxInt: 3 },
  pan: { kind: "integer", maxInt: 3 },
  tray: { kind: "integer", maxInt: 3 },
  slice: { kind: "integer", maxInt: 3 },
  piece: { kind: "integer", maxInt: 3 },
  jar: { kind: "integer", maxInt: 3 },
  g: { kind: "integer", maxInt: 5 },
  ml: { kind: "integer", maxInt: 5 },
  kg: { kind: "decimal", maxInt: 2 },
  l: { kind: "decimal", maxInt: 2 },
};

export type YieldValue = { unit: YieldChoice; amount: string; other: string };

/** Rótulo da unidade para uma quantidade (singular/plural no idioma da tela). */
export type YieldLabel = (unit: YieldUnit, count: number) => string;

export const EMPTY_YIELD: YieldValue = { unit: "unit", amount: "", other: "" };

/** Limpa o que foi digitado conforme o tipo: inteiro só dígitos; decimal aceita uma vírgula e 2 casas. */
export function sanitizeYieldAmount(raw: string, unit: YieldUnit, decimalSep = ","): string {
  const rule = YIELD_RULES[unit];
  if (rule.kind === "integer") {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    return digits.slice(0, rule.maxInt);
  }
  const cleaned = raw.replace(/[^\d.,]/g, "");
  const sepAt = cleaned.search(/[.,]/);
  let int = (sepAt < 0 ? cleaned : cleaned.slice(0, sepAt)).replace(/^0+(?=\d)/, "").slice(0, rule.maxInt);
  if (sepAt < 0) return int;
  const dec = cleaned.slice(sepAt + 1).replace(/[.,]/g, "").slice(0, 2);
  if (int === "") int = "0";
  return `${int}${decimalSep}${dec}`;
}

/** Troca de tipo: decimal → inteiro arredonda ("1,5 kg" → "2 formas"), não junta os dígitos. */
export function convertYieldAmount(amount: string, unit: YieldUnit, decimalSep = ","): string {
  const n = yieldAmountNumber(amount);
  if (YIELD_RULES[unit].kind === "integer" && n !== null) return sanitizeYieldAmount(String(Math.round(n)), unit, decimalSep);
  return sanitizeYieldAmount(amount, unit, decimalSep);
}

/** "1,5" ou "1.5" → 1.5; vazio ou zero → null. */
export function yieldAmountNumber(amount: string): number | null {
  if (!amount.trim()) return null;
  const n = Number(amount.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatAmount(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(n);
}

/** Valor do formulário → texto salvo. Sem número (ou "Outro" vazio) → "". */
export function composeYield(v: YieldValue, label: YieldLabel, locale: string): string {
  if (v.unit === "other") return v.other.trim().slice(0, 60);
  const n = yieldAmountNumber(v.amount);
  if (n === null) return "";
  // kg/L e afins não mudam no plural; contagens seguem a quantidade (1 forma, 2 formas)
  return `${formatAmount(n, locale)} ${label(v.unit, n === 1 ? 1 : 2)}`.slice(0, 60);
}

/** Texto salvo → valor do formulário. Reconhece "12 unidades", "1,5 kg", "1 forma"; o resto vira "Outro". */
export function parseYield(text: string | null | undefined, label: YieldLabel, decimalSep = ","): YieldValue {
  const raw = (text ?? "").trim();
  if (!raw) return { ...EMPTY_YIELD };
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.+)$/);
  if (m) {
    const word = m[2].trim().toLocaleLowerCase();
    for (const unit of YIELD_UNITS) {
      if (word === label(unit, 1).toLocaleLowerCase() || word === label(unit, 2).toLocaleLowerCase()) {
        const amount = sanitizeYieldAmount(m[1], unit, decimalSep);
        // número fora do tipo (ex.: "1,5 formas") não se perde: fica como texto livre
        if (Number(amount.replace(",", ".")) === Number(m[1].replace(",", "."))) {
          return { unit, amount, other: "" };
        }
      }
    }
  }
  return { unit: "other", amount: "", other: raw };
}
