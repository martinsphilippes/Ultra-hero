import { beforeEach, describe, expect, it, vi } from "vitest";
import { relatedProductsToShow } from "@/lib/catalog/related-products";
import { canSuggestProduct, ingredientLinkDisplay, summarizeIngredientLinks, type IngredientLink } from "@/lib/recipes/ingredient-products";
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
        maybeSingle: run,
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => run().then(ok, ko),
      };
      return b;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (k in state.cookies ? { value: state.cookies[k] } : undefined) }) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async (e: string) => void state.events.push(e) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@/components/commerce/server/cookies", () => ({ readExpectedPrices: async () => ({}), writeExpectedPrices: async () => undefined }));

const { addRecipeToShoppingList, clearShoppingList, setShoppingItemChecked } = await import("@/app/(app)/profile/lista-de-compras/actions");
const { addToCart } = await import("@/app/(app)/shop/actions");

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
