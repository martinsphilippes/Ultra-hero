// Quantidade de ingrediente: texto livre ↔ número + unidade. Só existe em TypeScript (o banco recebe
// os valores já separados): o editor usa para ler "1/2" e "1,5", e a tabela literal do backfill
// (0029) foi gerada por estas funções e é conferida contra elas no Vitest.
import { METRIC_UNITS, RECIPE_UNITS, type RecipeUnit } from "./codes";

export type ParsedQuantity =
  | { kind: "numeric"; quantity: number; unit: RecipeUnit | null; note: string | null }
  | { kind: "text"; text: string }
  | { kind: "to_taste" }
  | { kind: "empty" };

/** Rótulos pt-BR (singular, plural). Plural a partir de 2; os símbolos métricos não variam. */
export const UNIT_LABELS_PT: Record<RecipeUnit, readonly [string, string]> = {
  g: ["g", "g"],
  kg: ["kg", "kg"],
  mg: ["mg", "mg"],
  ml: ["ml", "ml"],
  l: ["L", "L"],
  tsp: ["colher de chá", "colheres de chá"],
  tbsp: ["colher de sopa", "colheres de sopa"],
  cup: ["xícara", "xícaras"],
  unit: ["unidade", "unidades"],
  clove: ["dente", "dentes"],
  bunch: ["maço", "maços"],
  sprig: ["ramo", "ramos"],
  fillet: ["posta", "postas"],
  slice: ["fatia", "fatias"],
  leaf: ["folha", "folhas"],
  pinch: ["pitada", "pitadas"],
  can: ["lata", "latas"],
  package: ["pacote", "pacotes"],
};

// Formas aceitas na leitura, além dos rótulos acima (sem acento, abreviações comuns).
const EXTRA_ALIASES: Partial<Record<RecipeUnit, string[]>> = {
  g: ["grama", "gramas"],
  kg: ["quilo", "quilos"],
  mg: ["miligrama", "miligramas"],
  ml: ["mililitro", "mililitros"],
  l: ["litro", "litros"],
  tsp: ["colher (chá)", "colheres (chá)", "c. chá"],
  tbsp: ["colher (sopa)", "colheres (sopa)", "c. sopa"],
  cup: ["xicara", "xicaras"],
  bunch: ["maco", "macos"],
  fillet: ["filé", "filés", "file", "files"],
};

const ALIASES: { alias: string; unit: RecipeUnit }[] = RECIPE_UNITS.flatMap((unit) => {
  const names = new Set([unit, ...UNIT_LABELS_PT[unit], ...(EXTRA_ALIASES[unit] ?? [])].map((s) => s.toLowerCase()));
  return [...names].map((alias) => ({ alias, unit }));
}).sort((a, b) => b.alias.length - a.alias.length);

// Tamanho ("1 média") não é unidade: vira observação e o número continua ajustável.
const SIZE_WORDS = /^(pequen[oa]s?|médi[oa]s?|medi[oa]s?|grandes?)$/i;

const UNICODE_FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

function readNumber(s: string): { value: number; rest: string } | null {
  let m = /^(\d+)\s+(\d+)\/(\d+)(?=\s|$)/.exec(s);
  if (m && Number(m[3]) > 0) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: s.slice(m[0].length) };
  m = /^(\d+)\/(\d+)(?=\s|$)/.exec(s);
  if (m && Number(m[2]) > 0) return { value: Number(m[1]) / Number(m[2]), rest: s.slice(m[0].length) };
  m = /^(\d+)?\s*([½¼¾⅓⅔])(?=\s|$)/.exec(s);
  if (m) return { value: Number(m[1] ?? 0) + UNICODE_FRACTIONS[m[2]], rest: s.slice(m[0].length) };
  m = /^(\d+(?:[.,]\d+)?)(?=\s|$|[a-zA-Z])/.exec(s);
  if (m) return { value: Number(m[1].replace(",", ".")), rest: s.slice(m[0].length) };
  return null;
}

