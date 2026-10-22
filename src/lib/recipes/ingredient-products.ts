// Vínculo ingrediente ↔ produto (recipe_ingredient_products, 0027): o herói sugere no editor, o admin
// valida ou recusa (admin_set_ingredient_product, auditada) e só o validado chega à lista de compras.
// Regras puras do que o editor mostra ao lado de cada ingrediente.

export type IngredientLinkStatus = "suggested" | "validated" | "suspended" | "rejected";

export type IngredientLink = {
  id: string;
  ingredientId: string;
  status: IngredientLinkStatus;
  note: string | null;
  suspendedReason: string | null;
  updatedAt: string;
  /** Produto como o herói o vê (a RLS esconde produto fora do ar: fica null). */
  product: { id: string; title: string; purchasable: boolean } | null;
};

export type IngredientLinkSummary = {
  /** O que vale hoje na lista de compras (um só por ingrediente, índice único da 0027). */
  validated: IngredientLink | null;
  /** Sugestão aguardando o admin (o editor mantém no máximo uma). */
  pending: IngredientLink | null;
  /** A última recusa ou suspensão, só quando não há sugestão nova depois dela. */
  last: IngredientLink | null;
};

/** O que o editor mostra por ingrediente: o validado, a sugestão pendente e a última decisão. */
export function summarizeIngredientLinks(links: IngredientLink[]): Map<string, IngredientLinkSummary> {
  const out = new Map<string, IngredientLinkSummary>();
  const sorted = [...links].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const link of sorted) {
    const entry = out.get(link.ingredientId) ?? { validated: null, pending: null, last: null };
    if (link.status === "validated" && !entry.validated) entry.validated = link;
    else if (link.status === "suggested" && !entry.pending) entry.pending = link;
    else if ((link.status === "rejected" || link.status === "suspended") && !entry.last) entry.last = link;
    out.set(link.ingredientId, entry);
  }
  for (const entry of out.values()) {
    if (entry.pending && entry.last && entry.last.updatedAt < entry.pending.updatedAt) entry.last = null;
    // a recusa antiga não interessa quando há um validado mais novo; "<=" porque validar suspende o
    // anterior ('replaced') na mesma transação, com o mesmo updated_at do novo validado
    if (entry.validated && entry.last && entry.last.updatedAt <= entry.validated.updatedAt) entry.last = null;
  }
  return out;
}

/**
 * Situação exibida ao lado do produto: pendente de validação, validado, suspenso ou recusado, e à
 * parte "indisponível" (produto fora de venda, sem estoque de demonstração ou fora do ar).
 */
export type IngredientLinkDisplay = { status: "pending" | "validated" | "suspended" | "rejected"; unavailable: boolean };

export function ingredientLinkDisplay(link: Pick<IngredientLink, "status" | "product">): IngredientLinkDisplay {
  const status = link.status === "suggested" ? "pending" : link.status;
  return { status, unavailable: !link.product || !link.product.purchasable };
}

/** Ingrediente ainda não gravado no banco (id do navegador): a RPC recusaria com forbidden. */
export function canSuggestProduct(ingredientId: string, savedIds: ReadonlySet<string>): boolean {
  return savedIds.has(ingredientId);
}

/** Motivos de suspensão gravados pelo banco (0027/0033), traduzidos na tela; o resto é texto do admin. */
export const SUSPENSION_REASONS = ["replaced", "product_significant_change", "ingredient_changed", "admin"] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export function suspensionReasonKey(reason: string | null | undefined): SuspensionReason | null {
  return (SUSPENSION_REASONS as readonly string[]).includes(reason ?? "") ? (reason as SuspensionReason) : null;
}
