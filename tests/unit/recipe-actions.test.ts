import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecipeDraft, deleteRecipeDraft, duplicateRecipe, publishRecipe, registerRecipeMedia, saveRecipe, submitRecipe } from "@/app/creator/recipes/actions";
import { cleanupRecipeOrphans } from "@/app/api/cron/_lib/recipe-orphans";
import { buildPayload, emptyDraft } from "@/lib/recipes/draft";

// Actions do Portal do Chef sem Next, Supabase nem Cloudflare: dono e herói vêm da sessão, erros do
// banco viram códigos (stale_draft, recipe_incomplete com os itens, invalid_payload com o caminho),
// os dois modos de revisão escolhem a RPC certa, a foto com bytes que não batem é apagada e a
// exclusão do rascunho limpa o Storage. Também a limpeza diária das fotos órfãs.

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  OTHER: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  FILE: "5d1c6f0e-3f0a-4c1e-9f7a-2b8d4e6a1c33",
}));

type Res = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } as { id: string } | null,
  isCreator: true,
  creatorId: "a3bb189e-8bf9-4888-9912-ace4e6543002" as string | null,
  content: null as Record<string, unknown> | null,
  body: null as Record<string, unknown> | null,
  rpc: {} as Record<string, Res | Res[]>,
  rpcs: [] as { fn: string; args?: Record<string, unknown> }[],
  downloads: {} as Record<string, Uint8Array>,
  removed: [] as string[][],
  inserted: [] as Record<string, unknown>[],
  streamDeleted: [] as string[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => Object.assign((key: string, values?: Record<string, unknown>) => (values?.title ? `${values.title} (cópia)` : `${ns}.${key}`), { has: () => true }),
  getLocale: async () => "pt-BR",
}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user, hasRole: async (r: string) => r === "creator" && state.isCreator }));
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => false,
  createAdminClient: () => {
    throw new Error("sem service role nos testes");
  },
}));
vi.mock("@/lib/video", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/video")>();
  return {
    ...actual,
    getStreamProvider: () => ({
      deleteVideo: async (uid: string) => void state.streamDeleted.push(uid),
      getVideoStatus: async () => ({ state: "ready", durationSec: 30, creatorId: state.creatorId, reason: null }),
      createUploadUrl: async () => {
        throw new Error("não usado");
      },
    }),
  };
});

function chain(table: string) {
  let op = "select";
  let payload: Record<string, unknown> | undefined;
  let head = false;
  const row = () => (table === "content" ? state.content : table === "content_bodies" ? state.body : table === "recipe_media" ? { id: "m1", role: "gallery", position: 1, alt_text: "Foto", width: 10, height: 10, content_id: ids.CONTENT } : null);
  const result = async () => {
    if (op === "insert" && table === "content") {
      state.inserted.push(payload!);
      return { data: { id: ids.CONTENT, slug: String(payload!.slug) }, error: null };
    }
    if (head) return { data: null, count: 0, error: null };
    return { data: row(), error: null };
  };
  const c: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) head = true;
      return c;
    },
    insert: (p: Record<string, unknown>) => {
      op = "insert";
      payload = p;
      return c;
    },
    update: () => c,
    delete: () => c,
    eq: () => c,
    in: () => c,
    gte: () => c,
    order: () => c,
    limit: () => c,
    maybeSingle: result,
    single: result,
    then: (resolve: (v: unknown) => void) => result().then(resolve),
  };
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.rpcs.push({ fn, args });
      if (fn === "my_creator_id") return { data: state.creatorId, error: null };
      if (fn === "public_settings") return { data: {}, error: null };
      const configured = state.rpc[fn];
      if (Array.isArray(configured)) return configured.shift() ?? { data: null, error: null };
      return configured ?? { data: null, error: null };
    },
    from: (table: string) => chain(table),
    storage: {
      from: () => ({
        download: async (path: string) => {
          const bytes = state.downloads[path];
          return bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: "not found" } };
        },
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));

const UPDATED = "2026-10-22T10:00:00.000Z";
function ownDraftRow(over: Record<string, unknown> = {}) {
  return { id: ids.CONTENT, slug: "bowl-abc", title: "Bowl", status: "draft", review_status: "none", published_at: null, creator_id: ids.CREATOR, type: "recipe", updated_at: UPDATED, ...over };
}
function payload() {
  const d = emptyDraft();
  d.title = "Bowl";
  const r = buildPayload(d);
  if (!r.ok) throw new Error("payload inválido");
  return r.payload;
}
const calls = (fn: string) => state.rpcs.filter((r) => r.fn === fn);

