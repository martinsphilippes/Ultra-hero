import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoryCounts, collectionHref, parseCollectionParams } from "@/lib/recipes/collection";
import { decideHistoryChange, historyCutoff, isMissingRelation, recordRecipeView, RECIPE_HISTORY_RETENTION_DAYS } from "@/lib/recipes/history";

// Histórico de receitas vistas (decisão 6) e a coleção: desligado por padrão, ligar é direto,
// desligar e limpar exigem confirmação, a página da receita só grava com o histórico ligado (e só o
// último acesso), banco sem as tabelas vira "indisponível". As actions rodam com um cliente falso.

type Op = { table: string; op: string; payload?: unknown; options?: unknown; filters: [string, unknown][] };
type Res = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  ops: [] as { table: string; op: string; payload?: unknown; options?: unknown; filters: [string, unknown][] }[],
  respond: (() => ({ data: null, error: null })) as (op: { table: string; op: string }) => { data: unknown; error: { code?: string; message: string } | null },
  revalidated: [] as string[],
  events: [] as string[],
}));

function fakeClient() {
  return {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const run = () => {
        state.ops.push(op);
        return Promise.resolve(state.respond(op));
      };
      const b = {
        select: () => b,
        insert: (p: unknown) => ((op.op = "insert"), (op.payload = p), b),
        upsert: (p: unknown, o: unknown) => ((op.op = "upsert"), (op.payload = p), (op.options = o), b),
        update: (p: unknown) => ((op.op = "update"), (op.payload = p), b),
        delete: () => ((op.op = "delete"), b),
        eq: (c: string, v: unknown) => (op.filters.push([c, v]), b),
        maybeSingle: run,
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => run().then(ok, ko),
      };
      return b;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async (e: string) => void state.events.push(e) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));

const { clearRecipeHistory, removeHistoryItem, removeSavedRecipe, setRecipeHistory } = await import("@/app/(app)/profile/receitas/actions");

