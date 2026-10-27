import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToList, createListAndAdd, getMyLists, removeFromList } from "@/app/(app)/content/actions";
import { removeListItem } from "@/app/(app)/explore/actions";
import type { ContentCardData, ProductCardData, ProgramCardData } from "@/lib/catalog/queries";
import {
  isMissingMixedListsError,
  listContains,
  listTargetSchema,
  targetColumn,
  toListEntries,
  visibleItemCount,
  type ListItemRow,
} from "@/lib/library/list-items";

// Listas com conteúdo, produto e programa (0040): a parte pura (alvo, ordem, contagem, detecção do
// banco sem a migração) e as ações sem Next nem Supabase — cada tipo grava na sua coluna, repetido é
// ignorado, recusa da política vira mensagem e o banco antigo cai no modo "só conteúdos".

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  LIST: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  CONTENT: "5d1c6f0e-3f0a-4c1e-9f7a-2b8d4e6a1c33",
  PRODUCT: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  PROGRAM: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
}));

type DbError = { code?: string; message: string };
type Call = { table: string; op: string; payload?: unknown; options?: unknown; select?: string; filters: [string, unknown][] };

const state = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  calls: [] as Call[],
  // resposta por "tabela:operação" (fila: a primeira vale para a 1ª chamada, e assim por diante)
  responses: {} as Record<string, { data?: unknown; error?: DbError | null }[]>,
  events: [] as { event: string; props: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async (event: string, props: Record<string, unknown>) => void state.events.push({ event, props }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      state.calls.push(call);
      const result = () => {
        const queue = state.responses[`${table}:${call.op}`];
        const next = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
        return Promise.resolve({ data: next?.data ?? null, error: next?.error ?? null });
      };
      const q: Record<string, unknown> = {
        select: (cols?: string) => {
          if (call.op === "select") call.select = cols;
          return q;
        },
        insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), q),
        upsert: (payload: unknown, options: unknown) => ((call.op = "upsert"), (call.payload = payload), (call.options = options), q),
        update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), q),
        delete: () => ((call.op = "delete"), q),
        eq: (col: string, val: unknown) => (call.filters.push([col, val]), q),
        order: () => q,
        limit: () => q,
        single: result,
        maybeSingle: result,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject),
      };
      return q;
    },
  }),
}));
// as ações do Explorar importam renderizadores de RSC que não interessam aqui
vi.mock("@/components/discover/explore/feed", () => ({ exploreFeedPage: async () => ({ items: [], hasMore: false, nextOffset: 0 }) }));
vi.mock("@/components/discover/explore/renderTiles", () => ({ renderContentTiles: () => null }));
vi.mock("@/components/recipes/catalog/renderRecipeCards", () => ({ renderRecipeCards: () => null }));
vi.mock("@/lib/recipes/catalog", () => ({ fetchRecipeCatalog: async () => ({ items: [], nextCursor: null }) }));

beforeEach(() => {
  state.user = { id: ids.USER };
  state.calls = [];
  state.responses = {};
  state.events = [];
});

const listItemCalls = () => state.calls.filter((c) => c.table === "list_items");

// ---------------------------------------------------------------- parte pura
describe("alvo do item", () => {
  it("cada tipo grava na sua coluna", () => {
    expect(targetColumn("content")).toBe("content_id");
    expect(targetColumn("product")).toBe("product_id");
    expect(targetColumn("program")).toBe("program_id");
  });

  it("aceita só os três tipos e id uuid", () => {
    expect(listTargetSchema.safeParse({ kind: "product", id: ids.PRODUCT }).success).toBe(true);
    expect(listTargetSchema.safeParse({ kind: "recipe", id: ids.PRODUCT }).success).toBe(false);
    expect(listTargetSchema.safeParse({ kind: "program", id: "e-creatina-po" }).success).toBe(false);
  });

  it("listContains olha a coluna do tipo pedido", () => {
    const items = [{ content_id: ids.CONTENT, product_id: null, program_id: null }, { content_id: null, product_id: ids.PRODUCT, program_id: null }];
    expect(listContains(items, { kind: "product", id: ids.PRODUCT })).toBe(true);
    expect(listContains(items, { kind: "program", id: ids.PRODUCT })).toBe(false);
    expect(listContains(null, { kind: "content", id: ids.CONTENT })).toBe(false);
    // linha antiga (sem as colunas novas) continua respondendo para conteúdo
    expect(listContains([{ content_id: ids.CONTENT }], { kind: "content", id: ids.CONTENT })).toBe(true);
  });
});

