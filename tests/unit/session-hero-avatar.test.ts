import { beforeEach, describe, expect, it, vi } from "vitest";
import { HERO_DEFAULT_AVATAR } from "@/lib/avatar/constants";

// Menu do app (UserMenu) do herói ativo sem avatar: a ilustração da página pública, a mesma do
// cabeçalho do /profile. Fora disso (sem o papel, perfil inativo, avatar salvo) nada muda.

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

describe("getSessionSummary: avatar do herói ativo", () => {
  it("herói ativo sem avatar: a ilustração da página pública", async () => {
    state.roles = ["consumer", "creator"];
    state.hero = { id: "c1" };
    expect((await getSessionSummary())?.avatarUrl).toBe(HERO_DEFAULT_AVATAR);
    expect(state.queries).toContain("creator_profiles?user_id=u1&status=active");
  });

  it("avatar salvo vence e nem consulta o perfil de herói", async () => {
    state.roles = ["creator"];
    state.hero = { id: "c1" };
    state.avatar = "/placeholders/avatar-6.svg";
    expect((await getSessionSummary())?.avatarUrl).toBe("/placeholders/avatar-6.svg");
    expect(state.queries.some((q) => q.startsWith("creator_profiles"))).toBe(false);
  });

  it("sem o papel, perfil inativo ou erro na leitura: sem avatar (o menu sorteia pelo nome, como antes)", async () => {
    state.hero = { id: "c1" };
    expect((await getSessionSummary())?.avatarUrl).toBeNull();
    expect(state.queries.some((q) => q.startsWith("creator_profiles"))).toBe(false);
    state.roles = ["creator"];
    state.hero = null;
    expect((await getSessionSummary())?.avatarUrl).toBeNull();
    state.hero = { id: "c1" };
    state.heroError = { message: "boom" };
    expect((await getSessionSummary())?.avatarUrl).toBeNull();
  });
});
