import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Período sem senha (evento): entrar e criar conta só com o e-mail. O que NUNCA acontece: admin entrar sem senha,
// conta suspensa entrar, e-mail desconhecido virar conta no login (sem convite), passar do limite, e-mail em log.

const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const state = vi.hoisted(() => ({
  linkError: null as null | { status?: number; code?: string; message: string },
  linkUser: null as null | Record<string, unknown>,
  linkCalls: [] as Record<string, unknown>[],
  isAdmin: false,
  adminQueryError: false,
  verifyCalls: [] as Record<string, unknown>[],
  verifyError: null as null | { code: string },
  createUserCalls: [] as Record<string, unknown>[],
  createUserError: null as null | { code?: string; status?: number; message: string },
  signInCalls: [] as { email: string; password: string }[],
  rpcCalls: [] as string[],
  attemptsCount: 0,
  attemptInserts: [] as Record<string, unknown>[],
  pendingInvite: false,
  storedPasswords: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }), cookies: async () => ({ set: () => undefined, get: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

function query(table: string) {
  const b: Record<string, unknown> = {};
  let op = "select";
  const result = () => {
    if (table === "quick_signup_attempts") return { data: null, count: op === "select" ? state.attemptsCount : null, error: null };
    if (table === "role_assignments") return state.adminQueryError ? { data: null, error: { code: "XX000", message: "x" } } : { data: state.isAdmin ? [{ user_id: USER_ID }] : [], error: null };
    if (table === "invitations") return { data: state.pendingInvite ? [{ id: "inv" }] : [], error: null };
    if (table === "user_generated_passwords" && op === "upsert") state.storedPasswords++;
    return { data: null, error: null };
  };
  for (const name of ["select", "insert", "upsert", "delete", "update"]) {
    b[name] = (arg: unknown) => {
      if (name !== "select") op = name;
      if (table === "quick_signup_attempts" && name === "insert") state.attemptInserts.push(arg as Record<string, unknown>);
      return b;
    };
  }
  for (const name of ["eq", "ilike", "gte", "lt", "limit", "is"]) b[name] = () => b;
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => true,
  createAdminClient: () => ({
    from: (table: string) => query(table),
    auth: {
      admin: {
        generateLink: async (params: Record<string, unknown>) => {
          state.linkCalls.push(params);
          if (state.linkError) return { data: { user: null, properties: null }, error: state.linkError };
          return { data: { user: state.linkUser ?? { id: USER_ID }, properties: { hashed_token: "hashed-token" } }, error: null };
        },
        createUser: async (params: Record<string, unknown>) => {
          state.createUserCalls.push(params);
          if (state.createUserError) return { data: { user: null }, error: state.createUserError };
          state.linkError = null; // a conta passa a existir
          return { data: { user: { id: USER_ID } }, error: null };
        },
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      state.rpcCalls.push(name);
      return { data: name === "onboarding_pending" ? [] : null, error: null };
    },
    auth: {
      signOut: async () => ({ error: null }),
      verifyOtp: async (params: Record<string, unknown>) => {
        state.verifyCalls.push(params);
        return { data: {}, error: state.verifyError };
      },
      signInWithPassword: async (creds: { email: string; password: string }) => {
        state.signInCalls.push(creds);
        return { error: null };
      },
    },
  }),
}));

const { loginAction, profileSignupAction, quickSignupAction } = await import("@/app/(auth)/actions");

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

const idle = { status: "idle" } as const;
const login = (email = "Ana@Exemplo.com") => loginAction(idle, form({ email, passwordless: "1", next: "/personalities" }));

let logs: string[] = [];
beforeEach(() => {
  Object.assign(state, {
    linkError: null,
    linkUser: null,
    linkCalls: [],
    isAdmin: false,
    adminQueryError: false,
    verifyCalls: [],
    verifyError: null,
    createUserCalls: [],
    createUserError: null,
    signInCalls: [],
    rpcCalls: [],
    attemptsCount: 0,
    attemptInserts: [],
    pendingInvite: false,
    storedPasswords: 0,
  });
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  vi.stubEnv("ACCOUNT_PASSWORD_KEY_V1", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("PASSWORDLESS_UNTIL", "2999-01-01T00:00:00Z");
  vi.stubEnv("PASSWORDLESS_DISABLED", "");
  logs = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("login só com e-mail", () => {
  it("conta existente: abre a sessão pelo token (sem e-mail enviado) e segue ao destino", async () => {
    expect(await run(login())).toEqual({ redirect: "/personalities" });
    expect(state.linkCalls).toEqual([{ type: "recovery", email: "ana@exemplo.com" }]);
    expect(state.verifyCalls).toEqual([{ type: "recovery", token_hash: "hashed-token" }]);
    expect(state.attemptInserts).toHaveLength(1);
    expect(JSON.stringify(state.attemptInserts)).not.toContain("ana@exemplo.com");
    expect(logs.join("\n")).not.toContain("ana@exemplo.com");
  });

  it("administrador da plataforma: exige senha, sem sessão", async () => {
    state.isAdmin = true;
    expect(await run(login())).toEqual({ state: { status: "error", error: "passwordRequired" } });
    expect(state.verifyCalls).toEqual([]);
  });

  it("falha ao checar admin: trata como admin (falha fechada)", async () => {
    state.adminQueryError = true;
    expect(await run(login())).toEqual({ state: { status: "error", error: "passwordRequired" } });
    expect(state.verifyCalls).toEqual([]);
  });

  it("conta suspensa: recusada", async () => {
    state.linkUser = { id: USER_ID, banned_until: "2999-01-01T00:00:00Z" };
    expect(await run(login())).toEqual({ state: { status: "error", error: "accountSuspended" } });
    expect(state.verifyCalls).toEqual([]);
  });

  it("e-mail sem conta e sem convite: oferece criar conta, nada é criado", async () => {
    state.linkError = { status: 404, code: "user_not_found", message: "User with this email not found" };
    expect(await run(login())).toEqual({ state: { status: "error", error: "noAccount" } });
    expect(state.createUserCalls).toEqual([]);
  });

  it("e-mail sem conta com convite pendente: cria a conta (senha gerada) e entra", async () => {
    state.linkError = { status: 404, code: "user_not_found", message: "User with this email not found" };
    state.pendingInvite = true;
    const r = await run(login());
    expect(r).toEqual({ redirect: "/personalities" });
    expect(state.createUserCalls).toEqual([expect.objectContaining({ email: "ana@exemplo.com", email_confirm: true, app_metadata: { invite_first_access: true } })]);
    expect(String(state.createUserCalls[0].password)).toMatch(/^[A-Z].{13}$/);
  });

  it("limite por IP/e-mail", async () => {
    state.attemptsCount = 20;
    expect(await run(login())).toEqual({ state: { status: "error", error: "tooManyRequests" } });
    expect(state.linkCalls).toEqual([]);
  });

  it("depois do prazo (ou kill switch): o campo passwordless é ignorado e a senha volta a ser obrigatória", async () => {
    vi.stubEnv("PASSWORDLESS_UNTIL", "2000-01-01T00:00:00Z");
    expect(await run(login())).toEqual({ state: { status: "error", fieldErrors: { password: "required" } } });
    vi.stubEnv("PASSWORDLESS_UNTIL", "2999-01-01T00:00:00Z");
    vi.stubEnv("PASSWORDLESS_DISABLED", "1");
    expect(await run(login())).toEqual({ state: { status: "error", fieldErrors: { password: "required" } } });
    expect(state.linkCalls).toEqual([]);
  });
});

describe("cadastro sem senha", () => {
  const profileForm = { profile: "hero", fullName: "Ana Souza", email: "ana@exemplo.com", phone: "(11) 91234-5678" };

  it("perfil (Herói): sem campo senha, cria com senha gerada guardada no cofre, entra e abre o passo a passo", async () => {
    expect(await run(profileSignupAction(idle, form(profileForm)))).toEqual({ redirect: "/primeiro-acesso" });
    expect(state.createUserCalls).toEqual([
      expect.objectContaining({ email: "ana@exemplo.com", email_confirm: true, user_metadata: { full_name: "Ana Souza", phone: "+5511912345678" } }),
    ]);
    expect(state.signInCalls).toHaveLength(1);
    expect(state.storedPasswords).toBe(1);
    expect(state.rpcCalls).toContain("self_onboarding_start");
  });

  it("perfil com e-mail já cadastrado: só entra e segue", async () => {
    state.createUserError = { code: "email_exists", status: 422, message: "already registered" };
    expect(await run(profileSignupAction(idle, form(profileForm)))).toEqual({ redirect: "/primeiro-acesso" });
    expect(state.verifyCalls).toHaveLength(1);
  });

  it("e-mail já cadastrado de admin: exige senha", async () => {
    state.createUserError = { code: "email_exists", status: 422, message: "already registered" };
    state.isAdmin = true;
    expect(await run(profileSignupAction(idle, form(profileForm)))).toEqual({ state: { status: "error", error: "passwordRequired" } });
    expect(await run(quickSignupAction(idle, form({ fullName: "Ana Souza", email: "ana@exemplo.com", phone: "(11) 91234-5678" })))).toEqual({
      state: { status: "error", error: "passwordRequired" },
    });
    expect(state.verifyCalls).toEqual([]);
  });

  it("cadastro rápido com e-mail já cadastrado: entra e segue ao destino", async () => {
    state.createUserError = { code: "email_exists", status: 422, message: "already registered" };
    const r = await run(quickSignupAction(idle, form({ fullName: "Ana Souza", email: "ana@exemplo.com", phone: "(11) 91234-5678", next: "/personalities" })));
    expect(r).toEqual({ redirect: "/personalities" });
  });

  it("depois do prazo: perfil volta a exigir a senha", async () => {
    vi.stubEnv("PASSWORDLESS_DISABLED", "1");
    expect(await run(profileSignupAction(idle, form(profileForm)))).toEqual({ state: { status: "error", fieldErrors: { password: "required" } } });
    expect(state.createUserCalls).toEqual([]);
  });
});
