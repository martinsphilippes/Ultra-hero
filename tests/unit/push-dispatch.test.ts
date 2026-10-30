import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CLAIM_LIMIT, dispatchPushOutbox, drainPushOutbox } from "@/lib/push/dispatch";

// Cliente falso do Supabase: tabelas em memória, só o que o envio usa (select/in/eq/update/delete).
type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>, claim: Row[] | Row[][]) {
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
        in: async (_col: string, ids: unknown[]) => (updates.push({ table, values, ids }), { error: null }),
        eq: async (_col: string, id: unknown) => (updates.push({ table, values, ids: [id] }), { error: null }),
      }),
      delete: () => ({ in: async (_col: string, values: unknown[]) => (deletes.push({ table, values }), { error: null }) }),
    };
    return api;
  };
  // vários lotes: cada chamada de push_claim devolve o próximo
  const rounds = Array.isArray(claim[0]) ? [...(claim as Row[][])] : [claim as Row[]];
  const admin = { from, rpc: async () => ({ data: rounds.shift() ?? [], error: null }) };
  return { admin: admin as never, updates, deletes };
}

const USER = "u1";
const TOKEN = "ExponentPushToken[abcdefghij]";
const baseTables = (prefs: Row): Record<string, Row[]> => ({
  push_tokens: [{ token: TOKEN, user_id: USER }],
  notification_preferences: [{ user_id: USER, channel_push: true, hero_posts: true, achievements: true, streak_reminders: true, ...prefs }],
  profiles: [{ id: USER, locale: "pt-BR" }],
  content: [{ id: "c1", slug: "treino", title: "Treino de hoje", status: "published", publish_at: null, creator: { name: "Neymar", status: "active" } }],
  programs: [],
  achievements: [{ code: "first_step", name: "Primeiro passo" }],
});
const NOW = new Date().toISOString();
const postRow = { id: 1, user_id: USER, kind: "hero_post", payload: { content_id: "c1" }, attempts: 1, created_at: NOW };

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
    const { admin } = fakeAdmin(baseTables({}), [{ id: 2, user_id: USER, kind: "achievement", payload: { code: "first_step" }, attempts: 1, created_at: NOW }]);
    await dispatchPushOutbox(admin);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0]).toMatchObject({ title: "Conquista desbloqueada", body: "Primeiro passo. Continue assim!" });
  });

  it("dois avisos para o mesmo aparelho no lote: cada resposta vale para o seu aviso", async () => {
    fetchMock.mockResolvedValue(expoReply([{ status: "ok", id: "t1" }, { status: "error", message: "rate", details: { error: "MessageRateExceeded" } }]));
    const achievement = { id: 2, user_id: USER, kind: "achievement", payload: { code: "first_step" }, attempts: 1, created_at: NOW };
    const { admin, updates } = fakeAdmin(baseTables({}), [postRow, achievement]);
    const result = await dispatchPushOutbox(admin);
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(updates).toContainEqual({ table: "push_outbox", values: expect.objectContaining({ outcome: "sent" }), ids: [1] });
    expect(updates).toContainEqual({ table: "push_outbox", values: { last_error: "MessageRateExceeded", claimed_at: null }, ids: [2] });
  });

  it("post reagendado para depois: volta à fila na data nova, sem gastar tentativa", async () => {
    const tables = baseTables({});
    const later = new Date(Date.now() + 86_400_000).toISOString();
    tables.content[0].publish_at = later;
    const { admin, updates } = fakeAdmin(tables, [postRow]);
    await dispatchPushOutbox(admin);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toEqual([{ table: "push_outbox", values: { not_before: later, claimed_at: null, attempts: 0 }, ids: [1] }]);
  });

  it("lembrete de sequência com mais de 12 h não sai", async () => {
    const old = new Date(Date.now() - 13 * 3_600_000).toISOString();
    const { admin, updates } = fakeAdmin(baseTables({}), [{ id: 3, user_id: USER, kind: "streak_reminder", payload: { streak: 4 }, attempts: 1, created_at: old }]);
    await dispatchPushOutbox(admin);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates[0].values).toMatchObject({ outcome: "skipped_stale" });
  });

  it("esvaziar a fila pede lotes até vir um incompleto", async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => expoReply(JSON.parse(init.body).map(() => ({ status: "ok", id: "t" }))));
    const full = Array.from({ length: CLAIM_LIMIT }, (_, i) => ({ ...postRow, id: i + 1 }));
    const { admin } = fakeAdmin(baseTables({}), [full, [{ ...postRow, id: 9999 }]]);
    const result = await drainPushOutbox(admin);
    expect(result).toMatchObject({ rounds: 2, claimed: CLAIM_LIMIT + 1, sent: CLAIM_LIMIT + 1 });
  });

  it("fila vazia não chama a Expo", async () => {
    const { admin } = fakeAdmin(baseTables({}), []);
    expect(await dispatchPushOutbox(admin)).toMatchObject({ claimed: 0, sent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Lance superado nos Colecionáveis (0061): consentimento próprio, item ao vivo e a pessoa ainda atrás.
describe("dispatchPushOutbox · lance superado", () => {
  const ITEM = "c-1";
  const outbidRow = { id: 7, user_id: USER, kind: "auction_outbid", payload: { collectible_id: ITEM, bid_id: "b2", amount_cents: 156000 }, attempts: 1, created_at: NOW };
  const tables = (over: { prefs?: Row; item?: Row; leader?: string } = {}) => ({
    ...baseTables({ auction_outbid: true, ...over.prefs }),
    collectibles: [
      {
        id: ITEM,
        title: "Bola assinada",
        status: "live",
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
        current_cents: 157000,
        leading_bid_id: "b9",
        ...over.item,
      },
    ],
    collectible_bid_owners: [{ bid_id: "b9", user_id: over.leader ?? "u2" }],
  });

  it("envia com o valor atual do item e o link para dar outro lance", async () => {
    fetchMock.mockResolvedValue(expoReply([{ status: "ok", id: "t1" }]));
    const { admin } = fakeAdmin(tables(), [outbidRow]);
    expect(await dispatchPushOutbox(admin)).toMatchObject({ sent: 1 });
    const [message] = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message).toMatchObject({
      title: "Seu lance foi superado",
      body: "Bola assinada: o lance agora é R$\u00a01.570,00. Toque para dar um novo lance.",
      data: { url: `/shop/colecionaveis/${ITEM}`, kind: "auction_outbid" },
    });
  });

  it("tipo desligado (ou coluna ausente, banco sem a 0061) não envia", async () => {
    for (const prefs of [{ auction_outbid: false }, { auction_outbid: undefined }]) {
      fetchMock.mockReset();
      const { admin, updates } = fakeAdmin(tables({ prefs }), [outbidRow]);
      await dispatchPushOutbox(admin);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(updates[0].values).toMatchObject({ outcome: "skipped_consent" });
    }
  });

  it("a pessoa já voltou à frente, ou o item acabou: o aviso perdeu o sentido", async () => {
    for (const over of [{ leader: USER }, { item: { ends_at: new Date(Date.now() - 1000).toISOString() } }, { item: { status: "cancelled" } }]) {
      fetchMock.mockReset();
      const { admin, updates } = fakeAdmin(tables(over), [outbidRow]);
      await dispatchPushOutbox(admin);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(updates[0].values).toMatchObject({ outcome: "skipped_stale" });
    }
  });
});