beforeEach(() => {
  state.user = { id: ids.USER };
  state.isCreator = true;
  state.creatorId = ids.CREATOR;
  state.content = ownDraftRow();
  state.body = { media_provider: "none", media_ref: null };
  state.rpc = {};
  state.rpcs = [];
  state.downloads = {};
  state.removed = [];
  state.inserted = [];
  state.streamDeleted = [];
  state.revalidated = [];
});

describe("saveRecipe", () => {
  it("grava pela recipe_save com o updated_at esperado e devolve o novo", async () => {
    state.rpc.recipe_save = { data: { updated_at: "2026-10-22T10:05:00Z" }, error: null };
    const r = await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: UPDATED });
    expect(r).toEqual({ ok: true, updatedAt: "2026-10-22T10:05:00Z" });
    expect(calls("recipe_save")[0].args).toMatchObject({ p_content: ids.CONTENT, p_expected_updated_at: UPDATED });
    expect(state.revalidated).toContain(`/creator/recipes/${ids.CONTENT}/preview`);
  });
  it("stale_draft vira código (o editor abre o diálogo de conflito)", async () => {
    state.rpc.recipe_save = { data: null, error: { message: "stale_draft" } };
    expect(await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: "2026-10-22T09:00:00Z" })).toEqual({ ok: false, error: "stale_draft" });
  });
  it("sobrescrever usa o updated_at atual do banco", async () => {
    state.rpc.recipe_save = { data: { updated_at: "x" }, error: null };
    await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: "2026-10-22T09:00:00Z", overwrite: true });
    expect(calls("recipe_save")[0].args?.p_expected_updated_at).toBe(UPDATED);
  });
  it("invalid_payload do banco volta com o caminho do campo", async () => {
    state.rpc.recipe_save = { data: null, error: { message: "invalid_payload: ingredients.3.unit" } };
    expect(await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: UPDATED })).toEqual({ ok: false, error: "invalid_payload", detail: "ingredients.3.unit" });
  });
  it("payload fora do formato nem chega ao banco", async () => {
    const bad = { ...payload(), categories: ["Almoço!"] };
    expect(await saveRecipe({ id: ids.CONTENT, payload: bad, expectedUpdatedAt: UPDATED })).toEqual({ ok: false, error: "invalid_payload", detail: "categories.0" });
    expect(calls("recipe_save")).toHaveLength(0);
  });
  it("receita de outro herói ou conteúdo que não é receita: recusa sem chamar a RPC", async () => {
    state.content = ownDraftRow({ creator_id: ids.OTHER });
    expect(await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: UPDATED })).toEqual({ ok: false, error: "forbidden" });
    state.content = ownDraftRow({ type: "article" });
    expect(await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: UPDATED })).toEqual({ ok: false, error: "not_recipe" });
    expect(calls("recipe_save")).toHaveLength(0);
  });
  it("sem sessão de herói", async () => {
    state.user = null;
    expect(await saveRecipe({ id: ids.CONTENT, payload: payload(), expectedUpdatedAt: UPDATED })).toEqual({ ok: false, error: "unauthenticated" });
  });
});

describe("createRecipeDraft", () => {
  it("cria o rascunho (receita, gastronomia, capa placeholder, licença própria) e grava os básicos", async () => {
    state.rpc.recipe_save = { data: { updated_at: "2026-10-22T10:01:00Z" }, error: null };
    const r = await createRecipeDraft({ payload: payload() });
    expect(r).toEqual({ ok: true, id: ids.CONTENT, updatedAt: "2026-10-22T10:01:00Z" });
    expect(state.inserted[0]).toMatchObject({ creator_id: ids.CREATOR, created_by: ids.USER, type: "recipe", pillar: "gastronomy", cover_url: "/placeholders/cover-gastronomy-1.svg", media_license_kind: "own", source_locale: "pt-BR" });
  });
  it("se a gravação estruturada falha, o rascunho recém-criado é excluído", async () => {
    state.rpc.recipe_save = { data: null, error: { message: "invalid_category" } };
    expect(await createRecipeDraft({ payload: payload() })).toEqual({ ok: false, error: "invalid_category" });
    expect(calls("creator_delete_recipe_draft")[0].args).toEqual({ p_content: ids.CONTENT });
  });
});

