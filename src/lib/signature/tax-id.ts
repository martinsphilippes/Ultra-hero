// CPF e CNPJ (lógica pura, testada em tests/unit/assinatura.test.ts). Mesmo cálculo de public.br_tax_id_kind (0084):
// dígitos verificadores, sequência repetida não vale, CNPJ alfanumérico (IN RFB 2.229/2024: letras nas 12
// primeiras posições, valor = código ASCII − 48) também passa.

export type TaxIdKind = "cpf" | "cnpj";

/** Sem pontuação e em maiúsculas. */
export function normalizeTaxId(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

const val = (ch: string) => ch.charCodeAt(0) - 48;

function cpfOk(d: string): boolean {
  if (!/^\d{11}$/.test(d) || d === d[0].repeat(11)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

function cnpjOk(d: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || d === d[0].repeat(14)) return false;
  const digit = (weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + val(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) && digit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]);
}

/** "cpf" | "cnpj" | null (inválido). */
export function taxIdKind(value: string): TaxIdKind | null {
  const d = normalizeTaxId(value);
  if (cpfOk(d)) return "cpf";
  if (cnpjOk(d)) return "cnpj";
  return null;
}

/** 529.982.247-25 / 11.222.333/0001-81 (o normalizado que o banco guarda → como se lê). */
export function formatTaxId(value: string): string {
  const d = normalizeTaxId(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/** Nome completo: ao menos nome e sobrenome, 5 a 120 caracteres (mesma regra do banco). Devolve o nome limpo ou null. */
export function cleanSignerName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 5 || name.length > 120 || !/^\S+( \S+)+$/.test(name)) return null;
  return name;
}

type HeaderReader = { get(name: string): string | null };

/**
 * IP de quem assina, lido pelo servidor: primeiro endereço de x-forwarded-for (a Vercel põe o do cliente na frente),
 * senão x-real-ip. Só devolve o que parece IP (v4 ou v6); o banco confere de novo (cast para inet).
 */
export function clientIpFrom(headers: HeaderReader): string | null {
  const first = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
  if (!first || first.length > 64) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(first) || (/^[0-9a-fA-F:.]+$/.test(first) && first.includes(":"))) return first;
  return null;
}
