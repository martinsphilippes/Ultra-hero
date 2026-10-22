import { beforeEach, describe, expect, it, vi } from "vitest";
import { relatedProductsToShow } from "@/lib/catalog/related-products";
import { canSuggestProduct, ingredientLinkDisplay, summarizeIngredientLinks, suspensionReasonKey, type IngredientLink } from "@/lib/recipes/ingredient-products";
import {
  buildShoppingRows,
  defaultShoppingSelection,
  groupShoppingItems,
  otherRecipesWithProduct,
  parseEditedAmount,
  planShoppingUpsert,
  productOfferState,
  SHOPPING_UPDATE_COLUMNS,
  shoppingUpdatePatch,
  type ShoppingIngredient,
} from "@/lib/recipes/shopping";
import { servingsFactor } from "@/lib/recipes/scale";

// Lista de compras (fase 5, decisão 5): regras puras (seleção, escala sem conversão de unidade,
// upsert por ingrediente sem fusão entre receitas, 4 estados do produto, agrupamento) e as actions
// com um cliente falso (acesso conferido no banco, forbidden, só colunas do grant).

const G3: ShoppingIngredient[] = [
  { id: "a0000000-0000-4000-8000-000000000001", position: 1, name: "Salsinha", quantity: 1, unit: "bunch", quantityText: null, toTaste: false },
  { id: "a0000000-0000-4000-8000-000000000002", position: 2, name: "Cebolinha", quantity: 0.5, unit: "bunch", quantityText: null, toTaste: false },
  { id: "a0000000-0000-4000-8000-000000000003", position: 3, name: "Azeite", quantity: 0.5, unit: "cup", quantityText: null, toTaste: false },
  { id: "a0000000-0000-4000-8000-000000000004", position: 4, name: "Limão", quantity: 1, unit: null, quantityText: null, toTaste: false },
  { id: "a0000000-0000-4000-8000-000000000005", position: 5, name: "Alho", quantity: 1, unit: "clove", quantityText: null, toTaste: false },
  { id: "a0000000-0000-4000-8000-000000000006", position: 6, name: "Sal", quantity: null, unit: null, quantityText: null, toTaste: true },
];

describe("seleção e quantidades (sem conversão de unidade)", () => {
  it("'a gosto' e item sem quantidade começam desmarcados; texto livre conta como quantidade", () => {
    const withText = [...G3, { id: "t", position: 7, name: "Molho", quantity: null, unit: null, quantityText: "3 colheres", toTaste: false }, { id: "n", position: 8, name: "Água", quantity: null, unit: null, quantityText: null, toTaste: false }];
    expect(defaultShoppingSelection(withText)).toEqual(["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002", "a0000000-0000-4000-8000-000000000003", "a0000000-0000-4000-8000-000000000004", "a0000000-0000-4000-8000-000000000005", "t"]);
  });

  it("escala pelas porções e mantém a unidade do chef (300 g → 600 g, 1,5 L → 4,5 L, nunca embalagem)", () => {
    const items: ShoppingIngredient[] = [
      { id: "f", position: 1, name: "Peito de frango", quantity: 300, unit: "g", quantityText: null, toTaste: false },
      { id: "c", position: 2, name: "Caldo", quantity: 1.5, unit: "l", quantityText: null, toTaste: false },
      { id: "k", position: 3, name: "Arroz", quantity: 1, unit: "kg", quantityText: null, toTaste: false },
      { id: "x", position: 4, name: "Molho de ervas", quantity: null, unit: null, quantityText: "3 colheres", toTaste: false },
      { id: "s", position: 5, name: "Sal", quantity: null, unit: null, quantityText: null, toTaste: true },
    ];
    const rows = buildShoppingRows(items, ["s", "x", "k", "c", "f"], servingsFactor(2, 4));
    expect(rows).toEqual([
      { ingredient_id: "f", name: "Peito de frango", quantity: 600, unit: "g", quantity_text: null, position: 1 },
      { ingredient_id: "c", name: "Caldo", quantity: 3, unit: "l", quantity_text: null, position: 2 },
      { ingredient_id: "k", name: "Arroz", quantity: 2, unit: "kg", quantity_text: null, position: 3 },
      // texto livre e "a gosto" não são recalculados
      { ingredient_id: "x", name: "Molho de ervas", quantity: null, unit: null, quantity_text: "3 colheres", position: 4 },
      { ingredient_id: "s", name: "Sal", quantity: null, unit: null, quantity_text: null, position: 5 },
    ]);
    const triple = buildShoppingRows(items, ["c"], 3);
    expect(triple[0]).toMatchObject({ quantity: 4.5, unit: "l" });
  });

  it("g3 (6 porções) para 12: maço, xícara e dente dobram sem mudar de unidade", () => {
    const rows = buildShoppingRows(G3, defaultShoppingSelection(G3), servingsFactor(6, 12));
    expect(rows.map((r) => [r.name, r.quantity, r.unit])).toEqual([
      ["Salsinha", 2, "bunch"],
      ["Cebolinha", 1, "bunch"],
      ["Azeite", 1, "cup"],
      ["Limão", 2, null],
      ["Alho", 2, "clove"],
    ]);
  });

  it("fator 1 devolve o número do chef", () => {
    expect(buildShoppingRows(G3, [G3[1].id], 1)[0]).toMatchObject({ quantity: 0.5, unit: "bunch" });
  });
});

