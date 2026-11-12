import { beforeEach, describe, expect, it, vi } from "vitest";

// "Continuar" / "Atualizar situação" na tela de status (refreshAccessAction): conta aprovada que já tem o perfil de
// negócio (ex.: criada pela administração já ligada à marca) vai ao próprio portal, sem o passo a passo de criar outra
// empresa; quem se cadastrou sozinho e ainda não tem o perfil segue para o passo a passo.

const state = vi.hoisted(() => ({
  status: "approved" as "approved" | "pending" | "rejected",
  requestedProfile: "brand",
  roles: [] as string[],
  rpcCalls: [] as [string, unknown][],
  refreshed: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/access/presidency", () => ({
  getMyAccess: async () => ({ available: true, access: { status: state.status, appOnly: false, requestedProfile: state.requestedProfile } }),
}));
vi.mock("@/lib/access/server", () => ({ heroChannelBlocked: async () => false }));
vi.mock("@/lib/auth/invite-first-access", () => ({ acceptMyInvitations: async () => null }));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", app_metadata: { access: "pending" } }),
  getRoles: async () => state.roles.map((role) => ({ role, revoked_at: null })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { refreshSession: async () => void state.refreshed++ },
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push([fn, args]);
      return { data: { id: "x", kind: "brand", resumed: false }, error: null };
    },
  }),
}));

const { refreshAccessAction } = await import("@/app/(auth)/aguardando-aprovacao/actions");

async function destination() {
  try {
    await refreshAccessAction();
    return null;
  } catch (error) {
    const msg = (error as Error).message;
    if (!msg.startsWith("REDIRECT ")) throw error;
    return msg.replace("REDIRECT ", "");
  }
}

beforeEach(() => {
  Object.assign(state, { status: "approved", requestedProfile: "brand", roles: [], rpcCalls: [], refreshed: 0 });
});

describe("Continuar depois da aprovação", () => {
  it("conta criada pela administração já ligada à marca vai ao portal da marca (sem criar outra empresa)", async () => {
    state.roles = ["consumer", "brand"];
    expect(await destination()).toBe("/marca");
    expect(state.rpcCalls).toEqual([]);
    expect(state.refreshed).toBe(1);
  });

  it("indústria e Hero que já têm o perfil vão aos próprios portais", async () => {
    state.requestedProfile = "agency";
    state.roles = ["agency"];
    expect(await destination()).toBe("/agencia");
    state.requestedProfile = "hero";
    state.roles = ["creator"];
    expect(await destination()).toBe("/heroi");
    expect(state.rpcCalls).toEqual([]);
  });

  it("quem se cadastrou sozinho e ainda não tem o perfil segue para o passo a passo", async () => {
    state.roles = ["consumer"];
    expect(await destination()).toBe("/primeiro-acesso");
    expect(state.rpcCalls).toEqual([["self_onboarding_start", { p_kind: "brand" }]]);
  });

  it("ainda pendente: fica na tela de status, sem renovar o token", async () => {
    state.status = "pending";
    state.roles = ["brand"];
    expect(await destination()).toBe("/aguardando-aprovacao");
    expect(state.refreshed).toBe(0);
  });
});
