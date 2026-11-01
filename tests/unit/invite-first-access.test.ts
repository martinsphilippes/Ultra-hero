import { beforeEach, describe, expect, it, vi } from "vitest";
import { portalHomeForAccepted } from "@/lib/auth/invite-home";

// Primeiro acesso do convidado (0077): e-mail convidado + senha nova na tela de entrar cria a conta,
// entra e aceita o convite. Sem convite, ou com conta já existente, o login segue como antes (nunca
// cria conta nem toma a de alguém). As regras do aceite no banco são testadas no S84.

const state = vi.hoisted(() => ({
  hasAdmin: true,
  pendingInvite: true,
  inviteQuery: [] as [string, unknown][],
  createUserCalls: [] as Record<string, unknown>[],
  createUserError: null as null | { code?: string; message: string },
  signInCalls: [] as { email: string; password: string }[],
  signInErrors: [] as (null | { code: string })[],
  rpcCalls: [] as string[],
  accepted: [] as unknown[],
  attemptsCount: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }), cookies: async () => ({ set: () => undefined, get: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

function query(table: string) {
  const b: Record<string, unknown> = {};
  const filters: [string, unknown][] = [];
  const result = () => {
    if (table === "invitations") {
      state.inviteQuery = filters;
      return { data: state.pendingInvite ? [{ id: "inv-1" }] : [], error: null };
    }
    if (table === "quick_signup_attempts") return { data: null, count: state.attemptsCount, error: null };
    return { data: null, error: null };
  };
  for (const name of ["select", "insert", "upsert", "delete", "update"]) b[name] = () => b;
  for (const name of ["eq", "ilike", "gte", "lt", "limit"]) {
    b[name] = (col: string, value: unknown) => {
      filters.push([`${name}:${col}`, value]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => state.hasAdmin,
  createAdminClient: () => ({
    from: (table: string) => query(table),
    auth: {
      admin: {
        createUser: async (params: Record<string, unknown>) => {
          state.createUserCalls.push(params);
          if (state.createUserError) return { data: { user: null }, error: state.createUserError };
          return { data: { user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }, error: null };
        },
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => query(table),
    rpc: async (name: string) => {
      state.rpcCalls.push(name);
      return { data: name === "accept_my_invitations" ? state.accepted : null, error: null };
    },
    auth: {
      signInWithPassword: async (creds: { email: string; password: string }) => {
        state.signInCalls.push(creds);
        return { error: state.signInErrors.shift() ?? null };
      },
    },
  }),
}));

const { loginAction } = await import("@/app/(auth)/actions");

function form(email: string, password: string, next = "/personalities") {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  f.set("next", next);
  return f;
}

async function run(f: FormData) {
  try {
    return { state: await loginAction({ status: "idle" }, f) };
  } catch (error) {
    return { redirect: (error as Error).message.replace("REDIRECT ", "") };
  }
}

beforeEach(() => {
  state.hasAdmin = true;
  state.pendingInvite = true;
  state.createUserCalls = [];
  state.createUserError = null;
  state.signInCalls = [];
  state.signInErrors = [];
  state.rpcCalls = [];
  state.accepted = [];
  state.attemptsCount = 0;
});

describe("primeiro acesso do convidado", () => {
  it("convite válido e sem conta: cria a conta com a senha digitada, entra e abre a agência", async () => {
    state.signInErrors = [{ code: "invalid_credentials" }, null];
    state.accepted = [{ role: "agency", scope_type: "agency", scope_id: "ag-1" }];
    const out = await run(form("GrupoQuantso@gmail.com", "minhasenha123"));
    expect(out.redirect).toBe("/agencia");
    expect(state.createUserCalls).toEqual([{ email: "grupoquantso@gmail.com", password: "minhasenha123", email_confirm: true, app_metadata: { invite_first_access: true } }]);
    expect(state.signInCalls.map((c) => c.email)).toEqual(["grupoquantso@gmail.com", "grupoquantso@gmail.com"]);
    expect(state.rpcCalls).toContain("accept_my_invitations");
    expect(state.inviteQuery).toContainEqual(["eq:status", "pending"]);
    expect(state.inviteQuery).toContainEqual(["ilike:email", "grupoquantso@gmail.com"]);
  });

  it("senha curta no primeiro acesso: pede 8 caracteres e não cria nada", async () => {
    state.signInErrors = [{ code: "invalid_credentials" }];
    const out = await run(form("grupoquantso@gmail.com", "123"));
    expect(out.state).toEqual({ status: "error", fieldErrors: { password: "passwordTooShort" } });
    expect(state.createUserCalls).toEqual([]);
  });

  it("sem convite: erro normal de login, nenhuma conta criada", async () => {
    state.pendingInvite = false;
    state.signInErrors = [{ code: "invalid_credentials" }];
    const out = await run(form("qualquer@exemplo.com", "minhasenha123"));
    expect(out.state).toEqual({ status: "error", error: "invalidCredentials" });
    expect(state.createUserCalls).toEqual([]);
  });

  it("conta já existente com senha errada: nunca entra nem troca a senha", async () => {
    state.signInErrors = [{ code: "invalid_credentials" }];
    state.createUserError = { code: "email_exists", message: "already registered" };
    const out = await run(form("grupoquantso@gmail.com", "outrasenha99"));
    expect(out.state).toEqual({ status: "error", error: "invalidCredentials" });
    expect(state.signInCalls).toHaveLength(1);
  });

  it("muitas tentativas: limite do cadastro rápido vale aqui", async () => {
    state.signInErrors = [{ code: "invalid_credentials" }];
    state.attemptsCount = 999;
    const out = await run(form("grupoquantso@gmail.com", "minhasenha123"));
    expect(out.state).toEqual({ status: "error", error: "tooManyRequests" });
    expect(state.createUserCalls).toEqual([]);
  });

  it("sem service role: login normal, sem primeiro acesso", async () => {
    state.hasAdmin = false;
    state.signInErrors = [{ code: "invalid_credentials" }];
    expect((await run(form("grupoquantso@gmail.com", "minhasenha123"))).state).toEqual({ status: "error", error: "invalidCredentials" });
  });

  it("quem já tem conta e foi convidado: o login aceita e abre a área do convite", async () => {
    state.accepted = [{ role: "brand", scope_type: "brand", scope_id: "b-1" }];
    expect((await run(form("dono@marca.com", "senha-certa-1"))).redirect).toBe("/marca");
    state.accepted = [];
    expect((await run(form("dono@marca.com", "senha-certa-1", "/explore"))).redirect).toBe("/explore");
  });
});

describe("área depois do aceite", () => {
  it("primeiro convite aceito manda; item com erro é ignorado", () => {
    expect(portalHomeForAccepted([])).toBeNull();
    expect(portalHomeForAccepted([{ id: "x", error: "agency_member_elsewhere" } as never, { scope_type: "brand" }])).toBe("/marca");
    expect(portalHomeForAccepted([{ scope_type: "talent" }])).toBe("/creator/escritorio");
    expect(portalHomeForAccepted([{ scope_type: "seller_org" }])).toBe("/seller");
    expect(portalHomeForAccepted([{ scope_type: "desconhecido" }])).toBeNull();
  });
});