describe("upsert por (user_id, ingredient_id)", () => {
  it("a mesma receita de novo só atualiza; o patch usa só colunas do grant de update", () => {
    const rows = buildShoppingRows(G3, defaultShoppingSelection(G3), 1);
    const plan = planShoppingUpsert(rows.map((r) => ({ ingredient_id: r.ingredient_id })), rows);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toHaveLength(5);
    for (const { patch } of plan.updates) {
      expect(Object.keys(patch).every((k) => (SHOPPING_UPDATE_COLUMNS as readonly string[]).includes(k))).toBe(true);
      expect(patch).not.toHaveProperty("content_id");
      expect(patch).not.toHaveProperty("ingredient_id");
      expect(patch).not.toHaveProperty("product_id");
      expect(patch.checked).toBe(false);
    }
  });

  it("itens de receitas diferentes nunca se fundem, mesmo com o mesmo nome", () => {
    const g4Azeite: ShoppingIngredient = { id: "b0000000-0000-4000-8000-000000000003", position: 3, name: "Azeite", quantity: 1, unit: "tbsp", quantityText: null, toTaste: false };
    const existing = buildShoppingRows(G3, defaultShoppingSelection(G3), 1).map((r) => ({ ingredient_id: r.ingredient_id }));
    const plan = planShoppingUpsert(existing, buildShoppingRows([g4Azeite], [g4Azeite.id], 1));
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toEqual([{ ingredient_id: g4Azeite.id, name: "Azeite", quantity: 1, unit: "tbsp", quantity_text: null, position: 3 }]);
  });

  it("linha sem ingrediente (receita editada pelo chef) não casa com nada", () => {
    const rows = buildShoppingRows(G3, [G3[0].id], 1);
    expect(planShoppingUpsert([{ ingredient_id: null }], rows).inserts).toHaveLength(1);
  });

  it("shoppingUpdatePatch desmarca o item (vou comprar de novo)", () => {
    expect(shoppingUpdatePatch({ ingredient_id: "x", name: "Sal", quantity: null, unit: null, quantity_text: null, position: 6 })).toEqual({ name: "Sal", quantity: null, unit: null, quantity_text: null, position: 6, checked: false });
  });
});

