import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 3 sem Next nem Supabase: a avaliação grava pela RLS (insert na 1ª vez, update depois; a
// política recusada vira "forbidden"), os eventos só levam números/método, o catálogo devolve os
// cards na ordem da recipe_catalog com o cursor da última linha, e loadRatingState só oferece as
// estrelas a quem concluiu, com as avaliações ligadas e sem ser o chef.

type Res = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  existing: null as { stars: number } | null,
  writeError: null as { message: string; code?: string } | null,
  writes: [] as { op: string; table: string; payload?: unknown; filters: [string, unknown][] }[],
  events: [] as { event: string; props: unknown }[],
  rpc: {} as Record<string, Res>,
  rpcCalls: [] as { fn: string; args: unknown }[],
  rows: {} as Record<string, unknown>,
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async (event: string, props: unknown) => void state.events.push({ event, props }) }));

function chain(table: string) {
  let op = "select";
  let payload: unknown;
  const filters: [string, unknown][] = [];
  const result = async (): Promise<Res> => {
    if (op !== "select") {
      state.writes.push({ op, table, payload, filters: [...filters] });
      return { data: null, error: state.writeError };
    }
    if (table === "recipe_ratings") return { data: state.existing, error: null };
    return { data: state.rows[table] ?? null, error: null };
  };
  const c: Record<string, unknown> = {
    select: () => c,
    insert: (p: unknown) => ((op = "insert"), (payload = p), c),
    update: (p: unknown) => ((op = "update"), (payload = p), c),
    eq: (k: string, v: unknown) => (filters.push([k, v]), c),
    in: (k: string, v: unknown) => (filters.push([k, v]), c),
    maybeSingle: result,
    then: (resolve: (v: unknown) => void) => result().then(resolve),
  };
  return c;
}

