import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appliesOn,
  parseReminderCheck,
  reminderErrorCode,
  reminderSchema,
  shortTime,
  sortReminders,
  splitReminders,
  timeToMinutes,
  toReminderRow,
  weekdayOf,
  weekdaysLabel,
  type ReminderRow,
} from "@/lib/routine/reminders";

// Lembretes (Q5): validação compartilhada (a mesma do antigo "Adicionar item" do Hoje), regras de dia e
// ordem, e as server actions sem Next nem Supabase. Marcar não devolve sequência (Q10, 0037).

type Res = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  writes: [] as { op: string; table: string; payload?: unknown; filters: [string, unknown][] }[],
  writeResult: { data: [{ id: "r1" }], error: null } as { data: unknown; error: { message: string } | null },
  rpc: { data: null, error: null } as { data: unknown; error: { message: string } | null },
  rpcCalls: [] as { fn: string; args: unknown }[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user }));

function chain(table: string) {
  let op = "select";
  let payload: unknown;
  const filters: [string, unknown][] = [];
  const result = async (): Promise<Res> => {
    state.writes.push({ op, table, payload, filters: [...filters] });
    return state.writeResult;
  };
  const c: Record<string, unknown> = {
    select: () => c,
    insert: (p: unknown) => ((op = "insert"), (payload = p), c),
    update: (p: unknown) => ((op = "update"), (payload = p), c),
    delete: () => ((op = "delete"), c),
    eq: (k: string, v: unknown) => (filters.push([k, v]), c),
    single: async () => {
      const r = await result();
      return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error };
    },
    then: (resolve: (v: unknown) => void) => result().then(resolve),
  };
  return c;
}
const client = {
  from: (table: string) => chain(table),
  rpc: async (fn: string, args: unknown) => {
    state.rpcCalls.push({ fn, args });
    return state.rpc;
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

const ITEM = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function row(overrides: Partial<ReminderRow> & { id: string }): ReminderRow {
  return { title: overrides.id, note: null, time_of_day: null, weekdays: null, active: true, sort_order: 100, ...overrides };
}

describe("reminderSchema + toReminderRow (mesma validação do servidor de antes)", () => {
  it("aceita título de 1 a 80 caracteres (aparado), nota até 120, horário HH:MM e dias 0–6", () => {
    expect(reminderSchema.safeParse({ title: "  Alongar  " }).success).toBe(true);
    expect(reminderSchema.safeParse({ title: "a".repeat(80), note: "n".repeat(120), timeOfDay: "23:59", weekdays: [0, 6] }).success).toBe(true);
    expect(reminderSchema.safeParse({ title: "x", timeOfDay: "" }).success).toBe(true);
    expect(reminderSchema.safeParse({ title: "x", timeOfDay: null, weekdays: null, note: null }).success).toBe(true);
  });

  it("recusa título vazio ou longo, nota longa, horário inválido e dias fora de 0–6 ou vazios", () => {
    for (const bad of [
      { title: "   " },
      { title: "a".repeat(81) },
      { title: "x", note: "n".repeat(121) },
      { title: "x", timeOfDay: "24:00" },
      { title: "x", timeOfDay: "7:00" },
      { title: "x", timeOfDay: "07:60" },
      { title: "x", weekdays: [] },
      { title: "x", weekdays: [7] },
      { title: "x", weekdays: [-1] },
      { title: "x", weekdays: [1.5] },
      { title: "x", weekdays: [0, 1, 2, 3, 4, 5, 6, 0] },
    ]) {
      expect(reminderSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("normaliza: título aparado, nota vazia vira null, horário ganha segundos, dias sem repetição e ordenados, 7 dias = null", () => {
    const parse = (input: unknown) => toReminderRow(reminderSchema.parse(input));
    expect(parse({ title: "  Ler  ", note: "  ", timeOfDay: "07:30", weekdays: [5, 1, 1, 3] })).toEqual({ title: "Ler", note: null, time_of_day: "07:30:00", weekdays: [1, 3, 5] });
    expect(parse({ title: "Ler", weekdays: [6, 5, 4, 3, 2, 1, 0] }).weekdays).toBeNull();
    expect(parse({ title: "Ler", timeOfDay: "" }).time_of_day).toBeNull();
    expect(parse({ title: "Ler", note: " nota " }).note).toBe("nota");
  });
});

describe("códigos de erro e resposta da marcação", () => {
  it("traduz só os códigos conhecidos; o resto vira failed", () => {
    expect(reminderErrorCode("routine_limit")).toBe("routine_limit");
    expect(reminderErrorCode("routine_item_not_found: x")).toBe("routine_item_not_found");
    expect(reminderErrorCode("invalid_timezone")).toBe("invalid_timezone");
    expect(reminderErrorCode("duplicate key value")).toBe("failed");
    expect(reminderErrorCode(null)).toBe("failed");
  });

  it("parseReminderCheck devolve só done e data, mesmo se o banco antigo mandar a sequência", () => {
    expect(parseReminderCheck({ done: true, local_date: "2026-10-23", streak: 9 })).toEqual({ done: true, localDate: "2026-10-23" });
    expect(parseReminderCheck(null)).toEqual({ done: false, localDate: "" });
    expect(parseReminderCheck({ done: "true" })).toEqual({ done: false, localDate: "" });
  });
});

describe("dias e ordem", () => {
  it("weekdayOf usa 0 = domingo sem depender do fuso e recusa formato errado", () => {
    expect(weekdayOf("2026-10-18")).toBe(0);
    expect(weekdayOf("2026-10-23")).toBe(5);
    expect(() => weekdayOf("23/10/2026")).toThrow();
  });

  it("appliesOn: todos os dias, só os dias escolhidos, nunca inativo", () => {
    expect(appliesOn({ weekdays: null, active: true }, "2026-10-23")).toBe(true);
    expect(appliesOn({ weekdays: [1, 3, 5], active: true }, "2026-10-23")).toBe(true);
    expect(appliesOn({ weekdays: [0, 6], active: true }, "2026-10-23")).toBe(false);
    expect(appliesOn({ weekdays: null, active: false }, "2026-10-23")).toBe(false);
  });

  it("timeToMinutes/shortTime aceitam HH:MM e HH:MM:SS e recusam inválidos", () => {
    expect(timeToMinutes("07:30:00")).toBe(450);
    expect(timeToMinutes("25:00")).toBeNull();
    expect(shortTime("7:05")).toBe("07:05");
    expect(shortTime(null)).toBeNull();
  });

  it("sortReminders: com horário primeiro (crescente), depois por sort_order e título, sem mexer na lista", () => {
    const list = [row({ id: "z", title: "Zeta" }), row({ id: "late", time_of_day: "21:00:00" }), row({ id: "a", title: "Alfa" }), row({ id: "early", time_of_day: "06:15:00" }), row({ id: "first", sort_order: 1 })];
    expect(sortReminders(list).map((i) => i.id)).toEqual(["early", "late", "first", "a", "z"]);
    expect(list[0].id).toBe("z");
  });

  it("splitReminders separa hoje e outros dias e ignora inativos", () => {
    const { today, other } = splitReminders(
      [row({ id: "weekend", weekdays: [0, 6] }), row({ id: "all", time_of_day: "08:00:00" }), row({ id: "friday", weekdays: [5] }), row({ id: "off", active: false })],
      "2026-10-23",
    );
    expect(today.map((i) => i.id)).toEqual(["all", "friday"]);
    expect(other.map((i) => i.id)).toEqual(["weekend"]);
  });

  it("weekdaysLabel começa na segunda, no idioma; todo dia = null", () => {
    expect(weekdaysLabel([5, 1, 3], "pt-BR")).toBe("Seg, Qua, Sex");
    expect(weekdaysLabel([0, 6], "en")).toBe("Sat, Sun");
    expect(weekdaysLabel(null, "es")).toBeNull();
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6], "pt-BR")).toBeNull();
  });
});

describe("server actions dos lembretes", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.writes = [];
    state.writeResult = { data: [{ id: "r1" }], error: null };
    state.rpc = { data: null, error: null };
    state.rpcCalls = [];
    state.revalidated = [];
  });

  it("criar: valida antes de tocar no banco, grava com o user_id da sessão e revalida a lista e o Perfil", async () => {
    const { createReminder } = await import("@/app/(app)/profile/lembretes/actions");
    expect(await createReminder({ title: " " })).toEqual({ ok: false, error: "invalid" });
    expect(state.writes).toHaveLength(0);

    const forged = { title: "Ler", weekdays: [3, 1], user_id: "outra-pessoa" } as unknown as Parameters<typeof createReminder>[0];
    expect(await createReminder(forged)).toEqual({ ok: true, id: "r1" });
    expect(state.writes[0]).toMatchObject({ op: "insert", table: "routine_items", payload: { user_id: "u1", title: "Ler", weekdays: [1, 3], note: null, time_of_day: null } });
    expect(state.revalidated).toEqual(["/profile/lembretes", "/profile"]);
  });

  it("criar: sem sessão → unauthenticated; limite do banco → routine_limit", async () => {
    const { createReminder } = await import("@/app/(app)/profile/lembretes/actions");
    state.user = null;
    expect(await createReminder({ title: "Ler" })).toEqual({ ok: false, error: "unauthenticated" });
    state.user = { id: "u1" };
    state.writeResult = { data: null, error: { message: "routine_limit" } };
    expect(await createReminder({ title: "Ler" })).toEqual({ ok: false, error: "routine_limit" });
  });

  it("editar e excluir filtram pelo dono e respondem routine_item_not_found quando nada muda", async () => {
    const { updateReminder, deleteReminder } = await import("@/app/(app)/profile/lembretes/actions");
    expect(await updateReminder({ itemId: "nao-uuid", title: "x" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateReminder({ itemId: ITEM, title: "Ler mais", timeOfDay: "21:00" })).toEqual({ ok: true });
    expect(state.writes[0]).toMatchObject({ op: "update", payload: { title: "Ler mais", time_of_day: "21:00:00" }, filters: [["id", ITEM], ["user_id", "u1"]] });
    expect(await deleteReminder({ itemId: ITEM })).toEqual({ ok: true });
    expect(state.writes[1]).toMatchObject({ op: "delete", table: "routine_items", filters: [["id", ITEM], ["user_id", "u1"]] });

    state.writeResult = { data: [], error: null };
    expect(await updateReminder({ itemId: ITEM, title: "x" })).toEqual({ ok: false, error: "routine_item_not_found" });
    expect(await deleteReminder({ itemId: ITEM })).toEqual({ ok: false, error: "routine_item_not_found" });
  });

  it("marcar feito hoje: chama routine_check com o fuso e não devolve sequência", async () => {
    const { toggleReminder } = await import("@/app/(app)/profile/lembretes/actions");
    expect(await toggleReminder({ itemId: ITEM, done: true, timezone: "Marte/Olympus" })).toEqual({ ok: false, error: "invalid_timezone" });
    expect(state.rpcCalls).toHaveLength(0);

    // banco ainda sem a 0037: a RPC devolve streak, que não pode chegar à interface
    state.rpc = { data: { done: true, local_date: "2026-10-23", streak: 5 }, error: null };
    const result = await toggleReminder({ itemId: ITEM, done: true, timezone: "America/Sao_Paulo" });
    expect(result).toEqual({ ok: true, done: true, localDate: "2026-10-23" });
    expect(result).not.toHaveProperty("streak");
    expect(state.rpcCalls[0]).toEqual({ fn: "routine_check", args: { p_item: ITEM, p_timezone: "America/Sao_Paulo", p_done: true } });

    state.rpc = { data: null, error: { message: "routine_item_not_found" } };
    expect(await toggleReminder({ itemId: ITEM, done: false, timezone: "UTC" })).toEqual({ ok: false, error: "routine_item_not_found" });
  });
});
