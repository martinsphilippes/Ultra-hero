// Checklist de ingredientes da página da receita: marcações guardadas só no aparelho
// (localStorage) por 24 h, por receita. Puro: o componente cuida do acesso ao storage.

export const INGREDIENT_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

export function ingredientCheckKey(contentId: string): string {
  return `uh-recipe-check:${contentId}`;
}

type Stored = { at: number; ids: string[] };

/** Lê as marcações salvas; vencidas (24 h), malformadas ou de ingredientes que saíram da receita somem. */
export function readIngredientChecks(raw: string | null, validIds: readonly string[], now: number = Date.now()): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.at !== "number" || !Array.isArray(parsed.ids)) return [];
    if (now - parsed.at > INGREDIENT_CHECK_TTL_MS || parsed.at > now + 60_000) return [];
    const valid = new Set(validIds);
    return [...new Set(parsed.ids.filter((id): id is string => typeof id === "string" && valid.has(id)))];
  } catch {
    return [];
  }
}

/** Valor a gravar; null quando não há marcação (a chave é removida). */
export function writeIngredientChecks(ids: readonly string[], now: number = Date.now()): string | null {
  if (ids.length === 0) return null;
  return JSON.stringify({ at: now, ids: [...new Set(ids)] } satisfies Stored);
}