describe("publicar: os dois modos de revisão", () => {
  it("revisão desligada: publica agora (1 parâmetro) e troca o slug provisório enquanto nunca foi ao ar", async () => {
    state.rpc.creator_publish_content = { data: { slug: "bowl-final" }, error: null };
    expect(await publishRecipe({ id: ids.CONTENT })).toEqual({ ok: true, slug: "bowl-final", scheduled: false });
    expect(calls("creator_set_draft_slug")).toHaveLength(1);
    expect(calls("creator_publish_content")[0].args).toEqual({ p_content: ids.CONTENT });
  });
  it("agendar manda a data; data no passado nem chama o banco", async () => {
    state.rpc.creator_publish_content = { data: { slug: "bowl" }, error: null };
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect(await publishRecipe({ id: ids.CONTENT, publishAt: at })).toMatchObject({ ok: true, scheduled: true });
    expect(calls("creator_publish_content")[0].args).toEqual({ p_content: ids.CONTENT, p_publish_at: at });
    state.rpcs = [];
    expect(await publishRecipe({ id: ids.CONTENT, publishAt: "2020-01-01T00:00:00Z" })).toEqual({ ok: false, error: "invalid_publish_at" });
    expect(calls("creator_publish_content")).toHaveLength(0);
  });
  it("revisão ligada: o banco recusa a publicação direta com review_required", async () => {
    state.rpc.creator_publish_content = { data: null, error: { message: "review_required" } };
    expect(await publishRecipe({ id: ids.CONTENT })).toEqual({ ok: false, error: "review_required" });
  });
  it("revisão ligada: envia com data sugerida pela sobrecarga de 2 parâmetros", async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString();
    expect(await submitRecipe({ id: ids.CONTENT, requestedPublishAt: at })).toEqual({ ok: true });
    expect(calls("submit_content_for_review")[0].args).toEqual({ p_content: ids.CONTENT, p_requested_publish_at: at });
    await submitRecipe({ id: ids.CONTENT });
    expect(calls("submit_content_for_review")[1].args).toEqual({ p_content: ids.CONTENT });
  });
  it("checklist do banco: recipe_incomplete volta com os itens", async () => {
    state.rpc.creator_publish_content = { data: null, error: { message: "recipe_incomplete: cover,allergens", code: "23514" } };
    expect(await publishRecipe({ id: ids.CONTENT })).toEqual({ ok: false, error: "recipe_incomplete", detail: "cover,allergens" });
  });
  it("só rascunho publica", async () => {
    state.content = ownDraftRow({ status: "published" });
    expect(await publishRecipe({ id: ids.CONTENT })).toEqual({ ok: false, error: "not_draft" });
  });
});

describe("registerRecipeMedia: bytes mágicos e limpeza do Storage", () => {
  const path = `${ids.CREATOR}/${ids.CONTENT}/${ids.FILE}.webp`;
  const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const input = { contentId: ids.CONTENT, path, role: "gallery" as const, alt: "Bowl", rights: true as const, width: 2048, height: 1536 };

  it("bytes de PNG num arquivo .webp: apaga o objeto e recusa sem registrar", async () => {
    state.downloads[path] = PNG;
    expect(await registerRecipeMedia(input)).toEqual({ ok: false, error: "invalid_image" });
    expect(state.removed).toEqual([[path]]);
    expect(calls("recipe_register_media")).toHaveLength(0);
  });
  it("caminho de outro herói ou de outra receita: invalid_path", async () => {
    expect(await registerRecipeMedia({ ...input, path: `${ids.OTHER}/${ids.CONTENT}/${ids.FILE}.webp` })).toEqual({ ok: false, error: "invalid_path" });
    expect(await registerRecipeMedia({ ...input, path: "../../etc/passwd" })).toEqual({ ok: false, error: "invalid_path" });
  });
  it("sem a caixa de direito de uso: rights_required", async () => {
    expect(await registerRecipeMedia({ ...input, rights: false as unknown as true })).toEqual({ ok: false, error: "rights_required" });
  });
  it("bytes certos: registra pela RPC (tipo e tamanho vêm do Storage) e devolve a foto", async () => {
    state.downloads[path] = WEBP;
    state.rpc.recipe_register_media = { data: "m1", error: null };
    const r = await registerRecipeMedia(input);
    expect(r).toEqual({ ok: true, media: { id: "m1", role: "gallery", position: 1, alt: "Foto", width: 10, height: 10 } });
    expect(calls("recipe_register_media")[0].args).toMatchObject({ p_content: ids.CONTENT, p_path: path, p_role: "gallery", p_rights: true });
    expect(state.removed).toEqual([]);
  });
  it("cota estourada no registro: o objeto enviado é apagado e o código volta traduzível", async () => {
    state.downloads[path] = WEBP;
    state.rpc.recipe_register_media = { data: null, error: { message: "upload_quota_exceeded" } };
    expect(await registerRecipeMedia(input)).toEqual({ ok: false, error: "upload_quota_exceeded" });
    expect(state.removed).toEqual([[path]]);
  });
  it("objeto que não chegou ao Storage: object_not_found", async () => {
    expect(await registerRecipeMedia(input)).toEqual({ ok: false, error: "object_not_found" });
  });
});