/**
 * Lê a quantidade escrita pela pessoa. "a gosto" → to_taste; número (inteiro, decimal com vírgula ou
 * ponto, fração "1/2" ou mista "2 1/2") seguido de unidade conhecida, de tamanho ("média") ou de nada
 * → numeric; qualquer outra coisa ("3 colheres", "1 e 2 dentes") fica como texto e não é recalculada.
 */
export function parseQuantity(input: string | null | undefined): ParsedQuantity {
  const s = (input ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { kind: "empty" };
  if (s.toLowerCase() === "a gosto") return { kind: "to_taste" };
  const num = readNumber(s);
  if (!num || !(num.value > 0) || num.value > 100000) return { kind: "text", text: s };
  const rest = num.rest.trim();
  const quantity = Math.round(num.value * 1000) / 1000;
  if (!rest) return { kind: "numeric", quantity, unit: null, note: null };
  const lower = rest.toLowerCase();
  for (const { alias, unit } of ALIASES) {
    if (lower === alias) return { kind: "numeric", quantity, unit, note: null };
    if (lower.startsWith(`${alias} `)) {
      const note = rest.slice(alias.length).trim();
      return { kind: "numeric", quantity, unit, note: note || null };
    }
  }
  if (SIZE_WORDS.test(rest)) return { kind: "numeric", quantity, unit: null, note: rest };
  return { kind: "text", text: s };
}

const FRACTIONS: [number, string][] = [
  [0.25, "1/4"],
  [1 / 3, "1/3"],
  [0.5, "1/2"],
  [2 / 3, "2/3"],
  [0.75, "3/4"],
];

/** Número no formato de cozinha: métrico em decimal com vírgula, o resto em fração quando der. */
export function formatAmount(quantity: number, unit: RecipeUnit | null): string {
  const metric = unit !== null && METRIC_UNITS.includes(unit);
  const whole = Math.floor(quantity + 1e-9);
  const frac = quantity - whole;
  if (!metric && frac > 1e-6) {
    const hit = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.01);
    if (hit) return whole > 0 ? `${whole} ${hit[1]}` : hit[1];
  }
  const rounded = Math.round(quantity * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

/** "2 colheres de sopa", "1/2 maço", "1,5 L", "10". Plural a partir de 2 (pt-BR). */
export function formatQuantity(quantity: number, unit: RecipeUnit | null, labels: Record<RecipeUnit, readonly [string, string]> = UNIT_LABELS_PT): string {
  const amount = formatAmount(quantity, unit);
  if (unit === null) return amount;
  const [singular, plural] = labels[unit];
  return `${amount} ${quantity >= 2 ? plural : singular}`;
}

/** Texto completo de um ingrediente numérico com a observação ("1 média"). */
export function formatQuantityWithNote(quantity: number, unit: RecipeUnit | null, note: string | null): string {
  const base = formatQuantity(quantity, unit);
  return note ? `${base} ${note}` : base;
}

export type StepTiming = { duration_seconds: number | null; temperature_c: number | null };

/**
 * Duração e temperatura de uma etapa, só quando o texto tem uma única ocorrência inequívoca.
 * "X minutos de cada lado" não conta (a etapa repete o tempo); dias ("por até 5 dias") não contam.
 */
export function extractStepTiming(instruction: string): StepTiming {
  const temps = [...instruction.matchAll(/(\d{2,3})\s?°\s?C\b/g)].map((m) => Number(m[1]));
  const times = [...instruction.matchAll(/(\d+)\s+(minutos?|horas?)\b(\s+de cada lado)?/gi)];
  const temperature_c = temps.length === 1 && temps[0] >= -30 && temps[0] <= 320 ? temps[0] : null;
  let duration_seconds: number | null = null;
  if (times.length === 1 && !times[0][3]) {
    const n = Number(times[0][1]);
    duration_seconds = /^hora/i.test(times[0][2]) ? n * 3600 : n * 60;
    if (duration_seconds < 1 || duration_seconds > 86400) duration_seconds = null;
  }
  return { duration_seconds, temperature_c };
}
