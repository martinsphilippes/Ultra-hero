import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dispatchPushOutbox } from "@/lib/push/dispatch";

// Cliente falso do Supabase: tabelas em memória, só o que o envio usa (select/in/eq/update/delete).
type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>, claim: Row[]) {
  const updates: { table: string; values: Row; ids: unknown[] }[] = [];
  const deletes: { table: string; values: unknown[] }[] = [];
  const from = (table: string) => {
    let filter: ((r: Row) => boolean) | null = null;
    const api = {
      select: () => api,
      in: (col: string, values: unknown[]) => {
        filter = (r) => values.includes(r[col]);
        return api;
      },
      eq: (col: string, value: unknown) => {
        filter = (r) => r[col] === value;
        return api;
      },
      then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: (tables[table] ?? []).filter((r) => (filter ? filter(r) : true)), error: null }),
      update: (values: Row) => ({
        in: async (_col: string, ids: unknown[]) => void updates.push({ table, values, ids }),
        eq: async (_col: string, id: unknown) => void updates.push({ table, values, ids: [id] }),
      }),
      delete: () => ({ in: async (_col: string, values: unknown[]) => void deletes.push({ table, values }) }),
    };
    return api;
  };
  const admin = { from, rpc: async () => ({ data: claim, error: null }) };
  return { admin: admin as never, updates, deletes };
}

const USER = "u1";
const TOKEN = "ExponentPushToken[abcdefghij]";
const baseTables = (prefs: Row) => ({
  push_tokens: [{ token: TOKEN, user_id: USER }],
  notification_preferences: [{ user_id: USER, channel_push: true, hero_posts: true, achievements: true, streak_reminders: true, ...prefs }],
  profiles: [{ id: USER, locale: "pt-BR" }],
  content: [{ id: "c1", slug: "treino", title: "Treino de hoje", status: "published", publish_at: null, creator: { name: "Neymar", status: "active" } }],
  programs: [],
  achievements: [{ code: "first_step", name: "Primeiro passo" }],
});
const postRow = { id: 1, user_id: USER, kind: "hero_post", payload: { content_id: "c1" }, attempts: 1 };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const expoReply = (tickets: unknown[]) => ({ ok: true, status: 200, json: async () => ({ data: tickets }) });

describe("dispatchPushOutbox", () => {
  it("envia o post do herói favorito no idioma da pessoa e marca como enviado", async () => {
    fetchMock.mockResolvedValue(expoReply([{ status: "ok", id: "t1" }]));
    const { admin, updates } = fakeAdmin(baseTables({}), [postRow]);
    const result = await dispatchPushOutbox(admin);
    expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual([{ to: TOKEN, title: "Neymar postou", body: "Treino de hoje", data: { url: "/content/treino", kind: "hero_post" }, sound: "default", channelId: "default" }]);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(updates).toContainEqual({ table: "push_outbox", values: expect.objectContaining({ outcome: "sent" }), ids: [1] });
  });

  it("consentimento retirado depois da fila: não envia", async () => {
    const { admin, updates } = fakeAdmin(baseTables({ hero_posts: false }), [postRow]);
    const result = await dispatchPushOutbox(admin);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(updates[0].values).toMatchObject({ outcome: "skipped_consent" });
  });

  it("post que saiu do ar antes do envio: não envia", async () => {
    const tables = baseTables({});
    tables.content[0].status = "draft";
    const { admin, updates } = fakeAdmin(tables, [postRow]);
    await dispatchPushOutbox(admin);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates[0].values).toMatchObject({ outcome: "skipped_stale" });
  });

  it("aparelho desinstalado: o token é apagado e a linha não volta à fila", async () => {
    fetchMock.mockResolvedValue(expoReply([{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }]));
    const { admin, updates, deletes } = fakeAdmin(baseTables({}), [postRow]);
    const result = await dispatchPushOutbox(admin);
    expect(deletes).toEqual([{ table: "push_tokens", values: [TOKEN] }]);
    expect(result).toMatchObject({ sent: 0, removed_tokens: 1, failed: 0 });
    expect(updates.at(-1)!.values).toMatchObject({ outcome: "skipped_no_device" });
  });

  it("falha de rede: a linha volta à fila com o erro, sem marcar enviada", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const { admin, updates } = fakeAdmin(baseTables({}), [postRow]);
    const result = await dispatchPushOutbox(admin);
    expect(result.failed).toBe(1);
    expect(updates.at(-1)).toEqual({ table: "push_outbox", values: { last_error: "timeout", claimed_at: null }, ids: [1] });
  });

  it("conquista usa o nome traduzido do código", async () => {
    fetchMock.mockResolvedValue(expoReply([{ status: "ok", id: "t1" }]));
    const { admin } = fakeAdmin(baseTables({}), [{ id: 2, user_id: USER, kind: "achievement", payload: { code: "first_step" }, attempts: 1 }]);
    await dispatchPushOutbox(admin);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0]).toMatchObject({ title: "Conquista desbloqueada", body: "Primeiro passo. Continue assim!" });
  });

  it("fila vazia não chama a Expo", async () => {
    const { admin } = fakeAdmin(baseTables({}), []);
    expect(await dispatchPushOutbox(admin)).toMatchObject({ claimed: 0, sent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
