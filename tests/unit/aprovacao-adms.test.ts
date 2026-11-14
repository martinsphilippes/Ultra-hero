import { beforeEach, describe, expect, it, vi } from "vitest";

// 0144: os ADMs também aprovam o acesso, igual à Presidência. Quem decide é o banco (can_approve_access /
// presidency_access_decide, cenários S144); aqui: o que o site manda e como ele se comporta antes e depois da migração.

const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const state = vi.hoisted(() => ({
  rpcCalls: [] as [string, Record<string, unknown> | undefined][],
  results: {} as Record<string, { data: unknown; error: null | { code?: string; message: string } }[]>,
  signedIn: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => (state.signedIn ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } : null),
  requireUser: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.rpcCalls.push([fn, args]);
      // cada RPC responde a fila de resultados programada (o último se repete)
      const queue = state.results[fn] ?? [{ data: null, error: null }];
      return queue.length > 1 ? queue.shift()! : queue[0];
    },
  }),
}));

const { decideAccessAction } = await import("@/app/agencia/aprovacoes/actions");
const { canApproveAccess } = await import("@/lib/access/presidency");
const { agencyNavKeys } = await import("@/lib/agency/roles");

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const idle = { status: "idle" } as const;
const decide = (values: Record<string, string>) => decideAccessAction(idle, form({ userId: USER, expectedProfile: "brand", ...values }));

beforeEach(() => {
  state.rpcCalls = [];
  state.results = {};
  state.signedIn = true;
});

describe("decisão de quem aprova (Presidência ou ADM)", () => {
  it("aprovar na fila manda a situação vista ('pending') junto com o perfil", async () => {
    expect(await decide({ decision: "approved", expectedStatus: "pending" })).toEqual({ status: "done", decision: "approved" });
    expect(state.rpcCalls).toEqual([
      ["presidency_access_decide", { p_user: USER, p_decision: "approved", p_note: null, p_expected_profile: "brand", p_expected_status: "pending" }],
    ]);
  });

  it("reconsiderar em \"Decididos\" manda 'rejected' (a recusa que a tela mostrou)", async () => {
    await decide({ decision: "approved", expectedStatus: "rejected", note: "  Reconsiderado  " });
    expect(state.rpcCalls[0]?.[1]).toMatchObject({ p_note: "Reconsiderado", p_expected_status: "rejected" });
  });

  it("outro aprovador já decidiu: mostra already_decided (a decisão dele não é sobrescrita)", async () => {
    state.results.presidency_access_decide = [{ data: null, error: { code: "P0001", message: "already_decided" } }];
    expect(await decide({ decision: "rejected", expectedStatus: "pending" })).toEqual({ status: "error", error: "already_decided" });
  });

  it("situação vista inválida: recusa antes de ir ao banco", async () => {
    expect(await decide({ decision: "approved", expectedStatus: "approved" })).toEqual({ status: "error", error: "invalid_input" });
    expect(state.rpcCalls).toEqual([]);
  });

  it("banco ainda sem a 0144 (assinatura sem a situação vista): repete a mesma decisão sem ela", async () => {
    state.results.presidency_access_decide = [
      { data: null, error: { code: "PGRST202", message: "Could not find the function public.presidency_access_decide(...)" } },
      { data: { status: "approved", changed: true }, error: null },
    ];
    expect(await decide({ decision: "approved", expectedStatus: "pending" })).toEqual({ status: "done", decision: "approved" });
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.rpcCalls[1]?.[1]).toEqual({ p_user: USER, p_decision: "approved", p_note: null, p_expected_profile: "brand" });
  });

  it("recusa do banco (ex.: quem não aprova) vira a mensagem certa, sem nova tentativa (a trava é do banco, S144)", async () => {
    state.results.presidency_access_decide = [{ data: null, error: { code: "42501", message: "forbidden" } }];
    expect(await decide({ decision: "approved", expectedStatus: "pending" })).toEqual({ status: "error", error: "forbidden" });
    expect(state.rpcCalls).toHaveLength(1);
  });
});

describe("quem vê a fila (canApproveAccess)", () => {
  it("o banco diz quem aprova (Presidência e ADMs)", async () => {
    state.results.can_approve_access = [{ data: true, error: null }];
    expect(await canApproveAccess()).toBe(true);
    expect(state.rpcCalls.map(([fn]) => fn)).toEqual(["can_approve_access"]);
  });

  it("banco ainda sem a 0144: vale a regra antiga (só a Presidência), a fila não some na publicação", async () => {
    state.results.can_approve_access = [{ data: null, error: { code: "PGRST202", message: "Could not find the function" } }];
    state.results.is_presidency = [{ data: true, error: null }];
    expect(await canApproveAccess()).toBe(true);
    expect(state.rpcCalls.map(([fn]) => fn)).toEqual(["can_approve_access", "is_presidency"]);
  });

  it("outro erro: não mostra a fila (o banco confere de novo em cada leitura e decisão)", async () => {
    state.results.can_approve_access = [{ data: null, error: { code: "XX000", message: "boom" } }];
    expect(await canApproveAccess()).toBe(false);
    expect(state.rpcCalls.map(([fn]) => fn)).toEqual(["can_approve_access"]);
  });

  it("sem sessão: nem pergunta ao banco", async () => {
    state.signedIn = false;
    expect(await canApproveAccess()).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("menu da indústria", () => {
  it("\"Aprovação de cadastros\" no topo do menu para quem aprova; para os demais, não aparece", () => {
    // gestor+ (o admin da plataforma passa como Adm) também tem Heros no topo: Início, Heros, Aprovação de cadastros
    expect(agencyNavKeys(null, true, { approver: true }).slice(0, 3)).toEqual(["dashboard", "heroes", "approvals"]);
    expect(agencyNavKeys("admin", false, { approver: true })).toContain("approvals");
    expect(agencyNavKeys("admin", false)).not.toContain("approvals");
    expect(agencyNavKeys(null, true)).not.toContain("approvals");
  });
});
