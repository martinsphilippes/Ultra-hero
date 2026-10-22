// Lista de compras pessoal (fase 5, decisão 5): nasce dos ingredientes da receita, com as porções
// da página e SEM conversão para embalagens. Regras puras: a action, a página e os testes usam as
// mesmas. A unicidade é (user_id, ingredient_id) no banco (0027): adicionar a mesma receita de novo
// atualiza a linha; itens de receitas diferentes nunca se fundem, nem com o mesmo nome ou produto.
import type { RecipeUnit } from "./codes";
import { parseQuantity } from "./quantity";
import { scaleQuantity } from "./scale";

/** Limite por pessoa, conferido também pelo gatilho shopping_list_items_before (shopping_list_full). */
export const SHOPPING_LIST_LIMIT = 300;
export const SHOPPING_LIST_PATH = "/profile/lista-de-compras";
const NAME_MAX = 120;
const TEXT_MAX = 60;
export const SHOPPING_QUANTITY_MAX = 100000;

export type ShoppingIngredient = {
  id: string;
  position: number;
  name: string;
  quantity: number | null;
  unit: RecipeUnit | null;
  quantityText: string | null;
  toTaste: boolean;
};

/** Colunas que o app escreve; espelham o grant de insert da 0027 (sem user_id nem product_id). */
export type ShoppingRow = {
  ingredient_id: string;
  name: string;
  quantity: number | null;
  unit: RecipeUnit | null;
  quantity_text: string | null;
  position: number;
};

/** Colunas do grant de update (0027): o "do update" do upsert do PostgREST tocaria outras. */
export const SHOPPING_UPDATE_COLUMNS = ["name", "quantity", "unit", "quantity_text", "checked", "position"] as const;
export type ShoppingUpdate = Pick<ShoppingRow, "name" | "quantity" | "unit" | "quantity_text" | "position"> & { checked: false };

/** Vem marcado o que tem quantidade; "a gosto" e item sem quantidade começam desmarcados. */
export function defaultShoppingSelection(ingredients: ShoppingIngredient[]): string[] {
  return ingredients.filter((i) => !i.toTaste && (i.quantity !== null || Boolean(i.quantityText?.trim()))).map((i) => i.id);
}

/**
 * Linhas da lista para os ingredientes escolhidos, na ordem da receita, com o fator de porções.
 * Só o número muda (mesma regra de arredondamento da página, scaleQuantity); a unidade fica a do
 * chef: 300 g viram 600 g, nunca "1 pacote". Texto livre e "a gosto" vão como estão.
 */
export function buildShoppingRows(ingredients: ShoppingIngredient[], selected: Iterable<string>, factor: number): ShoppingRow[] {
  const chosen = new Set(selected);
  return [...ingredients]
    .filter((i) => chosen.has(i.id))
    .sort((a, b) => a.position - b.position)
    .map((i) => {
      const name = i.name.trim().slice(0, NAME_MAX);
      if (i.toTaste) return { ingredient_id: i.id, name, quantity: null, unit: null, quantity_text: null, position: i.position };
      if (i.quantity !== null) {
        return { ingredient_id: i.id, name, quantity: scaleQuantity(i.quantity, i.unit, factor).quantity, unit: i.unit, quantity_text: null, position: i.position };
      }
      const text = i.quantityText?.trim() ? i.quantityText.trim().slice(0, TEXT_MAX) : null;
      return { ingredient_id: i.id, name, quantity: null, unit: null, quantity_text: text, position: i.position };
    });
}

export function shoppingUpdatePatch(row: ShoppingRow): ShoppingUpdate {
  // adicionar de novo é "vou comprar de novo": a quantidade nova vale e o item volta a desmarcado
  return { name: row.name, quantity: row.quantity, unit: row.unit, quantity_text: row.quantity_text, position: row.position, checked: false };
}

export type ExistingShoppingRow = { ingredient_id: string | null };
export type ShoppingPlan = { inserts: ShoppingRow[]; updates: { ingredientId: string; patch: ShoppingUpdate }[] };

/**
 * Separa o que entra do que atualiza. A chave é só o ingrediente (único por receita): o mesmo
 * "Azeite" em duas receitas são dois ingredientes e duas linhas — nada se funde por nome ou produto.
 */
