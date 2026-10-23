import { beforeEach, describe, expect, it, vi } from "vitest";

// Tema: o botão claro/escuro grava o cookie no navegador e a action dele só guarda no perfil. Se a
// action também mandasse Set-Cookie, a resposta de um clique anterior podia chegar depois do clique
// seguinte e voltar o tema antigo (a instabilidade do theme.spec). Os formulários seguem gravando o cookie.

const state = vi.hoisted(() => ({
  cookies: [] as { name: string; value: string; maxAge?: number }[],
  updates: [] as { theme: string; id: string }[],
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string, opts?: { maxAge?: number }) => void state.cookies.push({ name, value, maxAge: opts?.maxAge }) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      update: (row: { theme: string }) => ({ eq: async (_col: string, id: string) => void state.updates.push({ theme: row.theme, id }) }),
    }),
  }),
}));

const { saveThemePreferenceAction, setThemeAction } = await import("@/lib/theme/actions");
const { THEME_COOKIE, THEME_COOKIE_MAX_AGE } = await import("@/lib/theme/constants");

beforeEach(() => {
  state.cookies = [];
  state.updates = [];
  state.user = { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" };
});

describe("ações de tema", () => {
  it("botão (saveThemePreferenceAction): guarda no perfil e não manda Set-Cookie", async () => {
    expect(await saveThemePreferenceAction("dark")).toEqual({ ok: true });
    expect(state.cookies).toEqual([]);
    expect(state.updates).toEqual([{ theme: "dark", id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }]);
  });
  it("sem sessão: nada no perfil; valor inválido nem chega ao banco", async () => {
    state.user = null;
    expect(await saveThemePreferenceAction("light")).toEqual({ ok: true });
    expect(state.updates).toEqual([]);
    expect(await saveThemePreferenceAction("roxo" as never)).toEqual({ ok: false });
  });
  it("formulários (setThemeAction): cookie de 1 ano mais o perfil", async () => {
    expect(await setThemeAction("light")).toEqual({ ok: true });
    expect(state.cookies).toEqual([{ name: THEME_COOKIE, value: "light", maxAge: THEME_COOKIE_MAX_AGE }]);
    expect(THEME_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
    expect(state.updates).toHaveLength(1);
  });
});
