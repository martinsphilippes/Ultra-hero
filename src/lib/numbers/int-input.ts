// Máscara de contagens inteiras (seguidores, alcance, visualizações, curtidas, cliques, quantidade de
// vendas) para campos de digitação: lógica pura, sem React.
//
// Decisões (pedido do responsável: "10000" digitado vira "10.000" enquanto digita):
// - Só dígitos; ponto de milhar no padrão pt-BR. Sem negativos, sem decimais (percentuais e valores
//   decimais continuam em campos próprios; dinheiro usa MoneyInput / brl-input.ts).
// - Colar "10.000", "10000", "10 000" ou "1,234,567" dá o mesmo número. Colar "10.000,50" fica com a
//   parte inteira (a vírgula é decimal em pt-BR).
// - O texto produzido ("10.000") é aceito por parseIntText e pelos parsers que já tiravam pontos
//   (parseCount do media kit, parseMetricInput das métricas).
// Reaproveita a lógica de cursor estável de brl-input.ts (dígitos à esquerda do cursor).

export { caretForSignificant, significantBefore } from "@/lib/money/brl-input";

/** Mais dígitos aceitos por padrão (999.999.999.999). Limites de negócio ficam em `max`. */
export const INT_MAX_DIGITS = 12;

export function groupInt(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Dígitos de um texto livre; "10.000,50" → "10000" (vírgula decimal em pt-BR descarta o resto). */
function digitsOf(raw: string, pasted: boolean): string {
  let s = raw;
  // "1.234,5" colado: vírgula seguida de 1–2 dígitos no fim é decimal; "1,234,567" (inglês) é milhar
  if (pasted && /,\d{1,2}$/.test(s)) s = s.slice(0, s.lastIndexOf(","));
  // "8000.5" / "29.90" (número com ponto decimal vindo do servidor ou colado): fica a parte inteira
  if (pasted && /^\d+\.\d{1,2}$/.test(s.trim())) s = s.slice(0, s.indexOf("."));
  return s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** Texto livre (valor inicial, colado, número vindo do servidor) → texto com ponto de milhar. */
export function maskInt(raw: string | number | null | undefined, maxDigits = INT_MAX_DIGITS): string {
  if (raw === null || raw === undefined) return "";
  const text = typeof raw === "number" ? (Number.isFinite(raw) && raw >= 0 ? String(Math.trunc(raw)) : "") : raw;
  return groupInt(digitsOf(text, true).slice(0, maxDigits));
}

/**
 * Um passo de digitação: `prev` é o texto mostrado antes, `raw` o que o campo tem agora.
 * Devolve o texto mascarado, ou `prev` quando a mudança passaria do limite de dígitos.
 */
export function typeInt(prev: string, raw: string, opts: { pasted?: boolean; maxDigits?: number } = {}): string {
  const digits = digitsOf(raw, opts.pasted ?? false);
  if (digits.length > (opts.maxDigits ?? INT_MAX_DIGITS)) return prev;
  return groupInt(digits);
}

/** Texto mascarado (ou livre) → número; vazio → null. */
export function intFromText(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits === "" ? null : Number(digits);
}

/**
 * Parser tolerante para servidores e ações: aceita "10000", "10.000", " 10 000 ".
 * Vazio → null; qualquer outra coisa (letras, sinal, decimal "1,5", acima de `max`) → undefined.
 */
export function parseIntText(raw: string | null | undefined, max = 1_000_000_000_000): number | null | undefined {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$|^\d{1,3}( \d{3})+$/.test(text)) return undefined;
  const digits = text.replace(/[.\s]/g, "");
  if (digits.length > 15) return undefined;
  const value = Number(digits);
  return value <= max ? value : undefined;
}