export function planShoppingUpsert(existing: ExistingShoppingRow[], rows: ShoppingRow[]): ShoppingPlan {
  const present = new Set(existing.map((e) => e.ingredient_id).filter((id): id is string => Boolean(id)));
  const plan: ShoppingPlan = { inserts: [], updates: [] };
  for (const row of rows) {
    if (present.has(row.ingredient_id)) plan.updates.push({ ingredientId: row.ingredient_id, patch: shoppingUpdatePatch(row) });
    else plan.inserts.push(row);
  }
  return plan;
}

// ---------------------------------------------------------------- estado do produto (4 estados)

/**
 * Seção 4.4: disponível com o comércio ligado (botão do carrinho de teste); indisponível (selo, sem
 * esconder); sem produto ("Sem produto correspondente"); comércio desligado (faixa, nenhum botão).
 */
export type OfferState = "available" | "unavailable" | "none" | "commerce_off";

export function productOfferState(input: { commerceEnabled: boolean; product: { purchasable: boolean } | null }): OfferState {
  if (!input.product) return "none";
  if (!input.commerceEnabled) return "commerce_off";
  return input.product.purchasable ? "available" : "unavailable";
}

// ---------------------------------------------------------------- agrupamento por receita

export type ShoppingItemRow = {
  id: string;
  content_id: string | null;
  ingredient_id: string | null;
  name: string;
  quantity: number | null;
  unit: RecipeUnit | null;
  quantity_text: string | null;
  product_id: string | null;
  checked: boolean;
  position: number;
  created_at: string;
};

export type ShoppingGroup<T extends Pick<ShoppingItemRow, "content_id" | "position" | "created_at">> = { contentId: string | null; items: T[] };

/** Um grupo por receita (a mais recente primeiro); itens na ordem da receita. Sem receita: no fim. */
export function groupShoppingItems<T extends Pick<ShoppingItemRow, "content_id" | "position" | "created_at">>(items: T[]): ShoppingGroup<T>[] {
  const groups = new Map<string, { contentId: string | null; items: T[]; latest: string }>();
  for (const item of items) {
    const key = item.content_id ?? "";
    const group = groups.get(key) ?? { contentId: item.content_id, items: [], latest: item.created_at };
    group.items.push(item);
    if (item.created_at > group.latest) group.latest = item.created_at;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => {
      if (a.contentId === null) return 1;
      if (b.contentId === null) return -1;
      return b.latest.localeCompare(a.latest);
    })
    .map((g) => ({ contentId: g.contentId, items: [...g.items].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)) }));
}

/**
 * "Também em {receita}": para cada produto, as receitas da lista em que ele aparece (por item ou
 * pelo kit do grupo). Devolve as outras receitas, sem a do próprio item.
 */
export function otherRecipesWithProduct(entries: { contentId: string | null; productId: string | null }[]): (productId: string | null, contentId: string | null) => string[] {
  const byProduct = new Map<string, string[]>();
  for (const { contentId, productId } of entries) {
    if (!productId || !contentId) continue;
    const list = byProduct.get(productId) ?? [];
    if (!list.includes(contentId)) list.push(contentId);
    byProduct.set(productId, list);
  }
  return (productId, contentId) => (productId ? (byProduct.get(productId) ?? []).filter((c) => c !== contentId) : []);
}

// ---------------------------------------------------------------- editar a quantidade

export type EditedAmount = Pick<ShoppingRow, "quantity" | "unit" | "quantity_text">;

/**
 * Quantidade digitada na lista: "2", "1/2", "1,5" e "500 g" viram número (a unidade digitada vale;
 * sem ela fica a do item); outro texto fica como texto; vazio limpa. Inválido (texto longo) → null.
 */
export function parseEditedAmount(input: string, currentUnit: RecipeUnit | null): EditedAmount | null {
  const s = input.trim();
  if (!s) return { quantity: null, unit: null, quantity_text: null };
  const parsed = parseQuantity(s);
  if (parsed.kind === "numeric") {
    if (parsed.quantity > SHOPPING_QUANTITY_MAX) return null;
    return { quantity: parsed.quantity, unit: parsed.unit ?? currentUnit, quantity_text: null };
  }
  // número fora da faixa ("0", "200000") não vira texto: é erro de digitação
  if (s.length > TEXT_MAX || /^[\d.,\s/]+$/.test(s)) return null;
  return { quantity: null, unit: null, quantity_text: s };
}
