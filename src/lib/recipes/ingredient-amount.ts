// Quantidade do ingrediente conforme a unidade escolhida: o que a caixa aceita, o teclado e a dica.
// O valor continua sendo o texto lido por parseQuantity/amountFields (sem mudança no banco).
import { METRIC_UNITS, type RecipeUnit } from "./codes";
import { formatAmount, parseQuantity } from "./quantity";

/** decimal: g, kg, mg, ml, L ("200", "1,5"); fraction: xícara, colher, unidade… ("2", "1/2", "1 1/2"); free: sem unidade. */
export type AmountKind = "decimal" | "fraction" | "free";

export function amountKind(unit: RecipeUnit | ""): AmountKind {
  if (unit === "") return "free";
  return METRIC_UNITS.includes(unit) ? "decimal" : "fraction";
}

/** Limpa o que foi digitado conforme o tipo. Sem unidade, nada muda (aceita texto livre). */
export function sanitizeAmount(raw: string, unit: RecipeUnit | ""): string {
  const kind = amountKind(unit);
  if (kind === "free") return raw;
  if (kind === "decimal") {
    const cleaned = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
    const at = cleaned.indexOf(",");
    const int = (at < 0 ? cleaned : cleaned.slice(0, at)).replace(/^0+(?=\d)/, "").slice(0, 5);
    if (at < 0) return int;
    return `${int || "0"},${cleaned.slice(at + 1).replace(/,/g, "").slice(0, 2)}`;
  }
  // fração: dígitos, um espaço (número misto), uma barra e vírgula
  let s = raw.replace(/\./g, ",").replace(/[^\d ,/]/g, "").replace(/\s+/g, " ").replace(/^ /, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash + 1) + s.slice(slash + 1).replace(/[/ ,]/g, "");
  const space = s.indexOf(" ");
  if (space >= 0) s = s.slice(0, space + 1) + s.slice(space + 1).replace(/ /g, "");
  return s.slice(0, 8);
}

/** Troca de unidade: converte o número para o formato do novo tipo (0,5 xícara → 1/2; 1/2 kg → 0,5). */
export function convertAmount(amount: string, unit: RecipeUnit | ""): string {
  if (unit === "") return amount;
  const parsed = parseQuantity(amount);
  if (parsed.kind === "numeric") return sanitizeAmount(formatAmount(parsed.quantity, unit), unit);
  return sanitizeAmount(amount, unit);
}

/** Parte inteira já digitada ("2 1/2" → "2", "1/2" → "", "3" → "3"). */
function wholePart(amount: string): string {
  const m = /^(\d+)(?:[ ,]|$)/.exec(amount.trim());
  return m && !amount.trim().startsWith(`${m[1]}/`) ? m[1] : "";
}

/** Toque num atalho de fração: mantém o inteiro e troca a fração ("2" + ½ → "2 1/2"). */
export function applyFraction(amount: string, fraction: string): string {
  const whole = wholePart(amount);
  return whole && whole !== "0" ? `${whole} ${fraction}` : fraction;
}

export const FRACTION_SHORTCUTS = [
  { value: "1/4", glyph: "¼" },
  { value: "1/3", glyph: "⅓" },
  { value: "1/2", glyph: "½" },
  { value: "3/4", glyph: "¾" },
] as const;