describe("estado do produto (4 estados da seção 4.4)", () => {
  it("disponível, indisponível, sem produto e comércio desligado", () => {
    expect(productOfferState({ commerceEnabled: true, product: { purchasable: true } })).toBe("available");
    expect(productOfferState({ commerceEnabled: true, product: { purchasable: false } })).toBe("unavailable");
    expect(productOfferState({ commerceEnabled: true, product: null })).toBe("none");
    expect(productOfferState({ commerceEnabled: false, product: { purchasable: true } })).toBe("commerce_off");
    expect(productOfferState({ commerceEnabled: false, product: { purchasable: false } })).toBe("commerce_off");
    // sem produto continua "sem produto correspondente" mesmo com o comércio desligado
    expect(productOfferState({ commerceEnabled: false, product: null })).toBe("none");
  });

  it("RelatedProducts: nas receitas o indisponível aparece marcado (por último); fora delas, some", () => {
    const products = [{ id: "esgotado" }, { id: "ok" }];
    expect(relatedProductsToShow(products, [false, true], true)).toEqual([
      { product: { id: "ok" }, unavailable: false },
      { product: { id: "esgotado" }, unavailable: true },
    ]);
    expect(relatedProductsToShow(products, [false, true], false)).toEqual([{ product: { id: "ok" }, unavailable: false }]);
  });
});

describe("agrupamento por receita e 'também em'", () => {
  const base = { ingredient_id: null, name: "x", quantity: null, unit: null, quantity_text: null, product_id: null, checked: false };
  it("um grupo por receita (a mais recente primeiro), itens na ordem da receita, avulsos no fim", () => {
    const groups = groupShoppingItems([
      { ...base, id: "1", content_id: "g1", position: 2, created_at: "2026-10-20T10:00:00Z" },
      { ...base, id: "2", content_id: null, position: 0, created_at: "2026-10-22T10:00:00Z" },
      { ...base, id: "3", content_id: "g3", position: 1, created_at: "2026-10-21T10:00:00Z" },
      { ...base, id: "4", content_id: "g1", position: 1, created_at: "2026-10-20T10:00:00Z" },
    ]);
    expect(groups.map((g) => [g.contentId, g.items.map((i) => i.id)])).toEqual([
      ["g3", ["3"]],
      ["g1", ["4", "1"]],
      [null, ["2"]],
    ]);
  });

  it("o mesmo produto em outra receita aparece como 'também em', sem a própria", () => {
    const others = otherRecipesWithProduct([
      { contentId: "g1", productId: "p1" },
      { contentId: "g3", productId: "p1" },
      { contentId: "g3", productId: null },
      { contentId: null, productId: "p1" },
    ]);
    expect(others("p1", "g1")).toEqual(["g3"]);
    expect(others("p1", "g3")).toEqual(["g1"]);
    expect(others(null, "g1")).toEqual([]);
    expect(others("p2", "g1")).toEqual([]);
  });
});

describe("editar a quantidade", () => {
  it("número mantém a unidade do item; unidade digitada vale; texto fica texto; vazio limpa", () => {
    expect(parseEditedAmount("2", "bunch")).toEqual({ quantity: 2, unit: "bunch", quantity_text: null });
    expect(parseEditedAmount("1,5", "l")).toEqual({ quantity: 1.5, unit: "l", quantity_text: null });
    expect(parseEditedAmount("1/2", "cup")).toEqual({ quantity: 0.5, unit: "cup", quantity_text: null });
    expect(parseEditedAmount("500 g", null)).toEqual({ quantity: 500, unit: "g", quantity_text: null });
    expect(parseEditedAmount("um punhado", "g")).toEqual({ quantity: null, unit: null, quantity_text: "um punhado" });
    expect(parseEditedAmount("  ", "g")).toEqual({ quantity: null, unit: null, quantity_text: null });
    expect(parseEditedAmount("x".repeat(61), null)).toBeNull();
    expect(parseEditedAmount("200000", "g")).toBeNull();
  });
});

