import { beforeEach, describe, expect, it, vi } from "vitest";
import { toggleFavorite } from "@/app/(app)/content/actions";
import { removeFavorite } from "@/app/(app)/profile/actions";
import type { ContentCardData, ProductCardData, ProgramCardData } from "@/lib/catalog/queries";
import { FAVORITE_SELECT, FAVORITE_SELECT_LEGACY, favoriteEventProps, favoriteRow, isMissingMixedFavoritesError, toFavoriteEntries, type FavoriteRow } from "@/lib/library/favorites";

// Favoritos com conteúdo, produto e programa (0041): a parte pura (linha gravada, eventos, montagem da
// tela) e as ações sem Next nem Supabase — cada tipo grava e apaga na sua coluna, repetido é
// ignorado, recusa da política vira mensagem e o banco sem a 0041 vira "favorite_unsupported".

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CONTENT: "5d1c6f0e-3f0a-4c1e-9f7a-2b8d4e6a1c33",
  PRODUCT: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  PROGRAM: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
}));

type DbError = { code?: string; message: string };
type Call = { table: string; op: string; payload?: unknown; options?: unknown; filters: [string, unknown][] };

const state = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  calls: [] as Call[],
  errors: {} as Record<string, DbError | undefined>,
  events: [] as { event: string; props: Record<string, unknown> }[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void state.revalidated.push(path) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user, getRoles: async () => [] }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async (event: string, props: Record<string, unknown>) => void state.events.push({ event, props }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null, hasAdminClient: () => false }));
vi.mock("@/i18n/actions", () => ({ setLocaleAction: async () => undefined }));
vi.mock("@/lib/theme/actions", () => ({ setThemeAction: async () => undefined }));
vi.mock("@/lib/recommendations/recalculate", () => ({ recalculateRecommendations: async () => ({ persisted: false }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      state.calls.push(call);
      const result = () => Promise.resolve({ data: null, error: state.errors[`${table}:${call.op}`] ?? null });
      const q: Record<string, unknown> = {
        select: () => q,
        upsert: (payload: unknown, options: unknown) => ((call.op = "upsert"), (call.payload = payload), (call.options = options), q),
        delete: () => ((call.op = "delete"), q),
        eq: (col: string, val: unknown) => (call.filters.push([col, val]), q),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject),
      };
      return q;
    },
  }),
}));

beforeEach(() => {
  state.user = { id: ids.USER };
  state.calls = [];
  state.errors = {};
  state.events = [];
  state.revalidated = [];
});

const favCalls = () => state.calls.filter((c) => c.table === "favorites");