const USER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const RECIPE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function prefs(enabled: boolean | null) {
  return (op: { table: string; op: string }): Res => {
    if (op.table === "user_recipe_prefs" && op.op === "select") return { data: enabled === null ? null : { history_enabled: enabled, history_enabled_at: enabled ? "2026-10-22T10:00:00Z" : null }, error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  state.user = { id: USER };
  state.ops = [];
  state.revalidated = [];
  state.events = [];
  state.respond = prefs(null);
});

describe("regras do consentimento", () => {
  it("ligar é direto; desligar só com confirmação; mesmo estado não faz nada", () => {
    expect(decideHistoryChange(false, true, false)).toBe("enable");
    expect(decideHistoryChange(true, false, false)).toBe("needs_confirmation");
    expect(decideHistoryChange(true, false, true)).toBe("disable");
    expect(decideHistoryChange(true, true, false)).toBe("noop");
    expect(decideHistoryChange(false, false, true)).toBe("noop");
  });

  it("retenção de 90 dias e tabela ausente reconhecida", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(RECIPE_HISTORY_RETENTION_DAYS).toBe(90);
    expect(historyCutoff(now).toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(isMissingRelation({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissingRelation({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingRelation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

describe("registro da visualização na página da receita", () => {
  const client = () => fakeClient() as never;

  it("desligado (padrão, sem linha de preferência): não grava nada", async () => {
    expect(await recordRecipeView(client(), USER, RECIPE)).toBe("disabled");
    expect(state.ops.filter((o) => o.table === "recipe_view_history")).toEqual([]);
  });

  it("ligado: insere só o content_id (user_id e viewed_at vêm do banco)", async () => {
    state.respond = prefs(true);
    expect(await recordRecipeView(client(), USER, RECIPE)).toBe("recorded");
    const writes = state.ops.filter((o) => o.table === "recipe_view_history");
    expect(writes).toEqual([{ table: "recipe_view_history", op: "insert", payload: { content_id: RECIPE }, filters: [] }]);
  });

  it("ligado e já vista: atualiza só viewed_at (sem upsert, que reescreveria content_id fora do grant)", async () => {
    const base = prefs(true);
    state.respond = (op) => (op.table === "recipe_view_history" && op.op === "insert" ? { data: null, error: { code: "23505", message: "duplicate key" } } : base(op));
    expect(await recordRecipeView(client(), USER, RECIPE)).toBe("recorded");
    const update = state.ops.find((o) => o.table === "recipe_view_history" && o.op === "update");
    expect(Object.keys(update?.payload as object)).toEqual(["viewed_at"]);
    expect(update?.filters).toEqual([
      ["user_id", USER],
      ["content_id", RECIPE],
    ]);
    expect(state.ops.some((o) => o.op === "upsert")).toBe(false);
  });

  it("banco sem as tabelas: 'indisponível' e nenhuma escrita", async () => {
    state.respond = (op) => (op.table === "user_recipe_prefs" ? { data: null, error: { code: "PGRST205", message: "Could not find the table" } } : { data: null, error: null });
    expect(await recordRecipeView(client(), USER, RECIPE)).toBe("unavailable");
    expect(state.ops.some((o) => o.table === "recipe_view_history")).toBe(false);
  });
});

describe("actions da coleção", () => {
  it("ligar grava só history_enabled (a data do consentimento é do banco) e recarrega a coleção", async () => {
    const result = await setRecipeHistory({ enabled: true });
    expect(result).toEqual({ ok: true, enabled: true });
    const upsert = state.ops.find((o) => o.op === "upsert");
    expect(upsert).toMatchObject({ table: "user_recipe_prefs", payload: { user_id: USER, history_enabled: true }, options: { onConflict: "user_id" } });
    expect(Object.keys(upsert?.payload as object)).not.toContain("history_enabled_at");
    expect(state.revalidated).toContain("/profile/receitas");
  });

  it("desligar sem confirmação é recusado e não escreve nada", async () => {
    state.respond = prefs(true);
    expect(await setRecipeHistory({ enabled: false })).toEqual({ ok: false, error: "confirmation_required" });
    expect(state.ops.some((o) => o.op !== "select")).toBe(false);
  });

  it("desligar com confirmação vira update da preferência (o gatilho apaga o histórico)", async () => {
    state.respond = prefs(true);
    expect(await setRecipeHistory({ enabled: false, confirm: true })).toEqual({ ok: true, enabled: false });
    const update = state.ops.find((o) => o.op === "update");
    expect(update).toMatchObject({ table: "user_recipe_prefs", payload: { history_enabled: false }, filters: [["user_id", USER]] });
  });

  it("já no estado pedido: não escreve", async () => {
    state.respond = prefs(true);
    expect(await setRecipeHistory({ enabled: true })).toEqual({ ok: true, enabled: true });
    expect(state.ops.some((o) => o.op !== "select")).toBe(false);
  });

  it("sem sessão, entrada inválida ou banco sem tabela", async () => {
    state.user = null;
    expect(await setRecipeHistory({ enabled: true })).toEqual({ ok: false, error: "unauthenticated" });
    state.user = { id: USER };
    expect(await setRecipeHistory({ enabled: "sim" } as never)).toEqual({ ok: false, error: "invalid_input" });
    state.respond = () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    expect(await setRecipeHistory({ enabled: true })).toEqual({ ok: false, error: "history_unavailable" });
  });

  it("limpar exige confirmação e apaga só o próprio histórico", async () => {
    expect(await clearRecipeHistory({ confirm: false } as never)).toEqual({ ok: false, error: "confirmation_required" });
    expect(state.ops).toEqual([]);
    expect(await clearRecipeHistory({ confirm: true })).toEqual({ ok: true });
    expect(state.ops).toEqual([{ table: "recipe_view_history", op: "delete", filters: [["user_id", USER]] }]);
  });

  it("tirar uma receita do histórico e remover das salvas", async () => {
    expect(await removeHistoryItem({ contentId: "x" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await removeHistoryItem({ contentId: RECIPE })).toEqual({ ok: true });
    expect(state.ops.at(-1)).toEqual({ table: "recipe_view_history", op: "delete", filters: [["user_id", USER], ["content_id", RECIPE]] });
    expect(await removeSavedRecipe({ contentId: RECIPE })).toEqual({ ok: true });
    expect(state.ops.at(-1)).toEqual({ table: "favorites", op: "delete", filters: [["user_id", USER], ["content_id", RECIPE]] });
    expect(state.events).toEqual(["favorite.remove"]);
    expect(state.revalidated).toEqual(expect.arrayContaining(["/profile/receitas", "/profile/favorites"]));
  });

  it("erro do banco vira código", async () => {
    state.respond = () => ({ data: null, error: { code: "42501", message: "permission denied for table favorites" } });
    expect(await removeSavedRecipe({ contentId: RECIPE })).toEqual({ ok: false, error: "permission denied for table favorites" });
  });
});

describe("parâmetros da coleção", () => {
  it("aba e categoria da URL, com padrão para valores desconhecidos", () => {
    expect(parseCollectionParams({})).toEqual({ tab: "salvas", category: null });
    expect(parseCollectionParams({ aba: "vistas" })).toEqual({ tab: "vistas", category: null });
    expect(parseCollectionParams({ aba: "xyz", cat: "almoco" })).toEqual({ tab: "salvas", category: "almoco" });
    expect(parseCollectionParams({ aba: "listas", cat: "almoco" })).toEqual({ tab: "listas", category: null });
    expect(parseCollectionParams({ cat: "<script>" })).toEqual({ tab: "salvas", category: null });
    expect(parseCollectionParams({ aba: ["vistas", "listas"] })).toEqual({ tab: "vistas", category: null });
  });

  it("links das abas e da categoria", () => {
    expect(collectionHref("salvas")).toBe("/profile/receitas");
    expect(collectionHref("salvas", "almoco")).toBe("/profile/receitas?cat=almoco");
    expect(collectionHref("vistas", "almoco")).toBe("/profile/receitas?aba=vistas");
  });

  it("categorias das salvas com contagem, na ordem do catálogo", () => {
    const links = [
      { content_id: "a", category_code: "almoco" },
      { content_id: "a", category_code: "marmitas" },
      { content_id: "b", category_code: "almoco" },
      { content_id: "z", category_code: "sopas" },
    ];
    expect(categoryCounts(links, ["a", "b"], ["cafe-da-manha", "almoco", "marmitas", "sopas"])).toEqual([
      { code: "almoco", count: 2 },
      { code: "marmitas", count: 1 },
    ]);
  });
});
