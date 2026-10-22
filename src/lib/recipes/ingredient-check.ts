// Checklist de ingredientes da página da receita: marcações guardadas só no aparelho
// (localStorage) por 24 h, por conta e receita, como o progresso do Modo Cozinha (uh-cook:).
// Puro: o componente cuida do acesso ao storage.

export const INGREDIENT_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
export const INGREDIENT_CHECK_PREFIX = "uh-recipe-check:";

/** Uma chave por conta e receita: quem entra depois no mesmo aparelho não vê as marcações de outra conta. */
export function ingredientCheckKey(userId: string, contentId: string): string {
  return `${INGREDIENT_CHECK_PREFIX}${userId}:${contentId}`;
}

type Stored = { at: number; ids: string[] };

/**
 * Chaves do checklist que devem sair do aparelho: vencidas (mais de 24 h), ilegíveis e as do formato
 * antigo, sem a conta (`uh-recipe-check:<receita>`), que qualquer conta no aparelho leria.
 */
export function staleIngredientCheckKeys(entries: readonly (readonly [string, string | null])[], now: number = Date.now()): string[] {
  return entries
    .filter(([key, raw]) => {
      if (!key.startsWith(INGREDIENT_CHECK_PREFIX)) return false;
      if (key.slice(INGREDIENT_CHECK_PREFIX.length).split(":").length !== 2) return true;
      let at: unknown;
      try {
        at = raw ? (JSON.parse(raw) as Partial<Stored> | null)?.at : undefined;
      } catch {
        return true;
      }
      return typeof at !== "number" || now - at > INGREDIENT_CHECK_TTL_MS;
    })
    .map(([key]) => key);
}

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
