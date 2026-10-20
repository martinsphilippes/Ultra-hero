import type { Json } from "@/lib/supabase/database.types";

// Chaves de primeiro nível que diferem entre "antes" e "depois" (ambos objetos).
// Para valores escalares, a diferença é o próprio valor.
export function changedKeys(before: Json | null, after: Json | null): string[] {
  const isObj = (v: Json | null): v is { [key: string]: Json | undefined } => typeof v === "object" && v !== null && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys)
      .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
      .sort();
  }
  if (before === null && after === null) return [];
  return JSON.stringify(before) === JSON.stringify(after) ? [] : ["*"];
}

// JSON legível (2 espaços), limitado para não estourar a tela.
export function prettyJson(value: Json | null, max = 4000): string {
  if (value === null || value === undefined) return "—";
  const text = JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}
