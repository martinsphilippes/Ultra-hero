import { beforeEach, describe, expect, it, vi } from "vitest";
import { setContentStatusAction } from "@/app/admin/content-actions";

// setContentStatusAction sem Next nem Supabase: o conteúdo atual vem de `server.current` e as
// chamadas de RPC ficam em `server.rpcs` (nenhuma RPC = nada mudou no banco).
const server = vi.hoisted(() => ({
  current: { type: "recipe", status: "published" } as { type: string; status: string } | null,
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" }),
  hasRole: async () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: server.current, error: null }) };
        return chain;
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      server.rpcs.push({ fn, args });
      return { error: null };
    },
  }),
}));

const ID = "5d1f3a2e-8c4b-4e6f-9a7d-2b3c4d5e6f70";
const WHY = "retirada de teste";

describe("setContentStatusAction e receitas (fase 1)", () => {
  beforeEach(() => {
    server.rpcs = [];
    server.current = { type: "recipe", status: "published" };
  });

  it("receita no ar não volta a rascunho: recipe_editor_pending, sem RPC", async () => {
    expect(await setContentStatusAction(ID, "draft", WHY)).toEqual({ ok: false, error: "adminContent.errors.recipe_editor_pending" });
    expect(server.rpcs).toEqual([]);
  });

  it("arquivar receita no ar segue possível (retirada de segurança)", async () => {
    expect(await setContentStatusAction(ID, "archived", WHY)).toEqual({ ok: true, message: "adminContent.content.statusActions.changed" });
    expect(server.rpcs).toEqual([{ fn: "admin_set_content_status", args: { p_content: ID, p_status: "archived", p_justification: WHY } }]);
  });

  it("receita arquivada pode voltar a rascunho (não sai do ar)", async () => {
    server.current = { type: "recipe", status: "archived" };
    expect(await setContentStatusAction(ID, "draft", WHY)).toMatchObject({ ok: true });
    expect(server.rpcs).toHaveLength(1);
  });

  it("outros tipos continuam voltando a rascunho", async () => {
    server.current = { type: "video", status: "published" };
    expect(await setContentStatusAction(ID, "draft", WHY)).toMatchObject({ ok: true });
    expect(server.rpcs).toEqual([{ fn: "admin_set_content_status", args: { p_content: ID, p_status: "draft", p_justification: WHY } }]);
  });
});
