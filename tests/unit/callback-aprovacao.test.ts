import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 0141/0142 no retorno do Google (/auth/callback): conta nova pendente, perfil escolhido na entrada, Hero só pelo app
// (no navegador nada é registrado como Hero e a sessão é encerrada) e a troca de senha pela recuperação sempre liberada.

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GCHeroApp/1.0.0 (ios)";
const USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const state = vi.hoisted(() => ({
  userAgent: "",
  appMetadata: {} as Record<string, unknown>,
  refreshedMetadata: null as null | Record<string, unknown>,
  signOutScopes: [] as string[],
  annotateCalls: [] as Record<string, unknown>[],
  refreshCalls: 0,
  rpcCalls: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": state.userAgent }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => {
      state.rpcCalls.push(name);
      return { data: name === "onboarding_pending" || name === "accept_my_invitations" ? [] : null, error: null };
    },
    auth: {
      exchangeCodeForSession: async () => ({ data: { user: { id: USER_ID, app_metadata: state.appMetadata } }, error: null }),
      getUser: async () => ({ data: { user: { id: USER_ID, app_metadata: state.appMetadata, identities: [{ provider: "google" }] } } }),
      signOut: async ({ scope }: { scope: string }) => void state.signOutScopes.push(scope),
      refreshSession: async () => {
        state.refreshCalls++;
        return { data: { user: state.refreshedMetadata ? { id: USER_ID, app_metadata: state.refreshedMetadata } : null } };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => true,
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "account_approval_annotate") state.annotateCalls.push(args);
      return { data: null, error: null };
    },
  }),
}));

const { GET } = await import("@/app/auth/callback/route");

async function callback(next: string): Promise<string> {
  const res = await GET(new NextRequest(`https://groscoveultra.com/auth/callback?code=abc&next=${encodeURIComponent(next)}`));
  return new URL(res.headers.get("location") ?? "").pathname;
}

beforeEach(() => {
  Object.assign(state, { userAgent: BROWSER, appMetadata: {}, refreshedMetadata: null, signOutScopes: [], annotateCalls: [], refreshCalls: 0, rpcCalls: [] });
  vi.stubEnv("CREATOR_APP_ONLY", "");
});

describe("retorno do Google com a aprovação da Presidência", () => {
  it("conta nova (pendente) vai para a tela de status, sem aceitar convite nem abrir passo a passo antes", async () => {
    state.appMetadata = { provider: "google", access: "pending", app_only: false };
    expect(await callback("/personalities")).toBe("/aguardando-aprovacao");
    expect(state.rpcCalls).not.toContain("accept_my_invitations");
    expect(state.signOutScopes).toEqual([]);
  });

  it("perfil escolhido na entrada (Marca) é registrado no pedido e o token é renovado", async () => {
    state.appMetadata = { provider: "google", access: "pending", app_only: false };
    state.refreshedMetadata = { provider: "google", access: "pending", app_only: false };
    expect(await callback("/comecar/marca")).toBe("/aguardando-aprovacao");
    expect(state.annotateCalls).toEqual([{ p_user: USER_ID, p_profile: "brand", p_origin: null }]);
    expect(state.refreshCalls).toBe(1);
  });

  it("recusada continua barrada ao repetir o login com o Google", async () => {
    state.appMetadata = { provider: "google", access: "rejected", app_only: false };
    expect(await callback("/personalities")).toBe("/aguardando-aprovacao");
  });

  it("aprovada (Marca, Agência, usuário comum) segue para o destino na web", async () => {
    state.appMetadata = { provider: "google", access: "approved", app_only: false };
    expect(await callback("/personalities")).toBe("/personalities");
    expect(state.signOutScopes).toEqual([]);
  });
});

describe("retorno do Google com Hero só pelo aplicativo", () => {
  it("Hero escolhido no navegador: nada é registrado como Hero e a sessão é encerrada", async () => {
    state.appMetadata = { provider: "google", access: "pending", app_only: false };
    expect(await callback("/comecar/heroi")).toBe("/acesso-pelo-app");
    expect(state.annotateCalls).toEqual([]);
    expect(state.signOutScopes).toEqual(["local"]);
  });

  it("conta Hero aprovada entrando com o Google no navegador: sessão encerrada e mensagem do app", async () => {
    state.appMetadata = { provider: "google", access: "approved", app_only: true };
    expect(await callback("/heroi")).toBe("/acesso-pelo-app");
    expect(state.signOutScopes).toEqual(["local"]);
  });

  it("no aplicativo o Hero aprovado entra e o Hero novo fica pendente com o perfil registrado", async () => {
    state.userAgent = APP;
    state.appMetadata = { provider: "google", access: "approved", app_only: true };
    expect(await callback("/heroi")).toBe("/heroi");
    state.appMetadata = { provider: "google", access: "pending", app_only: false };
    state.refreshedMetadata = { provider: "google", access: "pending", app_only: true };
    expect(await callback("/comecar/heroi")).toBe("/aguardando-aprovacao");
    expect(state.annotateCalls).toEqual([{ p_user: USER_ID, p_profile: "hero", p_origin: null }]);
    expect(state.signOutScopes).toEqual([]);
  });

  it("válvula CREATOR_APP_ONLY=false: Hero aprovado volta a entrar pelo navegador", async () => {
    vi.stubEnv("CREATOR_APP_ONLY", "false");
    state.appMetadata = { provider: "google", access: "approved", app_only: true };
    expect(await callback("/heroi")).toBe("/heroi");
  });
});

describe("recuperação de senha", () => {
  it("o link de troca de senha nunca é barrado (qualquer conta)", async () => {
    state.appMetadata = { provider: "email", access: "pending", app_only: true };
    expect(await callback("/reset-password")).toBe("/reset-password");
    expect(state.signOutScopes).toEqual([]);
  });
});
