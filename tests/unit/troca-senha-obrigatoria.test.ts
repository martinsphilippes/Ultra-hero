import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANGE_PASSWORD_PATH, decideAccess, isOpenWhileChangingPassword, PENDING_PATH, readAccessClaims, type AccessInput } from "@/lib/access/gate";

// Senha provisória (conta criada pela administração com uma senha combinada): troca obrigatória no primeiro acesso,
// antes de qualquer tela — inclusive da tela de status da aprovação da Presidência.

const USER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const state = vi.hoisted(() => ({
  appMetadata: {} as Record<string, unknown>,
  refreshedMetadata: null as null | Record<string, unknown>,
  updateUserError: null as null | { code: string; message: string },
  updateUserCalls: [] as Record<string, unknown>[],
  adminUpdates: [] as [string, Record<string, unknown>][],
  signOutScopes: [] as string[],
  signInMetadata: {} as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: [], error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID, email: "pessoa@marca.com.br", app_metadata: state.appMetadata } } }),
      updateUser: async (attrs: Record<string, unknown>) => {
        state.updateUserCalls.push(attrs);
        return { data: {}, error: state.updateUserError };
      },
      signOut: async ({ scope }: { scope: string }) => void state.signOutScopes.push(scope),
      refreshSession: async () => ({ data: { user: state.refreshedMetadata ? { id: USER_ID, app_metadata: state.refreshedMetadata } : null } }),
      signInWithPassword: async () => ({ data: { user: { id: USER_ID, app_metadata: state.signInMetadata } }, error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => true,
  createAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          state.adminUpdates.push([id, attrs]);
          return { data: { user: { id } }, error: null };
        },
      },
    },
  }),
}));

const { forcedPasswordChangeAction, loginAction } = await import("@/app/(auth)/actions");

const idle = { status: "idle" } as const;
function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
async function run(p: Promise<unknown>) {
  try {
    return { state: await p };
  } catch (error) {
    const msg = (error as Error).message;
    if (!msg.startsWith("REDIRECT ")) throw error;
    return { redirect: msg.replace("REDIRECT ", "") };
  }
}

beforeEach(() => {
  Object.assign(state, { appMetadata: {}, refreshedMetadata: null, updateUserError: null, updateUserCalls: [], adminUpdates: [], signOutScopes: [], signInMetadata: {} });
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
});

const base: AccessInput = { pathname: "/marca", signedIn: true, claims: { status: "approved", appOnly: false, mustChangePassword: true }, native: false, creatorAppOnly: true };
const at = (patch: Partial<AccessInput>) => decideAccess({ ...base, ...patch });

describe("regra de acesso: senha provisória", () => {
  it("lê a marca do token (app_metadata.must_change_password)", () => {
    expect(readAccessClaims({ app_metadata: { access: "approved", must_change_password: true } })).toMatchObject({ mustChangePassword: true });
    expect(readAccessClaims({ app_metadata: { access: "approved" } })).toMatchObject({ mustChangePassword: false });
    expect(readAccessClaims({ app_metadata: { must_change_password: "true" } })).toMatchObject({ mustChangePassword: false });
  });

  it("qualquer tela leva à troca de senha, inclusive a tela de status da aprovação", () => {
    for (const pathname of ["/marca", "/personalities", "/agencia", "/profile", PENDING_PATH, "/"]) {
      expect(at({ pathname })).toEqual({ action: "change-password" });
    }
    expect(at({ pathname: "/marca", claims: { status: "pending", appOnly: false, mustChangePassword: true } })).toEqual({ action: "change-password" });
  });

  it("abre só a troca, os retornos do login (sair), a recuperação, textos legais e offline", () => {
    for (const pathname of [CHANGE_PASSWORD_PATH, "/auth/signout", "/auth/callback", "/reset-password", "/legal/terms", "/offline"]) {
      expect(isOpenWhileChangingPassword(pathname)).toBe(true);
      expect(at({ pathname, claims: { status: "pending", appOnly: false, mustChangePassword: true } })).toEqual({ action: "next" });
    }
  });

  it("depois da troca (sem a marca) valem as regras de sempre", () => {
    expect(at({ claims: { status: "approved", appOnly: false, mustChangePassword: false } })).toEqual({ action: "next" });
    expect(at({ claims: { status: "pending", appOnly: false } })).toEqual({ action: "pending", status: "pending" });
  });
});

describe("tela Crie sua senha", () => {
  it("confirmação diferente: nada é trocado", async () => {
    state.appMetadata = { access: "approved", must_change_password: true };
    const r = await run(forcedPasswordChangeAction(idle, form({ password: "NovaSenha#2026", confirmPassword: "OutraSenha#2026" })));
    expect(r).toEqual({ state: { status: "error", fieldErrors: { confirmPassword: "passwordsDontMatch" } } });
    expect(state.updateUserCalls).toEqual([]);
    expect(state.adminUpdates).toEqual([]);
  });

  it("repetir a senha provisória é recusado", async () => {
    state.appMetadata = { access: "approved", must_change_password: true };
    state.updateUserError = { code: "same_password", message: "New password should be different from the old password." };
    const r = await run(forcedPasswordChangeAction(idle, form({ password: "12345678", confirmPassword: "12345678" })));
    expect(r).toEqual({ state: { status: "error", error: "samePassword" } });
    expect(state.adminUpdates).toEqual([]);
  });

  it("troca a senha, tira a marca, derruba as outras sessões e segue para o app", async () => {
    state.appMetadata = { access: "approved", must_change_password: true };
    state.refreshedMetadata = { access: "approved", must_change_password: false };
    const r = await run(forcedPasswordChangeAction(idle, form({ password: "NovaSenha#2026", confirmPassword: "NovaSenha#2026" })));
    expect(r).toEqual({ redirect: "/personalities" });
    expect(state.updateUserCalls).toEqual([{ password: "NovaSenha#2026" }]);
    expect(state.adminUpdates).toEqual([[USER_ID, { app_metadata: { must_change_password: false } }]]);
    expect(state.signOutScopes).toEqual(["others"]);
  });

  it("conta ainda pendente da Presidência: depois da troca vai para a tela de status", async () => {
    state.appMetadata = { access: "pending", must_change_password: true };
    state.refreshedMetadata = { access: "pending", must_change_password: false };
    expect(await run(forcedPasswordChangeAction(idle, form({ password: "NovaSenha#2026", confirmPassword: "NovaSenha#2026" })))).toEqual({ redirect: PENDING_PATH });
  });
});

describe("login com senha provisória", () => {
  it("entrar com a senha combinada leva direto à troca (antes da tela de status)", async () => {
    state.signInMetadata = { access: "pending", app_only: false, must_change_password: true };
    expect(await run(loginAction(idle, form({ email: "pessoa@marca.com.br", password: "12345678", next: "/marca" })))).toEqual({ redirect: CHANGE_PASSWORD_PATH });
  });
});
