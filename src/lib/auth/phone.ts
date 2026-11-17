// Celular brasileiro: aceita "(11) 91234-5678", "11912345678", "+55 11 91234-5678", "0 11 9…" etc.
// Guarda em E.164 (+55DDXXXXXXXXX). Só celular (9 dígitos começando por 9) com DDD que existe.

// DDDs em uso no Brasil (Anatel).
const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63,
  64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Dígitos nacionais (DDD + número), sem +55 nem zero de operadora. */
function nationalDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  // +55 / 55 na frente (12 ou 13 dígitos) e zero de longa distância ("011…")
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  else if (digits.length === 12 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Celular válido → "+55DD9XXXXXXXX"; senão null. */
export function normalizeBrMobile(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const digits = nationalDigits(input);
  if (digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (!VALID_DDD.has(ddd)) return null;
  if (digits[2] !== "9") return null;
  return `+55${digits}`;
}

/** Máscara enquanto digita: "(11) 91234-5678" (mantém "+55 " se a pessoa começou com ele). */
export function formatBrPhoneInput(raw: string): string {
  const intl = raw.trimStart().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  let prefix = "";
  if (intl) {
    // "+55…": separa o código do país
    prefix = "+" + digits.slice(0, 2) + (digits.length > 2 ? " " : "");
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return prefix.trimEnd();
  if (digits.length <= 2) return `${prefix}(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 5) return `${prefix}(${ddd}) ${rest}`;
  return `${prefix}(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

/** "+5511912345678" → "(11) 91234-5678"; "+12125550100" → "+1 (212) 555-0100" (outros formatos voltam como estão). */
export function formatE164ForDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `+1 (${us[1]}) ${us[2]}-${us[3]}` : e164;
}

// 0144 — casting dos EUA: o acesso do Hero americano usa o número dos EUA (plano norte-americano).

/** Número dos EUA → "+1NPANXXXXXX"; aceita "(212) 555-0100", "212-555-0100", "+1 212 555 0100". */
export function normalizeUsPhone(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  // código de área e prefixo nunca começam com 0 ou 1
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : null;
}

/**
 * Celular do acesso conforme o país do Hero. EUA: número americano. Brasil (padrão): celular brasileiro, ou número
 * americano digitado com "+1" na frente (o contato pode morar fora). Sem o "+1", nada vira americano por engano: um
 * fixo do Rio, "(21) 3456-7890", continua recusado.
 */
export function normalizeMobileFor(country: string | null | undefined, input: unknown): string | null {
  if (country === "US") return normalizeUsPhone(input);
  const br = normalizeBrMobile(input);
  if (br) return br;
  return typeof input === "string" && input.trim().startsWith("+1") ? normalizeUsPhone(input) : null;
}

/** Máscara dos EUA enquanto digita: "+1 (212) 555-0100". */
export function formatUsPhoneInput(raw: string): string {
  const intl = raw.trimStart().startsWith("+");
  const all = raw.replace(/\D/g, "");
  let digits = all;
  if ((intl || digits.length > 10) && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  // só "+1" digitado: mantém o código do país; apagando tudo, o campo fica vazio
  if (digits.length === 0) return intl && all === "1" ? "+1" : "";
  if (digits.length <= 3) return `+1 (${digits}`;
  if (digits.length <= 6) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Máscara conforme o país: EUA (ou número começando com "+1") no formato americano; senão, o brasileiro. */
export function formatPhoneInput(raw: string, country?: string | null): string {
  return country === "US" || raw.trimStart().startsWith("+1") ? formatUsPhoneInput(raw) : formatBrPhoneInput(raw);
}