describe("isMissingMixedListsError (banco sem a 0040)", () => {
  it("reconhece coluna inexistente, coluna fora do cache e relação inexistente", () => {
    expect(isMissingMixedListsError({ code: "42703", message: "column list_items_1.product_id does not exist" })).toBe(true);
    expect(isMissingMixedListsError({ code: "PGRST204", message: "Could not find the 'product_id' column of 'list_items' in the schema cache" })).toBe(true);
    expect(isMissingMixedListsError({ code: "PGRST200", message: "Could not find a relationship between 'list_items' and 'products'" })).toBe(true);
    expect(isMissingMixedListsError({ message: "column item_type does not exist" })).toBe(true);
  });

  it("não confunde com recusa da RLS, repetido ou ausência de erro", () => {
    expect(isMissingMixedListsError({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(isMissingMixedListsError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isMissingMixedListsError(null)).toBe(false);
  });
});

const content = (id: string, title: string) => ({ id, title, slug: title.toLowerCase() }) as unknown as ContentCardData;
const product = (id: string, title: string) => ({ id, title, slug: "p" }) as unknown as ProductCardData;
const program = (id: string, title: string | null) => ({ id, slug: "programa-x", version: title ? { title } : null }) as unknown as ProgramCardData;

describe("toListEntries", () => {
  it("mistura os três tipos por posição; empate, o mais recente primeiro", () => {
    const rows: ListItemRow[] = [
      { id: "a", item_type: "content", position: 0, added_at: "2026-10-01T10:00:00Z", content: content(ids.CONTENT, "Conteúdo"), product: null, program: null },
      { id: "b", item_type: "product", position: 0, added_at: "2026-10-03T10:00:00Z", content: null, product: product(ids.PRODUCT, "e.creatina Pó"), program: null },
      { id: "c", item_type: "program", position: 1, added_at: "2026-10-05T10:00:00Z", content: null, product: null, program: program(ids.PROGRAM, "Manhãs com Intenção") },
    ];
    const entries = toListEntries(rows);
    expect(entries.map((e) => [e.kind, e.title, e.key])).toEqual([
      ["product", "e.creatina Pó", "b"],
      ["content", "Conteúdo", "a"],
      ["program", "Manhãs com Intenção", "c"],
    ]);
    expect(entries.map((e) => e.id)).toEqual([ids.PRODUCT, ids.CONTENT, ids.PROGRAM]);
  });

  it("alvo escondido pela RLS (despublicado) some da lista", () => {
    const rows: ListItemRow[] = [
      { id: "a", item_type: "product", position: 0, added_at: "2026-10-01T10:00:00Z", product: null },
      { id: "b", item_type: "program", position: 0, added_at: "2026-10-01T10:00:00Z", program: null },
      { id: "c", item_type: "content", position: 0, added_at: "2026-10-01T10:00:00Z", content: content(ids.CONTENT, "Fica") },
    ];
    expect(toListEntries(rows).map((e) => e.title)).toEqual(["Fica"]);
  });

  it("linhas do banco antigo (sem id nem item_type) viram conteúdo com chave pelo id do conteúdo", () => {
    const entries = toListEntries([{ position: 0, added_at: "2026-10-01T10:00:00Z", content: content(ids.CONTENT, "Antigo") }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "content", key: `content:${ids.CONTENT}`, title: "Antigo" });
  });

  it("programa sem versão usa o slug como título; embed em array também vale", () => {
    const entries = toListEntries([{ id: "x", item_type: "program", added_at: "2026-10-01T10:00:00Z", program: [program(ids.PROGRAM, null)] }]);
    expect(entries[0]).toMatchObject({ kind: "program", title: "programa-x" });
  });
});

describe("visibleItemCount", () => {
  it("conta só itens com alvo visível (a mesma conta da página da lista)", () => {
    expect(visibleItemCount([{ content: { id: "1" } }, { product: { id: "2" } }, { program: { id: "3" } }, { content: null, product: null, program: null }])).toBe(3);
    expect(visibleItemCount([{ content: { id: "1" } }, { content: null }])).toBe(1);
    expect(visibleItemCount(null)).toBe(0);
  });
});

// ---------------------------------------------------------------- ações
describe("addToList", () => {
  it.each([
    ["content", "content_id", ids.CONTENT],
    ["product", "product_id", ids.PRODUCT],
    ["program", "program_id", ids.PROGRAM],
  ] as const)("%s: grava só a coluna do alvo e ignora repetido", async (kind, column, id) => {
    const result = await addToList({ listId: ids.LIST, target: { kind, id } });
    expect(result).toEqual({ ok: true });
    const [call] = listItemCalls();
    expect(call.op).toBe("upsert");
    expect(call.payload).toEqual({ list_id: ids.LIST, [column]: id });
    expect(call.options).toEqual({ onConflict: `list_id,${column}`, ignoreDuplicates: true });
    expect(state.events[0]).toMatchObject({ event: "list.add", props: { item_type: kind, item_id: id, list_id: ids.LIST } });
    // a série antiga do painel (content_id) continua só para conteúdo
    expect("content_id" in state.events[0].props).toBe(kind === "content");
  });

  it("recusa da política (produto fora do ar, programa não publicado) vira list_item_unavailable", async () => {
    state.responses["list_items:upsert"] = [{ error: { code: "42501", message: 'new row violates row-level security policy "list_items_target_public"' } }];
    expect(await addToList({ listId: ids.LIST, target: { kind: "product", id: ids.PRODUCT } })).toEqual({ ok: false, error: "list_item_unavailable" });
    expect(state.events).toHaveLength(0);
  });

  it("banco sem a 0040 responde list_unsupported", async () => {
    state.responses["list_items:upsert"] = [{ error: { code: "PGRST204", message: "Could not find the 'program_id' column of 'list_items' in the schema cache" } }];
    expect(await addToList({ listId: ids.LIST, target: { kind: "program", id: ids.PROGRAM } })).toEqual({ ok: false, error: "list_unsupported" });
  });

  it("valida a entrada e exige sessão", async () => {
    expect(await addToList({ listId: "x", target: { kind: "product", id: ids.PRODUCT } })).toEqual({ ok: false, error: "invalid_input" });
    expect(await addToList({ listId: ids.LIST, target: { kind: "recipe" as never, id: ids.PRODUCT } })).toEqual({ ok: false, error: "invalid_input" });
    state.user = null;
    expect(await addToList({ listId: ids.LIST, target: { kind: "product", id: ids.PRODUCT } })).toEqual({ ok: false, error: "unauthenticated" });
    expect(listItemCalls()).toHaveLength(0);
  });
});

describe("getMyLists", () => {
  it("marca a lista que já tem o produto e conta todos os itens", async () => {
    state.responses["custom_lists:select"] = [
      {
        data: [
          { id: "l1", name: "Suplementos", items: [{ content_id: null, product_id: ids.PRODUCT, program_id: null }, { content_id: ids.CONTENT, product_id: null, program_id: null }] },
          { id: "l2", name: "Treinos", items: [] },
        ],
      },
    ];
    const result = await getMyLists({ target: { kind: "product", id: ids.PRODUCT } });
    expect(result).toEqual({
      ok: true,
      lists: [
        { id: "l1", name: "Suplementos", count: 2, contains: true },
        { id: "l2", name: "Treinos", count: 0, contains: false },
      ],
    });
    expect(state.calls[0].select).toContain("items:list_items(content_id, product_id, program_id)");
  });

  it("banco sem a 0040: conteúdo cai na leitura antiga; produto responde list_unsupported", async () => {
    const missing = { code: "42703", message: "column list_items_1.product_id does not exist" };
    state.responses["custom_lists:select"] = [{ error: missing }, { data: [{ id: "l1", name: "Antiga", items: [{ content_id: ids.CONTENT }] }] }];
    expect(await getMyLists({ target: { kind: "content", id: ids.CONTENT } })).toEqual({ ok: true, lists: [{ id: "l1", name: "Antiga", count: 1, contains: true }] });
    expect(state.calls.map((c) => c.select)).toEqual(["id, name, items:list_items(content_id, product_id, program_id)", "id, name, items:list_items(content_id)"]);

    state.calls = [];
    state.responses["custom_lists:select"] = [{ error: missing }];
    expect(await getMyLists({ target: { kind: "product", id: ids.PRODUCT } })).toEqual({ ok: false, error: "list_unsupported" });
    expect(state.calls).toHaveLength(1);
  });
});

describe("removeFromList e removeListItem", () => {
  it("apagam pela coluna do tipo, na lista certa", async () => {
    expect(await removeFromList({ listId: ids.LIST, target: { kind: "program", id: ids.PROGRAM } })).toEqual({ ok: true });
    expect(listItemCalls()[0]).toMatchObject({ op: "delete", filters: [["list_id", ids.LIST], ["program_id", ids.PROGRAM]] });

    state.calls = [];
    expect(await removeListItem({ listId: ids.LIST, target: { kind: "product", id: ids.PRODUCT } })).toEqual({ ok: true });
    expect(listItemCalls()[0]).toMatchObject({ op: "delete", filters: [["list_id", ids.LIST], ["product_id", ids.PRODUCT]] });
    // a lista sobe para o topo (updated_at) depois da remoção
    expect(state.calls.some((c) => c.table === "custom_lists" && c.op === "update")).toBe(true);
  });

  it("removeListItem recusa tipo desconhecido", async () => {
    expect(await removeListItem({ listId: ids.LIST, target: { kind: "recipe" as never, id: ids.CONTENT } })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("createListAndAdd", () => {
  it("cria a lista já com o programa", async () => {
    state.responses["custom_lists:insert"] = [{ data: { id: ids.LIST, name: "Para começar" } }];
    const result = await createListAndAdd({ name: "  Para começar ", target: { kind: "program", id: ids.PROGRAM } });
    expect(result).toEqual({ ok: true, list: { id: ids.LIST, name: "Para começar", count: 1, contains: true } });
    expect(state.calls.find((c) => c.table === "custom_lists")?.payload).toEqual({ user_id: ids.USER, name: "Para começar" });
    expect(listItemCalls()[0]).toMatchObject({ op: "insert", payload: { list_id: ids.LIST, program_id: ids.PROGRAM } });
    expect(state.events[0].props).toMatchObject({ item_type: "program", created: true });
  });

  it("item recusado: desfaz a lista recém-criada e devolve o motivo", async () => {
    state.responses["custom_lists:insert"] = [{ data: { id: ids.LIST, name: "Suplementos" } }];
    state.responses["list_items:insert"] = [{ error: { code: "42501", message: "new row violates row-level security policy" } }];
    const result = await createListAndAdd({ name: "Suplementos", target: { kind: "product", id: ids.PRODUCT } });
    expect(result).toEqual({ ok: false, error: "list_item_unavailable" });
    expect(state.calls.some((c) => c.table === "custom_lists" && c.op === "delete" && c.filters.some(([k, v]) => k === "id" && v === ids.LIST))).toBe(true);
  });
});