// ---------------------------------------------------------------- parte pura
describe("favoriteRow e favoriteEventProps", () => {
  it("só a coluna do alvo vai na linha (o banco antigo aceita a de conteúdo)", () => {
    expect(favoriteRow(ids.USER, { kind: "content", id: ids.CONTENT })).toEqual({ user_id: ids.USER, content_id: ids.CONTENT });
    expect(favoriteRow(ids.USER, { kind: "product", id: ids.PRODUCT })).toEqual({ user_id: ids.USER, product_id: ids.PRODUCT });
    expect(favoriteRow(ids.USER, { kind: "program", id: ids.PROGRAM })).toEqual({ user_id: ids.USER, program_id: ids.PROGRAM });
  });

  it("content_id no evento só para conteúdo (série antiga do painel); item_type/item_id sempre", () => {
    expect(favoriteEventProps({ kind: "content", id: ids.CONTENT })).toEqual({ content_id: ids.CONTENT, item_type: "content", item_id: ids.CONTENT });
    expect(favoriteEventProps({ kind: "product", id: ids.PRODUCT }, "profile")).toEqual({ item_type: "product", item_id: ids.PRODUCT, source: "profile" });
  });

  it("detecta banco sem a 0041 e não confunde com recusa da RLS", () => {
    expect(isMissingMixedFavoritesError({ code: "42703", message: "column favorites.item_type does not exist" })).toBe(true);
    expect(isMissingMixedFavoritesError({ code: "PGRST204", message: "Could not find the 'product_id' column of 'favorites' in the schema cache" })).toBe(true);
    expect(isMissingMixedFavoritesError({ code: "PGRST200", message: "Could not find a relationship between 'favorites' and 'programs'" })).toBe(true);
    expect(isMissingMixedFavoritesError({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(isMissingMixedFavoritesError(null)).toBe(false);
  });

  it("o select novo embute os três alvos; o antigo, só conteúdo", () => {
    expect(FAVORITE_SELECT).toMatch(/item_type/);
    expect(FAVORITE_SELECT).toMatch(/product:products\(/);
    expect(FAVORITE_SELECT).toMatch(/program:programs\(/);
    expect(FAVORITE_SELECT_LEGACY).not.toMatch(/product|program|item_type/);
  });
});

const content = (id: string, title: string) => ({ id, title, slug: "c" }) as unknown as ContentCardData;
const product = (id: string, title: string) => ({ id, title, slug: "p" }) as unknown as ProductCardData;
const program = (id: string, title: string) => ({ id, slug: "programa-x", version: { title } }) as unknown as ProgramCardData;

describe("toFavoriteEntries", () => {
  it("mistura os três tipos, do mais recente ao mais antigo, cada um com o seu card", () => {
    const rows: FavoriteRow[] = [
      { id: "a", item_type: "content", created_at: "2026-10-01T10:00:00Z", content: content(ids.CONTENT, "Sono"), product: null, program: null },
      { id: "b", item_type: "product", created_at: "2026-10-03T10:00:00Z", content: null, product: product(ids.PRODUCT, "e.creatina Pó"), program: null },
      { id: "c", item_type: "program", created_at: "2026-10-02T10:00:00Z", content: null, product: null, program: program(ids.PROGRAM, "Manhãs com Intenção") },
    ];
    expect(toFavoriteEntries(rows).map((e) => [e.kind, e.id, e.title, e.key])).toEqual([
      ["product", ids.PRODUCT, "e.creatina Pó", "b"],
      ["program", ids.PROGRAM, "Manhãs com Intenção", "c"],
      ["content", ids.CONTENT, "Sono", "a"],
    ]);
  });

  it("alvo escondido pela RLS some; linha do banco antigo (sem id nem item_type) vira conteúdo", () => {
    const entries = toFavoriteEntries([
      { id: "x", item_type: "product", created_at: "2026-10-05T10:00:00Z", product: null },
      { created_at: "2026-10-01T10:00:00Z", content: content(ids.CONTENT, "Antigo") },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "content", key: `content:${ids.CONTENT}`, title: "Antigo" });
  });
});

// ---------------------------------------------------------------- ações
describe("toggleFavorite", () => {
  it.each([
    ["content", "content_id", ids.CONTENT, "/content/sono"],
    ["product", "product_id", ids.PRODUCT, "/shop/e-creatina-po"],
    ["program", "program_id", ids.PROGRAM, "/programs/manhas-com-intencao"],
  ] as const)("%s: favorita gravando só a coluna do alvo, ignora repetido e revalida a página", async (kind, column, id, path) => {
    expect(await toggleFavorite({ target: { kind, id }, favorite: true, path })).toEqual({ ok: true, favorite: true });
    const [call] = favCalls();
    expect(call.op).toBe("upsert");
    expect(call.payload).toEqual({ user_id: ids.USER, [column]: id });
    expect(call.options).toEqual({ onConflict: `user_id,${column}`, ignoreDuplicates: true });
    expect(state.events[0]).toMatchObject({ event: "favorite.add", props: { item_type: kind, item_id: id } });
    expect(state.revalidated).toEqual([path]);
  });

  it.each([
    ["content", "content_id", ids.CONTENT],
    ["product", "product_id", ids.PRODUCT],
    ["program", "program_id", ids.PROGRAM],
  ] as const)("%s: desfavorita apagando pela coluna do tipo, só da própria conta", async (kind, column, id) => {
    expect(await toggleFavorite({ target: { kind, id }, favorite: false })).toEqual({ ok: true, favorite: false });
    expect(favCalls()[0]).toMatchObject({ op: "delete", filters: [["user_id", ids.USER], [column, id]] });
    expect(state.events[0]).toMatchObject({ event: "favorite.remove", props: { item_type: kind } });
  });

  it("recusa da política (produto fora do ar, programa não publicado) vira favorite_item_unavailable", async () => {
    state.errors["favorites:upsert"] = { code: "42501", message: 'new row violates row-level security policy "favorites_target_public"' };
    expect(await toggleFavorite({ target: { kind: "program", id: ids.PROGRAM }, favorite: true })).toEqual({ ok: false, error: "favorite_item_unavailable" });
    expect(state.events).toHaveLength(0);
  });

  it("banco sem a 0041 responde favorite_unsupported", async () => {
    state.errors["favorites:upsert"] = { code: "PGRST204", message: "Could not find the 'product_id' column of 'favorites' in the schema cache" };
    expect(await toggleFavorite({ target: { kind: "product", id: ids.PRODUCT }, favorite: true })).toEqual({ ok: false, error: "favorite_unsupported" });
  });

  it("valida a entrada (tipo, id, caminho) e exige sessão", async () => {
    expect(await toggleFavorite({ target: { kind: "recipe" as never, id: ids.CONTENT }, favorite: true })).toEqual({ ok: false, error: "invalid_input" });
    expect(await toggleFavorite({ target: { kind: "product", id: "e-creatina-po" }, favorite: true })).toEqual({ ok: false, error: "invalid_input" });
    expect(await toggleFavorite({ target: { kind: "product", id: ids.PRODUCT }, favorite: true, path: "/admin/x" })).toEqual({ ok: false, error: "invalid_input" });
    state.user = null;
    expect(await toggleFavorite({ target: { kind: "product", id: ids.PRODUCT }, favorite: true })).toEqual({ ok: false, error: "unauthenticated" });
    expect(favCalls()).toHaveLength(0);
  });
});

describe("removeFavorite (Perfil › Favoritos)", () => {
  it.each([
    ["content", "content_id", ids.CONTENT],
    ["product", "product_id", ids.PRODUCT],
    ["program", "program_id", ids.PROGRAM],
  ] as const)("%s: apaga pela coluna do tipo e revalida a página", async (kind, column, id) => {
    expect(await removeFavorite({ target: { kind, id } })).toEqual({ ok: true });
    expect(favCalls()[0]).toMatchObject({ op: "delete", filters: [["user_id", ids.USER], [column, id]] });
    expect(state.events[0]).toMatchObject({ event: "favorite.remove", props: { item_type: kind, item_id: id, source: "profile" } });
    expect(state.revalidated).toContain("/profile/favorites");
  });

  it("valida a entrada e exige sessão", async () => {
    expect(await removeFavorite({ target: { kind: "recipe" as never, id: ids.CONTENT } })).toEqual({ ok: false, error: "invalid_input" });
    state.user = null;
    expect(await removeFavorite({ target: { kind: "content", id: ids.CONTENT } })).toEqual({ ok: false, error: "unauthenticated" });
    expect(favCalls()).toHaveLength(0);
  });
});