describe("vínculo ingrediente ↔ produto no editor", () => {
  const link = (over: Partial<IngredientLink>): IngredientLink => ({ id: "l", ingredientId: "i1", status: "suggested", note: null, suspendedReason: null, updatedAt: "2026-10-22T10:00:00Z", product: { id: "p", title: "Kit", purchasable: true }, ...over });

  it("resume validado, sugestão pendente e a última recusa (só se for a mais nova)", () => {
    const s = summarizeIngredientLinks([
      link({ id: "v", status: "validated", updatedAt: "2026-10-20T10:00:00Z" }),
      link({ id: "r", status: "rejected", note: "Produto errado", updatedAt: "2026-10-21T10:00:00Z" }),
      link({ id: "p", status: "suggested", updatedAt: "2026-10-22T10:00:00Z" }),
    ]).get("i1")!;
    expect([s.validated?.id, s.pending?.id, s.last]).toEqual(["v", "p", null]);
    const r = summarizeIngredientLinks([link({ id: "v", status: "validated", updatedAt: "2026-10-20T10:00:00Z" }), link({ id: "r", status: "rejected", updatedAt: "2026-10-21T10:00:00Z" })]).get("i1")!;
    expect(r.last?.id).toBe("r");
  });

  it("validar B suspende A ('replaced') na mesma transação: mesmo updated_at, e A não aparece como 'Anterior'", () => {
    const same = "2026-10-22T10:00:00Z";
    const s = summarizeIngredientLinks([link({ id: "b", status: "validated", updatedAt: same }), link({ id: "a", status: "suspended", suspendedReason: "replaced", updatedAt: same })]).get("i1")!;
    expect([s.validated?.id, s.last]).toEqual(["b", null]);
  });

  it("motivos automáticos de suspensão viram chave de tradução; texto do admin fica como está", () => {
    expect(suspensionReasonKey("replaced")).toBe("replaced");
    expect(suspensionReasonKey("product_significant_change")).toBe("product_significant_change");
    expect(suspensionReasonKey("ingredient_changed")).toBe("ingredient_changed");
    expect(suspensionReasonKey("admin")).toBe("admin");
    expect(suspensionReasonKey("Embalagem errada")).toBeNull();
    expect(suspensionReasonKey(null)).toBeNull();
  });

  it("situação ao lado: pendente, validado, recusado e indisponível (produto sem venda ou fora do ar)", () => {
    expect(ingredientLinkDisplay(link({}))).toEqual({ status: "pending", unavailable: false });
    expect(ingredientLinkDisplay(link({ status: "validated" }))).toEqual({ status: "validated", unavailable: false });
    expect(ingredientLinkDisplay(link({ status: "validated", product: { id: "p", title: "Kit", purchasable: false } }))).toEqual({ status: "validated", unavailable: true });
    expect(ingredientLinkDisplay(link({ status: "rejected", product: null }))).toEqual({ status: "rejected", unavailable: true });
  });

  it("só ingrediente já gravado pode receber produto", () => {
    expect(canSuggestProduct("a", new Set(["a"]))).toBe(true);
    expect(canSuggestProduct("novo", new Set(["a"]))).toBe(false);
  });
});

// ---------------------------------------------------------------- actions com cliente falso

type Op = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };
type Res = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  ops: [] as { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }[],
  rpcs: [] as { name: string; args: unknown }[],
  respond: (() => ({ data: null, error: null })) as (op: { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }) => { data: unknown; error: { code?: string; message: string } | null },
  rpc: (() => ({ data: true, error: null })) as (name: string, args: unknown) => { data: unknown; error: { code?: string; message: string } | null },
  events: [] as string[],
  cookies: {} as Record<string, string>,
  revalidated: [] as string[],
}));

