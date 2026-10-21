import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutineItem, deleteRoutineItem, toggleRoutineItem, updateRoutineItem } from "@/app/(app)/profile/today-actions";

// Server actions do "Hoje" sem Next nem Supabase: validação Zod, user_id vindo da sessão e mapeamento
// dos erros do banco (routine_limit, routine_item_not_found, invalid_timezone) para chaves de mensagem.
// Fluxos logados não têm E2E (sem contas de teste); esta é a cobertura da lógica das actions.

const USER_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ITEM_ID = "5d1f3a2e-8c4b-4e6f-9a7d-2b3c4d5e6f70";

const server = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  // Próximo erro devolvido pelo banco (mensagem no formato "codigo" ou "codigo: detalhe").
  nextError: null as string | null,
  // Linhas devolvidas por update().select(): vazio simula "não é seu / não existe" barrado pela RLS.
  updatedRows: [{ id: "5d1f3a2e-8c4b-4e6f-9a7d-2b3c4d5e6f70" }] as { id: string }[],
  rpcData: { done: true, local_date: "2026-10-21", streak: 3 } as unknown,
  writes: [] as { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void server.revalidated.push(path) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => server.user }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      server.rpcs.push({ fn, args });
      if (server.nextError) return { data: null, error: { message: server.nextError } };
      return { data: server.rpcData, error: null };
    },
    from: (table: string) => {
      const entry = { table, op: "", payload: undefined as Record<string, unknown> | undefined, filters: [] as [string, unknown][] };
      const result = () => (server.nextError ? { data: null, error: { message: server.nextError } } : { data: server.updatedRows, error: null });
      const chain = {
        eq: (column: string, value: unknown) => {
          entry.filters.push([column, value]);
          return chain;
        },
        select: () => ({ single: async () => (server.nextError ? { data: null, error: { message: server.nextError } } : { data: server.updatedRows[0], error: null }), then: (resolve: (v: unknown) => void) => resolve(result()) }),
        then: (resolve: (v: unknown) => void) => resolve(result()),
      };
      return {
        insert: (payload: Record<string, unknown>) => {
          entry.op = "insert";
          entry.payload = payload;
          server.writes.push(entry);
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          entry.op = "update";
          entry.payload = payload;
          server.writes.push(entry);
          return chain;
        },
        delete: () => {
          entry.op = "delete";
          server.writes.push(entry);
          return chain;
        },
      };
    },
  }),
}));

beforeEach(() => {
  server.user = { id: USER_ID };
  server.nextError = null;
  server.updatedRows = [{ id: ITEM_ID }];
  server.rpcData = { done: true, local_date: "2026-10-21", streak: 3 };
  server.writes.length = 0;
  server.rpcs.length = 0;
  server.revalidated.length = 0;
});

