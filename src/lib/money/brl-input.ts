// Máscara de valor em reais (BRL) para campos de digitação: lógica pura, sem React.
//
// Decisões (pedido do responsável: "50000" digitado é cinquenta mil reais, não R$ 500,00):
// - O usuário digita REAIS. Enquanto digita, a parte inteira ganha ponto de milhar ("50000" → "50.000").
// - A vírgula abre os centavos (até 2 casas). Um ponto digitado no fim, sem vírgula, vira vírgula
//   (teclados que mostram "." no lugar de ",").
// - Ao sair do campo (blur) completa ",00" / ",50" ("50.000" → "50.000,00").
// - Texto colado é interpretado inteiro: "50000", "50.000,00", "R$ 50.000,00", "50000.5" (ponto decimal
//   quando seguido de 1–2 dígitos e não é grupo de milhar).
// - Sem negativos ("-" é ignorado). O "R$" é desenhado pelo componente, fora do texto.
// O texto produzido ("50.000" / "50.000,5" / "50.000,00") é aceito por todos os parsers do sistema
// (parseBrlToCents, parseMoneyToCents, parsePriceToCents, parsePriceInput de profissionais e de marcas).

/** Mais dígitos inteiros aceitos (R$ 999.999.999.999). Os limites de negócio ficam em `max`. */
export const BRL_MAX_INT_DIGITS = 12;

type Parts = { int: string; dec: string | null };

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function stripLeadingZeros(int: string): string {
  return int.replace(/^0+(?=\d)/, "");
}

function render({ int, dec }: Parts): string {
  if (int === "" && dec === null) return "";
  const i = stripLeadingZeros(int === "" ? "0" : int);
  return dec === null ? groupThousands(i) : `${groupThousands(i)},${dec}`;
}

/** Separa inteiro/decimal de um texto livre. `pasted` liga a leitura de ponto decimal ("50000.5"). */
function split(raw: string, pasted: boolean): Parts {
  const s = raw.replace(/R\$/gi, "").replace(/[^\d.,]/g, "");
  const comma = s.indexOf(",");
  if (comma >= 0) {
    const int = s.slice(0, comma).replace(/\D/g, "");
    const dec = s.slice(comma + 1).replace(/\D/g, "").slice(0, 2);
    return { int, dec };
  }
  if (pasted) {
    // "50000.5" / "29.90" → decimal; "1.234" / "50.000" / "1.234.567" → milhar.
    const m = /^(.*)\.(\d{1,2})$/.exec(s);
    if (m && !/^\d{1,3}(\.\d{3})+$/.test(s)) return { int: m[1].replace(/\D/g, ""), dec: m[2] };
  }
  return { int: s.replace(/\D/g, ""), dec: null };
}

/** Texto livre (valor inicial, colado, vindo do servidor) → texto mascarado sem completar centavos. */
export function maskBrl(raw: string, opts: { pasted?: boolean } = {}): string {
  const parts = split(raw, opts.pasted ?? true);
  if (parts.int.length > BRL_MAX_INT_DIGITS) parts.int = parts.int.slice(0, BRL_MAX_INT_DIGITS);
  return render(parts);
}

/**
 * Um passo de digitação: `prev` é o texto mostrado antes, `raw` o que o campo tem agora.
 * Devolve o novo texto mascarado, ou `prev` quando a mudança passaria do limite de dígitos.
 */
export function typeBrl(prev: string, raw: string, opts: { pasted?: boolean } = {}): string {
  let text = raw;
  // ponto digitado no fim, sem vírgula ainda, é a vírgula decimal
  if (!opts.pasted && !text.includes(",") && text.endsWith(".") && !prev.endsWith(".")) text = `${text.slice(0, -1)},`;
  const parts = split(text, opts.pasted ?? false);
  if (stripLeadingZeros(parts.int).length > BRL_MAX_INT_DIGITS) return prev;
  return render(parts);
}

/** Completa os centavos (blur): "50.000" → "50.000,00", "1.234,5" → "1.234,50", "" → "". */
export function finalizeBrl(text: string): string {
  const parts = split(text, false);
  if (parts.int === "" && (parts.dec === null || parts.dec === "")) return "";
  return render({ int: parts.int, dec: (parts.dec ?? "").padEnd(2, "0") });
}

/** Texto mascarado (ou livre) → centavos; vazio → null. */
export function brlToCents(text: string): number | null {
  const parts = split(text, false);
  if (parts.int === "" && (parts.dec === null || parts.dec === "")) return null;
  return Number(parts.int || "0") * 100 + Number((parts.dec ?? "").padEnd(2, "0"));
}

/** Centavos → texto completo do campo ("5000000" → "50.000,00"); null → "". */
export function centsToBrl(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents < 0) return "";
  const c = Math.round(cents);
  return render({ int: String(Math.floor(c / 100)), dec: String(c % 100).padStart(2, "0") });
}

/** Quantos caracteres "significativos" (dígitos e vírgula) há antes da posição `pos`. */
export function significantBefore(text: string, pos: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(pos, text.length); i++) if (/[\d,]/.test(text[i])) n++;
  return n;
}

/** Posição no texto mascarado logo depois de `count` caracteres significativos (cursor estável). */
export function caretForSignificant(text: string, count: number): number {
  if (count <= 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[\d,]/.test(text[i])) n++;
    if (n === count) return i + 1;
  }
  return text.length;
}