function fakeClient() {
  return {
    rpc(name: string, args: unknown) {
      state.rpcs.push({ name, args });
      return Promise.resolve(state.rpc(name, args));
    },
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const run = () => {
        state.ops.push(op);
        return Promise.resolve(state.respond(op));
      };
      const b = {
        select: () => b,
        insert: (p: unknown) => ((op.op = "insert"), (op.payload = p), b),
        update: (p: unknown) => ((op.op = "update"), (op.payload = p), b),
        delete: () => ((op.op = "delete"), b),
        eq: (c: string, v: unknown) => (op.filters.push(["eq", c, v]), b),
        in: (c: string, v: unknown) => (op.filters.push(["in", c, v]), b),
        order: () => b,
        limit: () => b,
        maybeSingle: run,
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => run().then(ok, ko),
      };
      return b;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (k in state.cookies ? { value: state.cookies[k] } : undefined) }) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user, hasRole: async () => true }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async (e: string) => void state.events.push(e) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@/components/commerce/server/cookies", () => ({ readExpectedPrices: async () => ({}), writeExpectedPrices: async () => undefined }));

const { addRecipeToShoppingList, clearShoppingList, setShoppingItemChecked } = await import("@/app/(app)/profile/lista-de-compras/actions");
const { addToCart } = await import("@/app/(app)/shop/actions");
const { suggestIngredientProduct } = await import("@/app/creator/recipes/ingredient-product-actions");
const { loadShoppingList } = await import("@/components/recipes/shopping/load-shopping-list");

const USER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const RECIPE = "c735f164-4244-4816-9602-a023d64f6d23";
const DB_INGREDIENTS = G3.map((i) => ({ id: i.id, position: i.position, name: i.name, quantity: i.quantity, unit: i.unit, quantity_text: i.quantityText, to_taste: i.toTaste }));

function recipeDb(existing: string[] = [], insertError: Res["error"] = null) {
  return (op: Op): Res => {
    if (op.table === "recipe_details") return { data: { servings: 6 }, error: null };
    if (op.table === "recipe_ingredients") {
      const ids = (op.filters.find((f) => f[1] === "id")?.[2] ?? []) as string[];
      return { data: DB_INGREDIENTS.filter((i) => ids.includes(i.id)), error: null };
    }
    if (op.table === "shopping_list_items" && op.op === "select") return { data: existing.map((id) => ({ ingredient_id: id })), error: null };
    if (op.table === "shopping_list_items" && op.op === "insert") return { data: null, error: insertError };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  state.user = { id: USER };
  state.ops = [];
  state.rpcs = [];
  state.events = [];
  state.cookies = {};
  state.revalidated = [];
  state.rpc = () => ({ data: true, error: null });
  state.respond = recipeDb();
});

