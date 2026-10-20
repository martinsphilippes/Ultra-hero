// Utilitários de data local (YYYY-MM-DD) para sequência e faixa de atividade. Sem dependências.

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Data local no fuso informado, no formato YYYY-MM-DD (igual ao local_date do banco).
export function localDateIn(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Soma dias a uma data YYYY-MM-DD (aritmética em UTC para não sofrer com horário de verão).
export function shiftDate(ymd: string, days: number): string {
  const base = new Date(`${ymd}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// Date "neutra" (meio-dia UTC) para formatar um YYYY-MM-DD sem deslocamento de fuso.
export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

// Maior sequência de dias consecutivos num conjunto de datas YYYY-MM-DD.
export function longestRun(dates: Iterable<string>): number {
  const sorted = Array.from(new Set(dates)).sort();
  let best = 0;
  let current = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    current = previous && shiftDate(previous, 1) === date ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  }
  return best;
}