const client = {
  from: (table: string) => chain(table),
  rpc: async (fn: string, args: unknown) => {
    state.rpcCalls.push({ fn, args });
    return state.rpc[fn] ?? { data: null, error: null };
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const CONTENT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

beforeEach(() => {
  state.user = { id: "u1" };
  state.existing = null;
  state.writeError = null;
  state.writes = [];
  state.events = [];
  state.rpc = {};
  state.rpcCalls = [];
  state.rows = {};
  state.revalidated = [];
});

describe("rateRecipe", () => {
  it("primeira nota: insert só com content_id e stars (user_id vem do banco)", async () => {
    const { rateRecipe } = await import("@/app/(app)/content/recipe-actions");
    expect(await rateRecipe({ contentId: CONTENT, stars: 4, path: "/content/g1" })).toEqual({ ok: true, stars: 4 });
    expect(state.writes).toEqual([{ op: "insert", table: "recipe_ratings", payload: { content_id: CONTENT, stars: 4 }, filters: [] }]);
    expect(state.events).toEqual([{ event: "recipe.rate", props: { stars: 4 } }]);
    expect(state.revalidated).toEqual(["/content/g1"]);
  });

  it("já avaliou: update só de stars (o grant de update é só nessa coluna)", async () => {
    state.existing = { stars: 2 };
    const { rateRecipe } = await import("@/app/(app)/content/recipe-actions");
    await rateRecipe({ contentId: CONTENT, stars: 5, path: "/content/g1" });
    expect(state.writes[0]).toMatchObject({ op: "update", payload: { stars: 5 }, filters: [["content_id", CONTENT], ["user_id", "u1"]] });
  });

  it("política recusou (sem conclusão, chef, avaliações desligadas): forbidden", async () => {
    state.writeError = { message: 'new row violates row-level security policy for table "recipe_ratings"', code: "42501" };
    const { rateRecipe } = await import("@/app/(app)/content/recipe-actions");
    expect(await rateRecipe({ contentId: CONTENT, stars: 3, path: "/content/g1" })).toEqual({ ok: false, error: "forbidden" });
    expect(state.events).toEqual([]);
  });

  it("entrada inválida e visitante não chegam ao banco", async () => {
    const { rateRecipe } = await import("@/app/(app)/content/recipe-actions");
    expect(await rateRecipe({ contentId: CONTENT, stars: 6, path: "/content/g1" })).toEqual({ ok: false, error: "invalid" });
    expect(await rateRecipe({ contentId: "x", stars: 3, path: "/content/g1" })).toEqual({ ok: false, error: "invalid" });
    expect(await rateRecipe({ contentId: CONTENT, stars: 3, path: "https://evil.example" })).toEqual({ ok: false, error: "invalid" });
    state.user = null;
    expect(await rateRecipe({ contentId: CONTENT, stars: 3, path: "/content/g1" })).toEqual({ ok: false, error: "unauthenticated" });
    expect(state.writes).toEqual([]);
  });
});

describe("trackRecipeEvent", () => {
  it("só os eventos da página e só números ou o método", async () => {
    const { trackRecipeEvent } = await import("@/app/(app)/content/recipe-actions");
    await trackRecipeEvent({ event: "recipe.scale", servings: 4 });
    await trackRecipeEvent({ event: "recipe.share", method: "copy" });
    await trackRecipeEvent({ event: "recipe.print" });
    await trackRecipeEvent({ event: "recipe.rate" as "recipe.print" });
    expect(state.events).toEqual([
      { event: "recipe.scale", props: { servings: 4 } },
      { event: "recipe.share", props: { method: "copy" } },
      { event: "recipe.print", props: {} },
    ]);
  });
});

describe("fetchRecipeCatalog", () => {
  it("cards na ordem do catálogo, sem os excluídos, e cursor da última linha quando a página veio cheia", async () => {
    const { fetchRecipeCatalog } = await import("@/lib/recipes/catalog");
    const { EMPTY_RECIPE_PARAMS } = await import("@/lib/recipes/catalog-params");
    state.rpc.recipe_catalog = { data: [{ content_id: "b", cursor: "1" }, { content_id: "a", cursor: "2" }, { content_id: "c", cursor: "3" }], error: null };
    const card = (id: string) => ({ id, slug: id, title: id, cover_url: null, pillar: "gastronomy", access_level: "free", difficulty: null, required_module: null, creator: null, details: null });
    state.rows.content = [card("a"), card("b")];
    const page = await fetchRecipeCatalog(client as never, { ...EMPTY_RECIPE_PARAMS, sem: ["egg"] }, { limit: 3, exclude: ["c"], creator: "chef-1" });
    expect(page.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(page.nextCursor).toBe("3");
    expect(state.rpcCalls[0]).toEqual({ fn: "recipe_catalog", args: expect.objectContaining({ p_exclude_allergens: ["egg"], p_creator: "chef-1", p_limit: 3 }) });
  });

  it("erro da função sobe (a tela mostra o ErrorState)", async () => {
    const { fetchRecipeCatalog } = await import("@/lib/recipes/catalog");
    const { EMPTY_RECIPE_PARAMS } = await import("@/lib/recipes/catalog-params");
    state.rpc.recipe_catalog = { data: null, error: { message: "invalid_cursor" } };
    await expect(fetchRecipeCatalog(client as never, EMPTY_RECIPE_PARAMS)).rejects.toThrow("invalid_cursor");
  });
});

describe("loadRatingState", () => {
  it("só oferece com conclusão, avaliações ligadas e sem ser o chef", async () => {
    const { loadRatingState, ratingsEnabled } = await import("@/components/recipes/view/recipe-page-data");
    expect(ratingsEnabled({ "recipes.ratings_enabled": true })).toBe(true);
    expect(ratingsEnabled({ "recipes.ratings_enabled": "false" })).toBe(false);
    expect(ratingsEnabled({})).toBe(false);

    state.rpc.public_settings = { data: { "recipes.ratings_enabled": true }, error: null };
    state.existing = { stars: 3 };
    expect(await loadRatingState(client as never, { contentId: CONTENT, creatorId: "chef", userId: "u1", completed: true })).toEqual({ canRate: true, stars: 3 });
    expect(await loadRatingState(client as never, { contentId: CONTENT, creatorId: "chef", userId: "u1", completed: false })).toEqual({ canRate: false, stars: null });
    state.rows.creator_profiles = { id: "chef" };
    expect(await loadRatingState(client as never, { contentId: CONTENT, creatorId: "chef", userId: "u1", completed: true })).toEqual({ canRate: false, stars: null });
    state.rows.creator_profiles = null;
    state.rpc.public_settings = { data: { "recipes.ratings_enabled": false }, error: null };
    expect(await loadRatingState(client as never, { contentId: CONTENT, creatorId: "chef", userId: "u1", completed: true })).toEqual({ canRate: false, stars: null });
  });
});