describe("addRecipeToShoppingList", () => {
  const ids = defaultShoppingSelection(G3);

  it("sem acesso à receita (a regra do RecipeGate, no banco): forbidden e nada é gravado", async () => {
    state.rpc = () => ({ data: false, error: null });
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids })).toEqual({ ok: false, error: "forbidden" });
    expect(state.rpcs).toEqual([{ name: "can_access_content", args: { p_content: RECIPE } }]);
    expect(state.ops.filter((o) => o.table === "shopping_list_items")).toEqual([]);
  });

  it("sem sessão: unauthenticated; entrada inválida: invalid_input", async () => {
    state.user = null;
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids })).toEqual({ ok: false, error: "unauthenticated" });
    state.user = { id: USER };
    expect(await addRecipeToShoppingList({ contentId: "x", ingredientIds: ids })).toEqual({ ok: false, error: "invalid_input" });
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: [] })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("ingrediente que não é desta receita: invalid_input, sem escrita", async () => {
    const result = await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: [...ids, "f0000000-0000-4000-8000-000000000099"] });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(state.ops.filter((o) => o.table === "shopping_list_items")).toEqual([]);
  });

  it("insere com as porções pedidas recalculadas no servidor, sem user_id nem product_id", async () => {
    const result = await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids, servings: 12 });
    expect(result).toEqual({ ok: true, added: 5, updated: 0 });
    const insert = state.ops.find((o) => o.table === "shopping_list_items" && o.op === "insert")!;
    const payload = insert.payload as Record<string, unknown>[];
    expect(payload.map((r) => [r.name, r.quantity, r.unit])).toEqual([
      ["Salsinha", 2, "bunch"],
      ["Cebolinha", 1, "bunch"],
      ["Azeite", 1, "cup"],
      ["Limão", 2, null],
      ["Alho", 2, "clove"],
    ]);
    for (const row of payload) {
      expect(row.content_id).toBe(RECIPE);
      expect(row).not.toHaveProperty("user_id");
      expect(row).not.toHaveProperty("product_id");
    }
    expect(state.events).toEqual(["recipe.shopping_add"]);
  });

  it("a mesma receita de novo: só update (colunas do grant), filtrado por user_id e ingredient_id", async () => {
    state.respond = recipeDb(ids);
    const result = await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids });
    expect(result).toEqual({ ok: true, added: 0, updated: 5 });
    expect(state.ops.some((o) => o.table === "shopping_list_items" && o.op === "insert")).toBe(false);
    const updates = state.ops.filter((o) => o.table === "shopping_list_items" && o.op === "update");
    expect(updates).toHaveLength(5);
    expect(Object.keys(updates[0].payload as object).sort()).toEqual(["checked", "name", "position", "quantity", "quantity_text", "unit"]);
    expect(updates[0].filters).toEqual([
      ["eq", "user_id", USER],
      ["eq", "ingredient_id", ids[0]],
    ]);
  });

  it("os updates saem juntos (sem N+1 em série): com erro no primeiro, os cinco já foram enviados e a action falha", async () => {
    let first = true;
    state.respond = (op) => {
      if (op.table === "shopping_list_items" && op.op === "update") {
        if (first) {
          first = false;
          return { data: null, error: { code: "XX000", message: "boom" } };
        }
        return { data: null, error: null };
      }
      return recipeDb(ids)(op);
    };
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids })).toEqual({ ok: false, error: "generic" });
    expect(state.ops.filter((o) => o.table === "shopping_list_items" && o.op === "update")).toHaveLength(5);
  });

  it("corrida com outra aba (23505 no lote): cai para inserir um a um e atualiza o que já entrou", async () => {
    let batch = true;
    state.respond = (op) => {
      if (op.table === "shopping_list_items" && op.op === "insert") {
        if (batch) {
          batch = false;
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row = op.payload as { ingredient_id: string };
        return row.ingredient_id === ids[0] ? { data: null, error: { code: "23505", message: "duplicate key" } } : { data: null, error: null };
      }
      return recipeDb()(op);
    };
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids })).toEqual({ ok: true, added: 4, updated: 1 });
  });

  it("limite de 300 itens: shopping_list_full", async () => {
    state.respond = recipeDb([], { code: "54000", message: "shopping_list_full" });
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids })).toEqual({ ok: false, error: "shopping_list_full" });
  });

  it("banco sem a tabela: shopping_unavailable", async () => {
    state.respond = (op) => (op.table === "recipe_ingredients" ? { data: null, error: { code: "PGRST205", message: "Could not find the table" } } : { data: null, error: null });
    expect(await addRecipeToShoppingList({ contentId: RECIPE, ingredientIds: ids })).toEqual({ ok: false, error: "shopping_unavailable" });
  });
});

