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

// ---------------------------------------------------------------------------------------------------------------
// Campo sempre completo (pedido do responsável, 04/11: "o preenchimento tem que acompanhar o modelo do real, ,00").
// O campo mostra sempre "1.234,00" e o cursor fica antes da vírgula: dígitos digitados entram nos REAIS (como antes,
// "50000" = cinquenta mil); apagar tira o dígito dos reais à esquerda do cursor (inclusive com o cursor no fim do
// campo, depois do ",00"). Os centavos só mudam se a pessoa digitar "," (o cursor pula para os centavos) ou tocar
// neles: aí cada dígito ocupa uma casa. Colar/autopreencher/selecionar tudo e digitar lê o texto inteiro em reais.

/** Texto completo ("1.234,00") a partir de inteiro e centavos; inteiro vazio com centavos "00" = campo vazio. */
function full(int: string, dec: string): string {
  const i = stripLeadingZeros(int);
  if ((i === "" || i === "0") && dec === "00") return int === "" ? "" : "0,00";
  return `${groupThousands(i === "" ? "0" : i)},${dec}`;
}

function intDigits(text: string): string {
  const c = text.indexOf(",");
  return (c >= 0 ? text.slice(0, c) : text).replace(/\D/g, "");
}

function decDigits(text: string): string {
  const c = text.indexOf(",");
  return c >= 0 ? text.slice(c + 1).replace(/\D/g, "").padEnd(2, "0").slice(0, 2) : "00";
}

/** Posição logo depois do n-ésimo dígito da parte inteira (n=0 → início). */
function caretAfterIntDigit(text: string, n: number): number {
  if (n <= 0) return 0;
  let k = 0;
  for (let i = 0; i < text.length && text[i] !== ","; i++) {
    if (/\d/.test(text[i])) k++;
    if (k === n) return i + 1;
  }
  const c = text.indexOf(",");
  return c >= 0 ? c : text.length;
}

export type FixedEdit = { text: string; caret: number };

/**
 * Um passo de edição no campo sempre completo. `prev` é o texto mostrado ("" ou "1.234,00"), `raw` o que o campo
 * tem agora e `pos` o cursor depois da mudança. `pasted` força a leitura do texto inteiro (colar/soltar).
 */
export function editBrlFixed(prev: string, raw: string, pos: number, opts: { pasted?: boolean } = {}): FixedEdit {
  const beforeComma = (t: string) => (t.indexOf(",") >= 0 ? t.indexOf(",") : t.length);
  const whole = (): FixedEdit => {
    const m = maskBrl(raw, { pasted: true });
    const t = m === "" ? "" : full(intDigits(m), decDigits(m.includes(",") ? m : `${m},00`));
    return { text: t, caret: beforeComma(t) };
  };
  if (opts.pasted || prev === "") {
    // primeiro dígito num campo vazio também cai aqui: "3" → "3,00" com o cursor antes da vírgula
    return whole();
  }
  const pc = prev.indexOf(",");
  const pInt = intDigits(prev);
  const pDec = decDigits(prev);

  if (raw.length === prev.length + 1) {
    // inserção de um caractere em `i`
    let i = 0;
    while (i < prev.length && prev[i] === raw[i]) i++;
    const ch = raw[i];
    if (ch === "," || ch === ".") return { text: prev, caret: pc + 1 }; // pula para os centavos
    if (!/\d/.test(ch)) return { text: prev, caret: Math.min(i, prev.length) };
    if (i <= pc) {
      // dígito nos reais
      const nInt = intDigits(raw);
      if (stripLeadingZeros(nInt).length > BRL_MAX_INT_DIGITS) return { text: prev, caret: i };
      const t = full(nInt, pDec);
      const digitsBefore = raw.slice(0, i + 1).replace(/\D/g, "").length - (nInt.length - stripLeadingZeros(nInt).length);
      return { text: t, caret: caretAfterIntDigit(t, digitsBefore) };
    }
    const slot = i - pc - 1;
    if (slot <= 1) {
      // dígito numa casa dos centavos: ocupa a casa
      const d = pDec.split("");
      d[slot] = ch;
      const t = full(pInt === "" ? "0" : pInt, d.join(""));
      return { text: t, caret: t.indexOf(",") + slot + 2 };
    }
    // digitou no fim (depois do ",00"): entra nos reais
    const nInt = pInt + ch;
    if (stripLeadingZeros(nInt).length > BRL_MAX_INT_DIGITS) return { text: prev, caret: prev.length };
    const t = full(nInt, pDec);
    return { text: t, caret: beforeComma(t) };
  }

  if (raw.length === prev.length - 1) {
    // remoção de um caractere em `d`
    let d = 0;
    while (d < raw.length && prev[d] === raw[d]) d++;
    const ch = prev[d];
    const dropIntDigit = (k: number): FixedEdit => {
      // tira o k-ésimo dígito (base 0) dos reais
      const nInt = pInt.slice(0, k) + pInt.slice(k + 1);
      const t = full(nInt, pDec);
      return { text: t, caret: t === "" ? 0 : caretAfterIntDigit(t, k) };
    };
    if (d > pc) {
      // apagou um centavo: com centavos zerados, apaga o último dígito dos reais (cursor no fim do campo)
      if (pDec === "00") return dropIntDigit(pInt.length - 1);
      const dd = pDec.split("");
      dd[d - pc - 1] = "0";
      const t = full(pInt === "" ? "0" : pInt, dd.join(""));
      return { text: t, caret: t === "" ? 0 : t.indexOf(",") + (d - pc - 1) + 1 };
    }
    if (ch === ",") return dropIntDigit(pInt.length - 1);
    // dígito ou ponto de milhar nos reais: apaga o dígito (o do ponto é o que vem antes dele)
    const digitsBefore = prev.slice(0, d).replace(/\D/g, "").length;
    if (ch === ".") return dropIntDigit(digitsBefore - 1);
    return dropIntDigit(digitsBefore);
  }

  // troca maior (selecionou e digitou, autopreencher): lê tudo em reais
  void pos;
  return whole();
}
