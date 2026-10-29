import { beforeEach, describe, expect, it, vi } from "vitest";

// Menu do app (UserMenu): só foto real. Herói ou não, sem foto o avatar vem vazio e o menu mostra as
// iniciais (nada de ilustração de reserva); o resumo nem consulta mais o perfil de herói.

const state = vi.hoisted(() => ({
  roles: ["consumer"] as string[],
  avatar: null as string | null,
  hero: null as { id: string } | null,
  heroError: null as { message: string } | null,
  queries: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "helena@example.com", user_metadata: {} } } }) },
    from: (table: string) => {
      const filters: string[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => (filters.push(`${col}=${String(val)}`), chain),
        is: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          state.queries.push(`${table}?${filters.join("&")}`);
          if (table === "profiles") return { data: { id: "u1", display_name: "Herói Demo (Helena Vilar)", avatar_url: state.avatar }, error: null };
          if (table === "creator_profiles") return { data: state.heroError ? null : state.hero, error: state.heroError };
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: table === "role_assignments" ? state.roles.map((role) => ({ role })) : null, error: null }),
      };
      return chain;
    },
  }),
}));

const { getSessionSummary } = await import("@/lib/auth/session");

beforeEach(() => {
  state.roles = ["consumer"];
  state.avatar = null;
  state.hero = null;
  state.heroError = null;
  state.queries = [];
});

describe("getSessionSummary: avatar só com foto real", () => {
  it("herói ativo sem foto: sem avatar (o menu mostra as iniciais), sem consultar o perfil de herói", async () => {
    state.roles = ["consumer", "creator"];
    state.hero = { id: "c1" };
    expect((await getSessionSummary())?.avatarUrl).toBeNull();
    expect(state.queries.some((q) => q.startsWith("creator_profiles"))).toBe(false);
  });

  it("avatar salvo vai como está (o Avatar decide: foto real aparece, ilustração antiga vira as iniciais)", async () => {
    state.roles = ["creator"];
    state.avatar = "/heroes/helena-vilar-avatar.webp";
    expect((await getSessionSummary())?.avatarUrl).toBe("/heroes/helena-vilar-avatar.webp");
    state.avatar = "/placeholders/avatar-6.svg";
    expect((await getSessionSummary())?.avatarUrl).toBe("/placeholders/avatar-6.svg");
  });

  it("sem o papel ou perfil inativo: sem avatar, como o herói", async () => {
    state.hero = { id: "c1" };
    expect((await getSessionSummary())?.avatarUrl).toBeNull();
    state.roles = ["creator"];
    state.hero = null;
    expect((await getSessionSummary())?.avatarUrl).toBeNull();
  });
});
