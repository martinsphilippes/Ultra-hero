// Utilitários para filtros via query string (formulários GET, sem JS obrigatório).
export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

// Devolve o valor só se estiver na lista permitida (evita filtros arbitrários).
export function pickEnum<T extends string>(params: SearchParams, key: string, allowed: readonly T[]): T | null {
  const value = firstParam(params, key);
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pickUuid(params: SearchParams, key: string): string | null {
  const value = firstParam(params, key);
  return UUID_RE.test(value) ? value : null;
}

// Data no formato yyyy-mm-dd (input type=date).
export function pickDate(params: SearchParams, key: string): string | null {
  const value = firstParam(params, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// Limita o texto de busca (ilike) para evitar padrões gigantes; escapa curingas do LIKE.
export function pickSearch(params: SearchParams, key = "q"): string {
  return firstParam(params, key).slice(0, 80);
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function hasAnyFilter(params: SearchParams, keys: string[]): boolean {
  return keys.some((key) => firstParam(params, key) !== "");
}