describe("createRoutineItem", () => {
  it("insere com user_id da sessão, normaliza horário e dias, e revalida Perfil e Evolução", async () => {
    const result = await createRoutineItem({ title: "  Alongar  ", note: "", timeOfDay: "07:30", weekdays: [5, 1, 1, 3] });
    expect(result).toEqual({ ok: true, id: ITEM_ID });
    expect(server.writes[0]).toMatchObject({ table: "routine_items", op: "insert", payload: { user_id: USER_ID, title: "Alongar", note: null, time_of_day: "07:30:00", weekdays: [1, 3, 5] } });
    expect(server.revalidated).toEqual(["/profile", "/evolution"]);
  });

  it("sete dias marcados viram null (todos os dias) e sem horário fica null", async () => {
    await createRoutineItem({ title: "Água", weekdays: [0, 1, 2, 3, 4, 5, 6], timeOfDay: "" });
    expect(server.writes[0].payload).toMatchObject({ time_of_day: null, weekdays: null });
  });

  it("recusa entrada inválida antes de tocar o banco", async () => {
    expect(await createRoutineItem({ title: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await createRoutineItem({ title: "x".repeat(81) })).toEqual({ ok: false, error: "invalid" });
    expect(await createRoutineItem({ title: "ok", timeOfDay: "25:00" })).toEqual({ ok: false, error: "invalid" });
    expect(await createRoutineItem({ title: "ok", weekdays: [7] })).toEqual({ ok: false, error: "invalid" });
    expect(await createRoutineItem({ title: "ok", weekdays: [] })).toEqual({ ok: false, error: "invalid" });
    expect(await createRoutineItem({ title: "ok", note: "n".repeat(121) })).toEqual({ ok: false, error: "invalid" });
    expect(server.writes).toHaveLength(0);
  });

  it("sem sessão devolve unauthenticated", async () => {
    server.user = null;
    expect(await createRoutineItem({ title: "ok" })).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("mapeia o gatilho de limite (routine_limit) e erros desconhecidos viram failed", async () => {
    server.nextError = "routine_limit";
    expect(await createRoutineItem({ title: "ok" })).toEqual({ ok: false, error: "routine_limit" });
    server.nextError = "new row violates row-level security policy";
    expect(await createRoutineItem({ title: "ok" })).toEqual({ ok: false, error: "failed" });
    expect(server.revalidated).toEqual([]);
  });
});

describe("updateRoutineItem", () => {
  it("atualiza filtrando por id e user_id da sessão", async () => {
    const result = await updateRoutineItem({ itemId: ITEM_ID, title: "Novo", note: "até 120", timeOfDay: null, weekdays: [0, 6] });
    expect(result).toEqual({ ok: true });
    expect(server.writes[0]).toMatchObject({ table: "routine_items", op: "update", payload: { title: "Novo", note: "até 120", time_of_day: null, weekdays: [0, 6] } });
    expect(server.writes[0].payload).not.toHaveProperty("user_id");
    expect(server.writes[0].filters).toEqual([
      ["id", ITEM_ID],
      ["user_id", USER_ID],
    ]);
  });

  it("sem linha afetada (item de outra pessoa ou apagado) devolve routine_item_not_found", async () => {
    server.updatedRows = [];
    expect(await updateRoutineItem({ itemId: ITEM_ID, title: "Novo" })).toEqual({ ok: false, error: "routine_item_not_found" });
    expect(server.revalidated).toEqual([]);
  });

  it("recusa id inválido", async () => {
    expect(await updateRoutineItem({ itemId: "nope", title: "Novo" })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("deleteRoutineItem", () => {
  it("apaga filtrando por id e user_id da sessão e revalida", async () => {
    expect(await deleteRoutineItem({ itemId: ITEM_ID })).toEqual({ ok: true });
    expect(server.writes[0]).toMatchObject({ table: "routine_items", op: "delete" });
    expect(server.writes[0].filters).toEqual([
      ["id", ITEM_ID],
      ["user_id", USER_ID],
    ]);
    expect(server.revalidated).toEqual(["/profile", "/evolution"]);
  });

  it("erro do banco vira failed", async () => {
    server.nextError = "permission denied for table routine_items";
    expect(await deleteRoutineItem({ itemId: ITEM_ID })).toEqual({ ok: false, error: "failed" });
  });
});

describe("toggleRoutineItem", () => {
  it("chama a RPC routine_check com item, fuso e done, e devolve a sequência", async () => {
    const result = await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "America/Sao_Paulo" });
    expect(result).toEqual({ ok: true, check: { done: true, localDate: "2026-10-21", streak: 3 } });
    expect(server.rpcs).toEqual([{ fn: "routine_check", args: { p_item: ITEM_ID, p_timezone: "America/Sao_Paulo", p_done: true } }]);
    expect(server.revalidated).toEqual(["/profile", "/evolution"]);
  });

  it("desmarcar passa p_done=false e tolera retorno parcial", async () => {
    server.rpcData = { done: false };
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: false, timezone: "UTC" })).toEqual({ ok: true, check: { done: false, localDate: "", streak: 0 } });
    expect(server.rpcs[0].args.p_done).toBe(false);
  });

  it("fuso inválido é barrado antes do banco como invalid_timezone", async () => {
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "Marte/Olympus" })).toEqual({ ok: false, error: "invalid_timezone" });
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "" })).toEqual({ ok: false, error: "invalid_timezone" });
    expect(server.rpcs).toHaveLength(0);
  });

  it("mapeia routine_item_not_found e invalid_timezone vindos do banco", async () => {
    server.nextError = "routine_item_not_found";
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "UTC" })).toEqual({ ok: false, error: "routine_item_not_found" });
    server.nextError = "invalid_timezone: detalhe";
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "UTC" })).toEqual({ ok: false, error: "invalid_timezone" });
    server.nextError = "unauthenticated";
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "UTC" })).toEqual({ ok: false, error: "unauthenticated" });
    expect(server.revalidated).toEqual([]);
  });

  it("sem sessão não chama a RPC", async () => {
    server.user = null;
    expect(await toggleRoutineItem({ itemId: ITEM_ID, done: true, timezone: "UTC" })).toEqual({ ok: false, error: "unauthenticated" });
    expect(server.rpcs).toHaveLength(0);
  });
});