describe("ações da lista", () => {
  it("limpar a lista exige confirmação explícita", async () => {
    expect(await clearShoppingList({ confirm: false })).toEqual({ ok: false, error: "confirmation_required" });
    expect(state.ops).toEqual([]);
    state.respond = () => ({ data: [{ id: "1" }, { id: "2" }], error: null });
    expect(await clearShoppingList({ confirm: true })).toEqual({ ok: true, removed: 2 });
    expect(state.ops[0]).toMatchObject({ table: "shopping_list_items", op: "delete", filters: [["eq", "user_id", USER]] });
  });

  it("marcar comprado só na própria linha; linha que não existe: not_found", async () => {
    const id = "d0000000-0000-4000-8000-000000000001";
    state.respond = () => ({ data: [], error: null });
    expect(await setShoppingItemChecked({ id, checked: true })).toEqual({ ok: false, error: "not_found" });
    expect(state.ops[0]).toMatchObject({ op: "update", payload: { checked: true }, filters: [["eq", "id", id], ["eq", "user_id", USER]] });
  });

  it("marcar comprado revalida a página (o voltar do celular não reaproveita a lista antiga)", async () => {
    state.respond = () => ({ data: [{ id: "d0000000-0000-4000-8000-000000000001" }], error: null });
    expect(await setShoppingItemChecked({ id: "d0000000-0000-4000-8000-000000000001", checked: true })).toEqual({ ok: true });
    expect(state.revalidated).toEqual(["/profile/lista-de-compras"]);
  });
});

