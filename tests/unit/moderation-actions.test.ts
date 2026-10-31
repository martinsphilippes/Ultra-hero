import { beforeEach, describe, expect, it, vi } from "vitest";

// Denunciar e bloquear (0071): validação no servidor e repasse às RPCs; o banco confere limite e alvo.
const state = vi.hoisted(() => ({
  user: { id: "u0000000-0000-4000-8000-000000000001" } as { id: string } | null,
  calls: [] as Array<{ fn: string; args: unknown }>,
  error: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      state.calls.push({ fn, args });
      return { data: null, error: state.error };
    },
  }),
}));

const { reportAction, blockHeroAction, unblockHeroAction } = await import("@/lib/moderation/actions");
const CONTENT = "c0000000-0000-4000-8000-000000000001";
const HERO = "c0000000-0000-4000-8000-000000000002";

beforeEach(() => {
  state.user = { id: "u0000000-0000-4000-8000-000000000001" };
  state.calls = [];
  state.error = null;
});

describe("reportAction", () => {
  it("denuncia o conteúdo com motivo da lista e repassa à RPC", async () => {
    expect(await reportAction({ contentId: CONTENT, reason: "rights", details: " foto sem autorização " })).toEqual({ ok: true });
    expect(state.calls).toEqual([{ fn: "report_content", args: { p_content: CONTENT, p_creator: null, p_reason: "rights", p_details: "foto sem autorização" } }]);
  });

  it("sem alvo, motivo fora da lista ou sem sessão: nada chega ao banco", async () => {
    expect(await reportAction({ reason: "spam" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await reportAction({ creatorId: HERO, reason: "nope" as "spam" })).toEqual({ ok: false, error: "invalid_input" });
    state.user = null;
    expect(await reportAction({ creatorId: HERO, reason: "spam" })).toEqual({ ok: false, error: "unauthenticated" });
    expect(state.calls).toHaveLength(0);
  });

  it("limite diário do banco chega como código", async () => {
    state.error = { message: "too_many_reports" };
    expect(await reportAction({ creatorId: HERO, reason: "spam" })).toEqual({ ok: false, error: "too_many_reports" });
  });
});

describe("bloquear e desbloquear", () => {
  it("chama block_hero e unblock_hero com o herói", async () => {
    expect(await blockHeroAction(HERO)).toEqual({ ok: true });
    expect(await unblockHeroAction(HERO)).toEqual({ ok: true });
    expect(state.calls.map((c) => c.fn)).toEqual(["block_hero", "unblock_hero"]);
  });

  it("id inválido não chega ao banco", async () => {
    expect(await blockHeroAction("x")).toEqual({ ok: false, error: "invalid_input" });
    expect(state.calls).toHaveLength(0);
  });
});
