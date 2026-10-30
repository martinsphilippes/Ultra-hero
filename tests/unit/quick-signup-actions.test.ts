import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPassword } from "@/lib/auth/password-crypto";

// Server actions do cadastro rápido e do cartão "Sua senha" com Supabase falso: o que é criado, o
// que é guardado (cifrado), quando a sessão é aberta e o que NUNCA acontece (entrar com e-mail
// existente, senha em log, conta demo trocando a senha).

type Op = { table: string; op: string; args: unknown[]; filters: [string, unknown][] };

const state = vi.hoisted(() => ({
  hasAdmin: true,
  ops: [] as Op[],
  attemptsCount: 0,
  attemptsError: null as null | { code: string; message: string },
  createUserCalls: [] as Record<string, unknown>[],
  createUserError: null as null | { code?: string; status?: number; message: string },
  updateUserCalls: [] as [string, Record<string, unknown>][],
  signInCalls: [] as { email: string; password: string }[],
  signInError: null as null | { code: string },
  signOutScopes: [] as string[],
  cookieSets: [] as { name: string; value: string; opts: Record<string, unknown> }[],
  cookieDeletes: [] as string[],
  settings: {} as Record<string, unknown>,
  storedRow: null as null | { ciphertext: string; key_version: number; user_id: string },
  user: null as null | { id: string; email: string; app_metadata: Record<string, unknown>; identities?: { provider: string }[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
  cookies: async () => ({
    set: (name: string, value: string, opts: Record<string, unknown>) => void state.cookieSets.push({ name, value, opts }),
    delete: (name: string) => void state.cookieDeletes.push(name),
    get: () => undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

function builder(table: string) {
  const op: Op = { table, op: "select", args: [], filters: [] };
  state.ops.push(op);
  const result = () => {
    if (table === "quick_signup_attempts") {
      if (state.attemptsError) return { data: null, count: null, error: state.attemptsError };
      return { data: null, count: op.op === "select" ? state.attemptsCount : null, error: null };
    }
    if (table === "user_generated_passwords") {
      if (op.op === "upsert") {
        const row = op.args[0] as { ciphertext: string; key_version: number; user_id: string };
        state.storedRow = row;
        return { data: null, error: null };
      }
      if (op.op === "delete") {
        state.storedRow = null;
        return { data: null, error: null };
      }
      const uid = op.filters.find(([c]) => c === "user_id")?.[1];
      return { data: state.storedRow && state.storedRow.user_id === uid ? state.storedRow : null, error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const name of ["select", "insert", "update", "upsert", "delete"]) {
    b[name] = (...args: unknown[]) => {
      if (name !== "select" || op.op === "select") op.op = name;
      op.args = args;
      return b;
    };
  }
  for (const name of ["eq", "gte", "lt", "limit"]) {
    b[name] = (col: string, value: unknown) => {
      op.filters.push([col, value]);
      return b;
    };
  }
  b.maybeSingle = async () => result();
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => state.hasAdmin,
  createAdminClient: () => ({
    from: (table: string) => builder(table),
    auth: {
      admin: {
        createUser: async (params: Record<string, unknown>) => {
          state.createUserCalls.push(params);
          if (state.createUserError) return { data: { user: null }, error: state.createUserError };
          return { data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }, error: null };
        },
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          state.updateUserCalls.push([id, attrs]);
          return { data: { user: { id } }, error: null };
        },
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => builder(table),
    rpc: async () => ({ data: state.settings, error: null }),
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      signOut: async ({ scope }: { scope: string }) => void state.signOutScopes.push(scope),
      exchangeCodeForSession: async () => ({ error: null }),
      signInWithPassword: async (creds: { email: string; password: string }) => {
        state.signInCalls.push(creds);
        return { error: state.signInError };
      },
    },
  }),
}));

const { quickSignupAction, finishQuickSignup } = await import("@/app/(auth)/actions");
const { revealMyPassword, regenerateMyPassword } = await import("@/app/(app)/profile/account/actions");
const { GET: authCallback } = await import("@/app/auth/callback/route");
const { NextRequest } = await import("next/server");

const KEY = randomBytes(32).toString("base64");
const NEW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}
const valid = { fullName: "Maria da Silva", email: "Maria@Exemplo.com", phone: "(11) 91234-5678", next: "/personalities" };
const idle = { status: "idle" } as const;

let logs: string[] = [];
beforeEach(() => {
  Object.assign(state, {
    hasAdmin: true,
    ops: [],
    attemptsCount: 0,
    attemptsError: null,
    createUserCalls: [],
    createUserError: null,
    updateUserCalls: [],
    signInCalls: [],
    signInError: null,
    signOutScopes: [],
    cookieSets: [],
    cookieDeletes: [],
    settings: {},
    storedRow: null,
    user: null,
  });
  vi.stubEnv("ACCOUNT_PASSWORD_KEY_V1", KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  logs = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("quickSignupAction", () => {
  it("cria a conta confirmada, guarda nome/celular e a senha cifrada, entra e segura a tela da senha", async () => {
    const result = await quickSignupAction(idle, form(valid));
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result).toMatchObject({ stored: true, signedIn: true });
    expect(result.password).toMatch(/^[A-HJKMNP-Z][a-hjkmnp-z2-9]{3}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);

    expect(state.createUserCalls).toHaveLength(1);
    expect(state.createUserCalls[0]).toEqual({
      email: "maria@exemplo.com",
      password: result.password,
      email_confirm: true,
      user_metadata: { full_name: "Maria da Silva", phone: "+5511912345678" },
      app_metadata: { quick_signup: true, quick_signup_unverified: true },
    });
    const profile = state.ops.find((o) => o.table === "profiles" && o.op === "update");
    expect(profile?.args[0]).toEqual({ full_name: "Maria da Silva", phone_e164: "+5511912345678" });
    expect(profile?.filters).toContainEqual(["id", NEW_ID]);

    // senha guardada só cifrada, e abre com a chave para a própria pessoa
    expect(state.storedRow?.user_id).toBe(NEW_ID);
    expect(state.storedRow?.ciphertext).not.toContain(result.password);
    expect(openPassword(state.storedRow!.ciphertext, NEW_ID, state.storedRow!.key_version)).toBe(result.password);

    // tentativa registrada só com HMAC (nem IP nem e-mail puros)
    const attempt = state.ops.find((o) => o.table === "quick_signup_attempts" && o.op === "insert");
    const row = attempt?.args[0] as { ip_hash: string; email_hash: string };
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(state.ops)).not.toContain("203.0.113.7");
    expect(JSON.stringify(state.ops.filter((o) => o.table === "quick_signup_attempts"))).not.toContain("maria@exemplo.com");

    expect(state.signInCalls).toEqual([{ email: "maria@exemplo.com", password: result.password }]);
    expect(state.cookieSets).toEqual([expect.objectContaining({ name: "uh-qs-pending", value: "1", opts: expect.objectContaining({ httpOnly: true, maxAge: 900 }) })]);
    // nada de senha em log
    expect(logs.join("\n")).not.toContain(result.password);
  });

  it("e-mail já cadastrado: avisa e NÃO entra (sem a senha não há sessão)", async () => {
    state.createUserError = { code: "email_exists", status: 422, message: "A user with this email address has already been registered" };
    expect(await quickSignupAction(idle, form(valid))).toEqual({ status: "error", error: "emailExists" });
    expect(state.signInCalls).toEqual([]);
    expect(state.cookieSets).toEqual([]);
  });

  it("cadastro fechado (kill switch): o banco recusa e a tela explica", async () => {
    state.createUserError = { code: "unexpected_failure", status: 500, message: "Database error creating new user" };
    state.settings = { "experiment.open": false };
    expect(await quickSignupAction(idle, form(valid))).toEqual({ status: "error", error: "experimentClosed" });
    expect(state.signInCalls).toEqual([]);
  });

  it("limite por IP/e-mail: não cria nada", async () => {
    state.attemptsCount = 10;
    expect(await quickSignupAction(idle, form(valid))).toEqual({ status: "error", error: "tooManyRequests" });
    expect(state.createUserCalls).toEqual([]);
  });

  it("campo-isca preenchido: resposta genérica, nada é criado nem registrado", async () => {
    expect(await quickSignupAction(idle, form({ ...valid, website: "http://spam" }))).toEqual({ status: "error", error: "unknown" });
    expect(state.createUserCalls).toEqual([]);
    expect(state.ops).toEqual([]);
  });

  it("validação antes de tudo", async () => {
    const result = await quickSignupAction(idle, form({ fullName: "Maria", email: "x", phone: "123" }));
    expect(result).toEqual({ status: "error", fieldErrors: { fullName: "fullNameInvalid", email: "invalidEmail", phone: "phoneInvalid" } });
    expect(state.ops).toEqual([]);
  });

  it("sem service role ou sem a 0046: indisponível, sem criar conta", async () => {
    state.hasAdmin = false;
    expect(await quickSignupAction(idle, form(valid))).toEqual({ status: "error", error: "signupUnavailable" });
    state.hasAdmin = true;
    state.attemptsError = { code: "PGRST205", message: "Could not find the table 'public.quick_signup_attempts' in the schema cache" };
    expect(await quickSignupAction(idle, form(valid))).toEqual({ status: "error", error: "signupUnavailable" });
    expect(state.createUserCalls).toEqual([]);
  });

  it("sem a chave do cofre: cria e entra, mas avisa que a senha não fica consultável", async () => {
    vi.stubEnv("ACCOUNT_PASSWORD_KEY_V1", "");
    const result = await quickSignupAction(idle, form(valid));
    expect(result).toMatchObject({ status: "created", stored: false, signedIn: true });
    expect(state.storedRow).toBeNull();
  });

  it("'Já anotei' apaga o cookie e segue só para destino interno", async () => {
    await expect(finishQuickSignup(form({ next: "/personalities" }))).rejects.toThrow("REDIRECT /personalities");
    expect(state.cookieDeletes).toEqual(["uh-qs-pending"]);
    await expect(finishQuickSignup(form({ next: "https://evil.example" }))).rejects.toThrow("REDIRECT /personalities");
  });
});

describe("Perfil › Conta: Sua senha", () => {
  const me = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "me@exemplo.com", app_metadata: {}, identities: [{ provider: "email" }] };

  it("Mostrar decifra só a senha da pessoa da sessão", async () => {
    state.user = me;
    const { sealPassword } = await import("@/lib/auth/password-crypto");
    const sealed = sealPassword("Abcd-efgh-2345", me.id);
    state.storedRow = { user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", ciphertext: sealed.ciphertext, key_version: 1 };
    expect(await revealMyPassword()).toEqual({ ok: false, error: "none" });
    state.storedRow = { user_id: me.id, ciphertext: sealed.ciphertext, key_version: 1 };
    expect(await revealMyPassword()).toEqual({ ok: true, password: "Abcd-efgh-2345" });
    state.user = null;
    expect(await revealMyPassword()).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("Gerar nova senha: troca no Auth, guarda cifrada e derruba as outras sessões", async () => {
    state.user = me;
    const result = await regenerateMyPassword();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.updateUserCalls).toEqual([[me.id, { password: result.password }]]);
    expect(openPassword(state.storedRow!.ciphertext, me.id, 1)).toBe(result.password);
    expect(state.signOutScopes).toEqual(["others"]);
    expect(logs.join("\n")).not.toContain(result.password);
  });

  it("conta demo nunca troca a senha compartilhada", async () => {
    state.user = { ...me, email: "premium@demo.ultrahero.app" };
    expect(await regenerateMyPassword()).toEqual({ ok: false, error: "demo" });
    state.user = { ...me, app_metadata: { ultra_hero_demo: true } };
    expect(await regenerateMyPassword()).toEqual({ ok: false, error: "demo" });
    expect(state.updateUserCalls).toEqual([]);
  });

  it("sem chave: indisponível (não troca a senha para não perdê-la)", async () => {
    state.user = me;
    vi.stubEnv("ACCOUNT_PASSWORD_KEY_V1", "");
    expect(await regenerateMyPassword()).toEqual({ ok: false, error: "unavailable" });
    expect(await revealMyPassword()).toEqual({ ok: false, error: "unavailable" });
    expect(state.updateUserCalls).toEqual([]);
  });
});

describe("Google no mesmo e-mail de um cadastro rápido (e-mail nunca verificado)", () => {
  const quick = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", email: "alvo@exemplo.com", app_metadata: { quick_signup: true, quick_signup_unverified: true } };
  const callback = () => authCallback(new NextRequest("https://app.example/auth/callback?code=abc&next=%2Fpersonalities"));

  it("troca a senha gerada, marca verificado e derruba as outras sessões (quem cadastrou o e-mail alheio perde o acesso)", async () => {
    state.user = { ...quick, identities: [{ provider: "email" }, { provider: "google" }] };
    const res = await callback();
    expect(res.headers.get("location")).toMatch(/\/personalities$/);
    expect(state.updateUserCalls).toHaveLength(1);
    const [id, attrs] = state.updateUserCalls[0];
    expect(id).toBe(quick.id);
    expect(attrs.app_metadata).toEqual({ quick_signup_unverified: false });
    expect(openPassword(state.storedRow!.ciphertext, quick.id, 1)).toBe(attrs.password);
    expect(state.signOutScopes).toEqual(["others"]);
  });

  it("sem Google, ou já verificado: não mexe em nada", async () => {
    state.user = { ...quick, identities: [{ provider: "email" }] };
    await callback();
    state.user = { ...quick, app_metadata: { quick_signup_unverified: false }, identities: [{ provider: "google" }] };
    await callback();
    expect(state.updateUserCalls).toEqual([]);
    expect(state.signOutScopes).toEqual([]);
  });
});