describe("excluir e duplicar", () => {
  it("excluir rascunho apaga as fotos devolvidas pela RPC e tenta apagar o vídeo do Stream", async () => {
    state.rpc.creator_delete_recipe_draft = { data: { id: ids.CONTENT, paths: ["a/b/c.webp", "a/b/d.jpg"], uid: "0123456789abcdef0123456789abcdef" }, error: null };
    expect(await deleteRecipeDraft({ id: ids.CONTENT })).toEqual({ ok: true });
    expect(state.removed).toEqual([["a/b/c.webp", "a/b/d.jpg"]]);
    expect(state.streamDeleted).toEqual(["0123456789abcdef0123456789abcdef"]);
  });
  it("excluir algo que já esteve no ar: already_published, nada apagado no Storage", async () => {
    state.rpc.creator_delete_recipe_draft = { data: null, error: { message: "already_published" } };
    expect(await deleteRecipeDraft({ id: ids.CONTENT })).toEqual({ ok: false, error: "already_published" });
    expect(state.removed).toEqual([]);
  });
  it("duplicar tenta outro sufixo quando o slug já existe (até 3 vezes)", async () => {
    state.rpc.creator_duplicate_recipe = [
      { data: null, error: { message: "slug_taken" } },
      { data: null, error: { message: "slug_taken" } },
      { data: "99999999-9999-4999-8999-999999999999", error: null },
    ];
    expect(await duplicateRecipe({ id: ids.CONTENT })).toEqual({ ok: true, id: "99999999-9999-4999-8999-999999999999" });
    const dup = calls("creator_duplicate_recipe");
    expect(dup).toHaveLength(3);
    expect(dup[0].args?.p_title).toBe("Bowl (cópia)");
    expect(new Set(dup.map((d) => d.args?.p_slug)).size).toBe(3);
  });
  it("origem travada pelo admin: source_locked", async () => {
    state.rpc.creator_duplicate_recipe = { data: null, error: { message: "source_locked" } };
    expect(await duplicateRecipe({ id: ids.CONTENT })).toEqual({ ok: false, error: "source_locked" });
  });
});

describe("cron: fotos de receita órfãs", () => {
  function admin(result: Res, removeError = false) {
    const removed: string[][] = [];
    return {
      removed,
      client: {
        rpc: async () => result,
        storage: { from: () => ({ remove: async (paths: string[]) => (removed.push(paths), { data: null, error: removeError ? { message: "x" } : null }) }) },
      } as unknown as Parameters<typeof cleanupRecipeOrphans>[0],
    };
  }
  it("apaga pela API do Storage em lotes de 100", async () => {
    const paths = Array.from({ length: 150 }, (_, i) => `c/r/${i}.webp`);
    const a = admin({ data: paths, error: null });
    expect(await cleanupRecipeOrphans(a.client)).toEqual({ recipe_orphans_deleted: 150, recipe_orphans_failed: 0 });
    expect(a.removed.map((c) => c.length)).toEqual([100, 50]);
  });
  it("banco sem a 0028 (PGRST202): pula sem erro", async () => {
    const a = admin({ data: null, error: { message: "not found", code: "PGRST202" } });
    expect(await cleanupRecipeOrphans(a.client)).toEqual({ recipe_orphans_skipped: "not_migrated" });
  });
  it("falha do Storage conta como falha, sem lançar", async () => {
    const a = admin({ data: ["x/y/z.webp"], error: null }, true);
    expect(await cleanupRecipeOrphans(a.client)).toEqual({ recipe_orphans_deleted: 0, recipe_orphans_failed: 1 });
  });
  it("outro erro do banco sobe (o cron registra e segue)", async () => {
    const a = admin({ data: null, error: { message: "boom" } });
    await expect(cleanupRecipeOrphans(a.client)).rejects.toThrow("boom");
  });
});
