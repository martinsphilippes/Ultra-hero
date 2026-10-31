import { beforeEach, describe, expect, it, vi } from "vitest";
import { creatorActionContext } from "@/app/creator/_lib/creator-action";
import { createRecipeDraft } from "@/app/creator/recipes/actions";
import { suggestLink } from "@/app/creator/links/actions";
import { buildPayload, emptyDraft } from "@/lib/recipes/draft";

// Quem grava pelo herói (0045): conteúdos, receitas e vínculos só o admin pelo herói escolhido; o
// herói comum fica só com o Novo post; o herói nunca vem do cliente.

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  OWN: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  ACTING: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  PRODUCT: "5d1c6f0e-3f0a-4c1e-9f7a-2b8d4e6a1c33",
}));

const state = vi.hoisted(() => ({
  admin: false,
  creator: true,
  acting: { status: "none" } as { status: string; hero?: { id: string } },
  clients: [] as (string | null)[],
  rpcs: [] as string[],
  inserts: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k, getLocale: async () => "pt-BR" }));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: ids.USER }),
  hasRole: async (r: string) => (r === "admin" ? state.admin : r === "creator" && state.creator),
  // papel de herói com escopo do herói (o escopo "talent" do escritório não vale para o Novo post)
  getRoles: async () => (state.creator ? [{ role: "creator", scope_type: "creator" }] : []),
}));
vi.mock("@/lib/acting-hero/server", () => ({
  getActingHero: async () => state.acting,
  actingClient: async (id: string) => (await import("@/lib/supabase/server")).createClient({ actingHeroId: id }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async (options: { actingHeroId?: string } = {}) => {
    state.clients.push(options.actingHeroId ?? null);
    return {
      rpc: async (fn: string) => {
        state.rpcs.push(fn);
        return { data: fn === "my_creator_id" ? ids.OWN : null, error: null };
      },
      from: (table: string) => {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          insert: () => {
            state.inserts.push(table);
            return c;
          },
          maybeSingle: async () => ({ data: { creator_id: ids.ACTING }, error: null }),
          single: async () => ({ data: null, error: { message: "não usado" } }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return c;
      },
    };
  },
}));

beforeEach(() => {
  state.admin = false;
  state.creator = true;
  state.acting = { status: "none" };
  state.clients = [];
  state.rpcs = [];
  state.inserts = [];
});

describe("creatorActionContext", () => {
  it("herói comum: Novo post com o próprio perfil; gestão (conteúdos, receitas, vínculos) recusada", async () => {
    expect(await creatorActionContext("post")).toMatchObject({ ok: true, creatorId: ids.OWN, actingFor: null });
    expect(await creatorActionContext()).toEqual({ ok: false, error: "forbidden" });
    expect(await creatorActionContext("manage")).toEqual({ ok: false, error: "forbidden" });
    // o cliente do herói nunca leva o cabeçalho de outro herói
    expect(state.clients.every((c) => c === null)).toBe(true);
  });

  it("herói comum não age por outro herói nem com um herói 'escolhido' (o modo é só do admin)", async () => {
    state.acting = { status: "ok", hero: { id: ids.ACTING } };
    expect(await creatorActionContext("post")).toMatchObject({ ok: true, creatorId: ids.OWN });
    expect(await creatorActionContext("manage")).toEqual({ ok: false, error: "forbidden" });
  });

  it("admin: sem herói escolhido pede a escolha; com herói, grava por ele com o cabeçalho", async () => {
    state.admin = true;
    expect(await creatorActionContext("manage")).toEqual({ ok: false, error: "acting_hero_required" });
    expect(await creatorActionContext("post")).toEqual({ ok: false, error: "acting_hero_required" });
    state.acting = { status: "unavailable" };
    expect(await creatorActionContext("manage")).toEqual({ ok: false, error: "acting_unavailable" });
    state.acting = { status: "ok", hero: { id: ids.ACTING } };
    expect(await creatorActionContext("manage")).toMatchObject({ ok: true, creatorId: ids.ACTING, actingFor: ids.ACTING });
    expect(await creatorActionContext("post")).toMatchObject({ ok: true, creatorId: ids.ACTING, actingFor: ids.ACTING });
    expect(state.clients).toEqual([ids.ACTING, ids.ACTING]);
  });

  it("perfil de chef ('own'): só o próprio perfil, sem modo do admin", async () => {
    state.admin = true;
    state.acting = { status: "ok", hero: { id: ids.ACTING } };
    expect(await creatorActionContext("own")).toMatchObject({ ok: true, creatorId: ids.OWN, actingFor: null });
  });
});

describe("actions de gestão chamadas direto pelo herói comum", () => {
  it("criar receita e sugerir vínculo: forbidden, sem escrita", async () => {
    const draft = emptyDraft();
    draft.title = "Bolo";
    const built = buildPayload(draft);
    if (!built.ok) throw new Error("payload inválido");
    expect(await createRecipeDraft({ payload: built.payload })).toEqual({ ok: false, error: "forbidden" });
    expect(await suggestLink({ contentId: ids.CONTENT, productId: ids.PRODUCT, note: "" })).toEqual({ ok: false, error: "forbidden" });
    expect(state.inserts).toEqual([]);
  });

  it("admin pelo herói escolhido sugere vínculo no conteúdo do herói", async () => {
    state.admin = true;
    state.acting = { status: "ok", hero: { id: ids.ACTING } };
    expect(await suggestLink({ contentId: ids.CONTENT, productId: ids.PRODUCT, note: "" })).toEqual({ ok: true });
    expect(state.inserts).toEqual(["content_product_links"]);
  });
});