describe("addToCart com origem", () => {
  const PRODUCT = "e0000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    state.respond = () => ({ data: null, error: null });
    state.rpc = () => ({ data: null, error: null });
  });

  it("a lista registra o interesse como content_link (valor aceito pelo check da 0004)", async () => {
    expect(await addToCart({ productId: PRODUCT, quantity: 1, priceCents: 1990, source: "content_link" })).toEqual({ ok: true, quantity: 1 });
    expect(state.ops.find((o) => o.table === "product_interest")?.payload).toEqual({ user_id: USER, product_id: PRODUCT, source: "content_link" });
  });

  it("sem origem continua 'catalog'; origem inventada é recusada", async () => {
    await addToCart({ productId: PRODUCT, quantity: 1, priceCents: 1990 });
    expect(state.ops.find((o) => o.table === "product_interest")?.payload).toMatchObject({ source: "catalog" });
    expect(await addToCart({ productId: PRODUCT, quantity: 1, priceCents: 1990, source: "recipe" as never })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("navegador do E2E (cookie uh-e2e) não grava interesse no banco", async () => {
    state.cookies = { "uh-e2e": "1" };
    await addToCart({ productId: PRODUCT, quantity: 1, priceCents: 1990, source: "content_link" });
    expect(state.ops.some((o) => o.table === "product_interest")).toBe(false);
    expect(state.rpcs.some((r) => r.name === "cart_set_item")).toBe(true);
  });
});

describe("addToCart com o comércio desligado", () => {
  const PRODUCT = "e0000000-0000-4000-8000-000000000001";

  it("commerce.enabled = false: commerce_disabled, sem cart_set_item nem product_interest", async () => {
    state.respond = () => ({ data: null, error: null });
    state.rpc = (name) => (name === "public_settings" ? { data: { "commerce.enabled": false }, error: null } : { data: null, error: null });
    expect(await addToCart({ productId: PRODUCT, quantity: 1, priceCents: 1990, source: "content_link" })).toEqual({ ok: false, error: "commerce_disabled" });
    expect(state.rpcs.map((r) => r.name)).toEqual(["public_settings"]);
    expect(state.ops).toEqual([]);
    expect(state.events).toEqual([]);
  });

  it("sem conseguir ler a configuração também não grava (fecha no seguro)", async () => {
    state.rpc = (name) => (name === "public_settings" ? { data: null, error: { message: "boom" } } : { data: null, error: null });
    expect(await addToCart({ productId: PRODUCT, quantity: 1, priceCents: 1990 })).toEqual({ ok: false, error: "commerce_disabled" });
    expect(state.rpcs.some((r) => r.name === "cart_set_item")).toBe(false);
  });
});

describe("suggestIngredientProduct (sugerir antes de retirar a pendente)", () => {
  const ING = "a0000000-0000-4000-8000-000000000002";
  const PENDING = "b0000000-0000-4000-8000-000000000001";
  const DECIDED = "b0000000-0000-4000-8000-000000000002";
  const NEW = "b0000000-0000-4000-8000-000000000003";
  const PRODUCT = "e0000000-0000-4000-8000-000000000002";
  const row = (id: string, status: string) => ({ id, ingredient_id: ING, status, note: null, suspended_reason: null, updated_at: "2026-10-22T10:00:00Z", product: { id: PRODUCT, title: "Kit" } });

  function setup(linkId: string, status: string) {
    state.rpc = (name) => {
      if (name === "my_creator_id") return { data: "c0000000-0000-4000-8000-000000000001", error: null };
      if (name === "creator_suggest_ingredient_product") return { data: linkId, error: null };
      return { data: true, error: null };
    };
    state.respond = (op) => (op.table === "recipe_ingredient_products" ? { data: row(linkId, status), error: null } : { data: null, error: null });
  }

  it("produto já recusado/suspenso/validado para o ingrediente: already_decided e a pendente não é retirada", async () => {
    for (const status of ["rejected", "suspended", "validated"]) {
      state.rpcs = [];
      setup(DECIDED, status);
      expect(await suggestIngredientProduct({ ingredientId: ING, productId: PRODUCT, replaceLinkId: PENDING })).toEqual({ ok: false, error: "already_decided" });
      expect(state.rpcs.some((r) => r.name === "creator_withdraw_ingredient_product")).toBe(false);
    }
  });

  it("sugestão nova: a RPC de sugerir vem antes de retirar a pendente anterior", async () => {
    setup(NEW, "suggested");
    const result = await suggestIngredientProduct({ ingredientId: ING, productId: PRODUCT, replaceLinkId: PENDING });
    expect(result).toMatchObject({ ok: true, link: { id: NEW, status: "suggested" } });
    const names = state.rpcs.map((r) => r.name);
    expect(names.indexOf("creator_suggest_ingredient_product")).toBeLessThan(names.indexOf("creator_withdraw_ingredient_product"));
    expect(state.rpcs.find((r) => r.name === "creator_withdraw_ingredient_product")?.args).toEqual({ p_link: PENDING });
  });

  it("escolher de novo o mesmo produto pendente não retira a própria sugestão", async () => {
    setup(PENDING, "suggested");
    expect(await suggestIngredientProduct({ ingredientId: ING, productId: PRODUCT, replaceLinkId: PENDING })).toMatchObject({ ok: true, link: { id: PENDING } });
    expect(state.rpcs.some((r) => r.name === "creator_withdraw_ingredient_product")).toBe(false);
  });
});

describe("loadShoppingList: 'a gosto' chega à lista", () => {
  it("item de ingrediente a gosto sem quantidade mostra o rótulo; sem quantidade comum continua null", async () => {
    const base = { content_id: null, quantity: null, unit: null, quantity_text: null, product_id: null, checked: false, created_at: "2026-10-22T10:00:00Z" };
    state.rpc = () => ({ data: {}, error: null });
    state.respond = (op) =>
      op.table === "shopping_list_items"
        ? {
            data: [
              { ...base, id: "s1", ingredient_id: "i1", name: "Sal", position: 6, ingredient: { to_taste: true } },
              { ...base, id: "s2", ingredient_id: "i2", name: "Água", position: 7, ingredient: { to_taste: false } },
              { ...base, id: "s3", ingredient_id: "i3", name: "Pimenta", position: 8, quantity_text: "1 pitada", ingredient: { to_taste: true } },
            ],
            error: null,
          }
        : { data: [], error: null };
    const data = await loadShoppingList(fakeClient() as never, USER, { labels: {} as never, locale: "pt-BR", toTasteLabel: "a gosto" });
    const items = data.groups.flatMap((g) => g.items);
    expect(items.map((i) => [i.name, i.amount])).toEqual([
      ["Sal", "a gosto"],
      ["Água", null],
      ["Pimenta", "1 pitada"],
    ]);
    const select = state.ops.find((o) => o.table === "shopping_list_items");
    expect(select?.op).toBe("select");
  });
});
