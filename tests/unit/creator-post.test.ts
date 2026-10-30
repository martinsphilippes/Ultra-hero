import { beforeEach, describe, expect, it, vi } from "vitest";
import { discardVideoPost, publishVideoPost, startVideoPost } from "@/app/creator/post/actions";
import { createContent, publishContent, unpublishContent, updateContent } from "@/app/creator/content/actions";
import type { ContentFormValues } from "@/components/editors/types";
import { slugify, uniqueSlug } from "@/app/creator/_lib/slug";
import { MAX_POST_BYTES, durationMinutes, normalizeDuration, uploadPercent, validateDuration, validateVideoFile } from "@/components/creator/post/validation";

// Composer de post em vídeo do herói: server actions sem Next, Supabase nem Cloudflare. Confere que
// dono e uid vêm da sessão/banco (nunca do cliente), o vínculo stream_uploads gravado pelo service
// role, o mapeamento de erros para creator.post.errors e as regras puras de arquivo/duração.

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  OTHER_CREATOR: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  UID: "0123456789abcdef0123456789abcdef",
}));

type Write = { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] };
type Status = { state: string; durationSec: number | null; creatorId: string | null; reason: string | null };

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isCreator: true,
  isAdmin: false,
  creatorId: null as string | null,
  configured: true,
  hasAdmin: true,
  settings: {} as Record<string, unknown>,
  content: null as Record<string, unknown> | null,
  body: null as Record<string, unknown> | null,
  profile: { pillars: ["nutrition", "gastronomy"] } as Record<string, unknown> | null,
  uploadCount: 0,
  rpcError: null as string | null,
  slugTaken: 0,
  discardUid: undefined as string | null | undefined,
  insertError: null as { message: string; code?: string } | null,
  bodyError: null as { message: string; code?: string } | null,
  adminInsertError: null as { message: string } | null,
  status: { state: "ready", durationSec: 95.4, creatorId: null, reason: null } as Status,
  statusError: null as Error | null,
  ticketError: null as Error | null,
  deleteError: null as Error | null,
  tickets: [] as Record<string, unknown>[],
  statusCalls: [] as string[],
  deleted: [] as string[],
  writes: [] as Write[],
  adminWrites: [] as Write[],
  rpcs: [] as { fn: string; args?: Record<string, unknown> }[],
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void state.revalidated.push(path) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
  getLocale: async () => "pt-BR",
}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => state.user,
  hasRole: async (role: string) => (role === "admin" ? state.isAdmin : role === "creator" && state.isCreator),
}));
// admin agindo pelo herói escolhido (0045): o herói vem do cookie revalidado no banco
vi.mock("@/lib/acting-hero/server", () => ({
  getActingHero: async () => ((state.creatorId ? { status: "ok", hero: { id: state.creatorId, slug: "heroi", name: "Herói", avatar_url: null } } : { status: "none" })),
  actingClient: async () => (await import("@/lib/supabase/server")).createClient(),
}));
vi.mock("@/lib/video", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/video")>();
  return {
    ...actual,
    isVideoUploadConfigured: (setting?: unknown) => state.configured && setting !== "off",
    getStreamProvider: () => ({
      createUploadUrl: async (opts: Record<string, unknown>) => {
        state.tickets.push(opts);
        if (state.ticketError) throw state.ticketError;
        return { uploadUrl: "https://upload.cloudflarestream.com/tus/abc", mediaRef: { provider: "cloudflare-stream", id: ids.UID }, expiresAt: "2026-10-21T12:30:00Z", protocol: "tus" };
      },
      getVideoStatus: async (uid: string) => {
        state.statusCalls.push(uid);
        if (state.statusError) throw state.statusError;
        return state.status;
      },
      deleteVideo: async (uid: string) => {
        state.deleted.push(uid);
        if (state.deleteError) throw state.deleteError;
      },
    }),
  };
});

// Cliente do service role: só grava stream_uploads (vínculo, content_id, descarte) e desfaz rascunho.
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => state.hasAdmin,
  createAdminClient: () => {
    if (!state.hasAdmin) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
    return {
      from: (table: string) => {
        const record = (op: string, payload?: Record<string, unknown>) => {
          const entry: Write = { table, op, payload, filters: [] };
          state.adminWrites.push(entry);
          const chain = {
            eq(column: string, value: unknown) {
              entry.filters.push([column, value]);
              return chain;
            },
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: op === "insert" ? state.adminInsertError : null }),
          };
          return chain;
        };
        return {
          insert: (payload: Record<string, unknown>) => record("insert", payload),
          update: (payload: Record<string, unknown>) => record("update", payload),
          delete: () => record("delete"),
        };
      },
    };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.rpcs.push({ fn, args });
      if (fn === "my_creator_id") return { data: state.creatorId, error: null };
      if (fn === "public_settings") return { data: state.settings, error: null };
      if (fn === "creator_set_draft_slug") {
        if (state.slugTaken > 0) {
          state.slugTaken -= 1;
          return { data: null, error: { message: "slug_taken" } };
        }
        if (state.content) state.content = { ...state.content, slug: args?.p_slug };
        return { data: { id: args?.p_content, slug: args?.p_slug }, error: null };
      }
      if (state.rpcError) return { data: null, error: { message: state.rpcError } };
      if (fn === "creator_discard_video_draft") return { data: { id: args?.p_content, uid: state.discardUid === undefined ? ids.UID : state.discardUid }, error: null };
      const status = fn === "creator_unpublish_content" ? "draft" : "published";
      // Como a RPC real: devolve o slug que está na linha (não um valor fixo que esconderia o bug).
      return { data: { id: args?.p_content, slug: state.content?.slug, status }, error: null };
    },
    from: (table: string) => {
      const entry: Write = { table, op: "select", filters: [] };
      const rowFor = () => (table === "content" ? state.content : table === "content_bodies" ? state.body : table === "creator_profiles" ? state.profile : null);
      const result = () => {
        if (entry.op === "insert" && table === "content_bodies") return { data: null, error: state.bodyError };
        if (table === "stream_uploads") return { data: null, error: null, count: state.uploadCount };
        return { data: null, error: null };
      };
      const chain = {
        eq(column: string, value: unknown) {
          entry.filters.push([column, value]);
          return chain;
        },
        gte(column: string, value: unknown) {
          entry.filters.push([`${column}>=`, value]);
          return chain;
        },
        maybeSingle: async () => ({ data: rowFor(), error: null }),
        select: () => ({
          single: async () =>
            state.insertError ? { data: null, error: state.insertError } : { data: { id: ids.CONTENT, slug: `${String(entry.payload?.slug)}` }, error: null },
        }),
        then: (resolve: (v: unknown) => void) => resolve(result()),
      };
      return {
        select: () => chain,
        insert: (payload: Record<string, unknown>) => {
          Object.assign(entry, { op: "insert", payload });
          state.writes.push(entry);
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          Object.assign(entry, { op: "update", payload });
          state.writes.push(entry);
          return chain;
        },
        delete: () => {
          entry.op = "delete";
          state.writes.push(entry);
          return chain;
        },
        upsert: async (payload: Record<string, unknown>) => {
          Object.assign(entry, { op: "upsert", payload });
          state.writes.push(entry);
          return { error: null };
        },
      };
    },
  }),
}));

beforeEach(() => {
  state.user = { id: ids.USER };
  state.isCreator = true;
  state.isAdmin = false;
  state.creatorId = ids.CREATOR;
  state.configured = true;
  state.hasAdmin = true;
  state.settings = { "video.provider": "cloudflare_stream" };
  state.content = { id: ids.CONTENT, slug: "post-em-video-abc123", status: "draft", creator_id: ids.CREATOR, published_at: null, title: "Treino de perna" };
  state.body = { media_provider: "cloudflare_stream", media_ref: ids.UID };
  state.profile = { pillars: ["nutrition", "gastronomy"] };
  state.uploadCount = 0;
  state.rpcError = null;
  state.slugTaken = 0;
  state.discardUid = undefined;
  state.insertError = null;
  state.bodyError = null;
  state.adminInsertError = null;
  state.status = { state: "ready", durationSec: 95.4, creatorId: ids.CREATOR, reason: null };
  state.statusError = null;
  state.ticketError = null;
  state.deleteError = null;
  state.tickets.length = 0;
  state.statusCalls.length = 0;
  state.deleted.length = 0;
  state.writes.length = 0;
  state.adminWrites.length = 0;
  state.rpcs.length = 0;
  state.revalidated.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const START = { fileSize: 48_000_000, fileName: "VID_20261021.mp4", durationSec: 95.4 };
const PUBLISH = { contentId: ids.CONTENT, title: "  Receita de domingo  ", caption: "Arroz de forno em 3 passos.", pillar: "gastronomy" as const };

describe("startVideoPost", () => {
  it("sem configuração do vídeo devolve video_not_configured e não cria ticket nem rascunho", async () => {
    state.configured = false;
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "video_not_configured" });
    expect(state.tickets).toHaveLength(0);
    expect(state.writes).toHaveLength(0);
  });

  it("sem service role no servidor também é 'não configurado' (o vínculo não teria quem gravar)", async () => {
    state.hasAdmin = false;
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "video_not_configured" });
    expect(state.tickets).toHaveLength(0);
    expect(state.rpcs.map((r) => r.fn)).not.toContain("public_settings");
  });

  it("lê o setting video.provider de public_settings", async () => {
    state.settings = { "video.provider": "off" };
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "video_not_configured" });
    expect(state.rpcs.map((r) => r.fn)).toContain("public_settings");
  });

  it("sem papel de herói devolve forbidden; sem sessão, unauthenticated; perfil inativo, creator_unavailable", async () => {
    state.isCreator = false;
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "forbidden" });
    state.isCreator = true;
    state.user = null;
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "unauthenticated" });
    state.user = { id: ids.USER };
    state.creatorId = null;
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "creator_unavailable" });
    expect(state.tickets).toHaveLength(0);
    expect(state.writes).toHaveLength(0);
  });

  it("fluxo feliz: ticket de 180 s, vínculo pelo service role, rascunho com cloudflare_stream + own e content_id no vínculo", async () => {
    const result = await startVideoPost(START);
    expect(result).toEqual({ ok: true, contentId: ids.CONTENT, uploadUrl: "https://upload.cloudflarestream.com/tus/abc" });
    expect(state.tickets[0]).toEqual({ creatorId: ids.CREATOR, maxDurationSec: 180, premium: false, fileSize: 48_000_000, fileName: "VID_20261021.mp4" });

    // vínculo antes do rascunho (o gatilho do corpo exige), com o herói da sessão e a validade do ticket
    expect(state.adminWrites[0]).toEqual({ table: "stream_uploads", op: "insert", payload: { uid: ids.UID, creator_id: ids.CREATOR, expires_at: "2026-10-21T12:30:00Z" }, filters: [] });
    expect(state.adminWrites[1]).toEqual({ table: "stream_uploads", op: "update", payload: { content_id: ids.CONTENT }, filters: [["uid", ids.UID]] });
    expect(state.adminWrites).toHaveLength(2);

    const content = state.writes.find((w) => w.table === "content" && w.op === "insert")!;
    expect(content.payload).toMatchObject({
      creator_id: ids.CREATOR,
      created_by: ids.USER,
      type: "video",
      pillar: "nutrition", // primeiro pilar do herói
      title: "creator.post.draftTitle",
      media_license_kind: "own",
      cover_url: `/media/stream/${ids.UID}/thumbnail`,
      duration_minutes: 2,
      source_locale: "pt-BR",
    });
    expect(String(content.payload?.slug)).toMatch(/^creator-post-drafttitle-[a-z0-9]+$/);

    const body = state.writes.find((w) => w.table === "content_bodies" && w.op === "insert")!;
    expect(body.payload).toEqual({
      content_id: ids.CONTENT,
      body: { kind: "video", intro: "", key_points: [], transcript: [] },
      media_provider: "cloudflare_stream",
      media_ref: ids.UID,
      captions_url: null,
    });
    expect(state.revalidated).toEqual(["/creator", "/creator/content"]);
    expect(state.deleted).toHaveLength(0);
  });

  it("conta os envios do próprio herói na última hora e recusa a partir de 10, sem pedir ticket", async () => {
    state.uploadCount = 9;
    expect(await startVideoPost(START)).toMatchObject({ ok: true });
    state.uploadCount = 10;
    state.tickets.length = 0;
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "too_many_uploads" });
    expect(state.tickets).toHaveLength(0);
  });

  it("vínculo recusado pelo banco: apaga o vídeo no Cloudflare e não cria rascunho", async () => {
    state.adminInsertError = { message: "too_many_uploads" };
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "too_many_uploads" });
    expect(state.deleted).toEqual([ids.UID]);
    expect(state.writes).toHaveLength(0);
    state.deleted.length = 0;
    state.adminInsertError = { message: "connection reset" };
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "upload_failed" });
    expect(state.deleted).toEqual([ids.UID]);
  });

  it("herói sem pilares cai em rotina", async () => {
    state.profile = { pillars: [] };
    await startVideoPost(START);
    expect(state.writes[0].payload).toMatchObject({ pillar: "routine" });
  });

  it("recusa entrada inválida e duração acima do limite antes de falar com o Cloudflare", async () => {
    expect(await startVideoPost({ fileSize: 0, fileName: "a.mp4" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await startVideoPost({ fileSize: MAX_POST_BYTES + 1, fileName: "a.mp4" })).toEqual({ ok: false, error: "file_too_large" });
    expect(await startVideoPost({ ...START, durationSec: 240 })).toEqual({ ok: false, error: "too_long" });
    expect(state.tickets).toHaveLength(0);
  });

  it("mapeia erros do provedor (rede, recusa do Cloudflare, chaves ausentes)", async () => {
    const { CloudflareStreamError, NotConfiguredError } = await import("@/lib/video");
    state.ticketError = new CloudflareStreamError(0, "falha de rede");
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "network" });
    state.ticketError = new CloudflareStreamError(403, "Authentication error");
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "upload_failed" });
    state.ticketError = new CloudflareStreamError(404, "account not found");
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "upload_failed" });
    state.ticketError = new NotConfiguredError("cloudflare-stream", ["CLOUDFLARE_ACCOUNT_ID"]);
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "video_not_configured" });
    expect(state.writes).toHaveLength(0);
    expect(state.adminWrites).toHaveLength(0);
  });

  it("erro do banco ao criar o rascunho: chave de mensagem e envio desfeito (descartado + vídeo apagado)", async () => {
    state.insertError = { message: "new row violates row-level security policy for table \"content\"" };
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "forbidden" });
    expect(state.adminWrites.map((w) => [w.op, Object.keys(w.payload ?? {})])).toEqual([
      ["insert", ["uid", "creator_id", "expires_at"]],
      ["update", ["discarded_at", "content_id"]],
      ["update", ["provider_deleted_at"]],
    ]);
    expect(state.deleted).toEqual([ids.UID]);
  });

  it("corpo recusado pelo gatilho: apaga o rascunho recém-criado e o vídeo", async () => {
    state.bodyError = { message: "stream_media_forbidden" };
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "stream_media_forbidden" });
    expect(state.adminWrites.find((w) => w.table === "content" && w.op === "delete")?.filters).toEqual([
      ["id", ids.CONTENT],
      ["status", "draft"],
    ]);
    expect(state.deleted).toEqual([ids.UID]);
  });
});

describe("publishVideoPost", () => {
  it("vídeo ainda processando devolve processing, mas o texto já fica salvo", async () => {
    state.status = { state: "pending", durationSec: null, creatorId: ids.CREATOR, reason: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "processing" });
    const update = state.writes.find((w) => w.table === "content" && w.op === "update")!;
    expect(update.payload).toEqual({ title: "Receita de domingo", summary: "Arroz de forno em 3 passos.", pillar: "gastronomy" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_set_draft_slug");
  });

  it("envio que não chegou inteiro (pendingupload) → upload_incomplete", async () => {
    state.status = { state: "incomplete", durationSec: null, creatorId: ids.CREATOR, reason: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "upload_incomplete" });
  });

  it("errored → video_failed; cortado pelo limite de duração → too_long; acima de 185 s → too_long", async () => {
    state.status = { state: "errored", durationSec: null, creatorId: ids.CREATOR, reason: "ERR_NON_VIDEO" };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "video_failed" });
    state.status = { state: "errored", durationSec: 200, creatorId: ids.CREATOR, reason: "ERR_DURATION_EXCEED_CONSTRAINT" };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "too_long" });
    state.status = { state: "ready", durationSec: 190, creatorId: ids.CREATOR, reason: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "too_long" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
  });

  it("creator do vídeo tem de ser o herói: outro herói ou campo vazio → forbidden", async () => {
    state.status = { state: "ready", durationSec: 60, creatorId: ids.OTHER_CREATOR, reason: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    state.status = { state: "ready", durationSec: 30, creatorId: null, reason: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
  });

  it("consulta o uid gravado no banco, nunca um vindo do cliente", async () => {
    await publishVideoPost({ ...PUBLISH, uid: "ffffffffffffffffffffffffffffffff" } as typeof PUBLISH);
    expect(state.statusCalls).toEqual([ids.UID]);
  });

  it("sucesso: troca o slug provisório pelo do título final, publica e devolve o slug da linha", async () => {
    const result = await publishVideoPost(PUBLISH);
    const slugCall = state.rpcs.find((r) => r.fn === "creator_set_draft_slug");
    expect(slugCall?.args?.p_content).toBe(ids.CONTENT);
    expect(String(slugCall?.args?.p_slug)).toMatch(/^receita-de-domingo-[a-z0-9]{1,6}$/);
    expect(result).toEqual({ ok: true, slug: slugCall?.args?.p_slug });
    expect(result).not.toEqual({ ok: true, slug: "post-em-video-abc123" });
    const fns = state.rpcs.map((r) => r.fn);
    expect(fns.indexOf("creator_set_draft_slug")).toBeLessThan(fns.indexOf("creator_publish_content"));
    expect(state.rpcs.find((r) => r.fn === "creator_publish_content")?.args).toEqual({ p_content: ids.CONTENT });
    expect(state.writes.filter((w) => w.op === "update").map((w) => w.payload)).toContainEqual({ duration_minutes: 2 });
    expect(state.revalidated).toEqual(["/creator", "/creator/content", "/inicio", "/explore"]);
  });

  it("slug já usado: tenta outro sufixo uma vez; duas colisões viram slug_taken", async () => {
    state.slugTaken = 1;
    expect(await publishVideoPost(PUBLISH)).toMatchObject({ ok: true });
    expect(state.rpcs.filter((r) => r.fn === "creator_set_draft_slug")).toHaveLength(2);
    state.rpcs.length = 0;
    state.content = { ...state.content!, status: "draft" };
    state.slugTaken = 2;
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "slug_taken" });
    expect(state.rpcs.filter((r) => r.fn === "creator_set_draft_slug")).toHaveLength(2);
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
  });

  it("rascunho que já esteve no ar mantém o slug (não chama creator_set_draft_slug)", async () => {
    state.content = { ...state.content!, slug: "ja-teve-link", published_at: "2026-10-01T10:00:00Z" };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: true, slug: "ja-teve-link" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_set_draft_slug");
  });

  it("rascunho de outro herói (ou invisível pela RLS) → forbidden, sem gravar nada", async () => {
    state.content = { id: ids.CONTENT, slug: "x", status: "draft", creator_id: ids.OTHER_CREATOR, published_at: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    state.content = null;
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    expect(state.writes).toHaveLength(0);
    expect(state.statusCalls).toHaveLength(0);
  });

  it("título vazio, sem papel e mídia fora do Stream", async () => {
    expect(await publishVideoPost({ ...PUBLISH, title: "   " })).toEqual({ ok: false, error: "missing_title" });
    state.isCreator = false;
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    state.isCreator = true;
    state.body = { media_provider: "embed_youtube", media_ref: "dQw4w9WgXcQ" };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "missing_media" });
  });

  it("erros da RPC viram chaves (missing_media, media_license_mismatch, forbidden sem vínculo)", async () => {
    state.rpcError = "missing_media";
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "missing_media" });
    state.rpcError = "media_license_mismatch: cloudflare_stream x third_party_embed";
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "media_license_mismatch" });
    state.rpcError = "forbidden";
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
  });

  it("segundo toque depois de publicado devolve o mesmo slug sem chamar a RPC", async () => {
    state.content = { id: ids.CONTENT, slug: "ja-no-ar", status: "published", creator_id: ids.CREATOR, published_at: "2026-10-21T10:00:00Z" };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: true, slug: "ja-no-ar" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
  });

  it("falhas ao consultar o vídeo: rede, vídeo apagado e erro do provedor", async () => {
    const { CloudflareStreamError } = await import("@/lib/video");
    state.statusError = new CloudflareStreamError(0, "timeout");
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "network" });
    state.statusError = new CloudflareStreamError(404, "not found");
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "video_failed" });
    state.statusError = new CloudflareStreamError(500, "internal");
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "provider_error" });
  });
});

describe("discardVideoPost", () => {
  it("chama a RPC de descarte, apaga o vídeo no Cloudflare e marca provider_deleted_at", async () => {
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    expect(state.rpcs.find((r) => r.fn === "creator_discard_video_draft")?.args).toEqual({ p_content: ids.CONTENT });
    expect(state.deleted).toEqual([ids.UID]);
    expect(state.adminWrites).toEqual([
      { table: "stream_uploads", op: "update", payload: { provider_deleted_at: expect.any(String) }, filters: [["uid", ids.UID]] },
    ]);
    // o herói não apaga conteúdo direto pela API
    expect(state.writes.filter((w) => w.op === "delete")).toHaveLength(0);
  });

  it("uid nulo da RPC (envio não é deste rascunho): apaga só o rascunho, nunca chama o Cloudflare", async () => {
    state.discardUid = null;
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    expect(state.deleted).toHaveLength(0);
    expect(state.adminWrites).toHaveLength(0);
  });

  it("falha do Cloudflare não volta erro para a pessoa (a limpeza diária tenta de novo)", async () => {
    const { CloudflareStreamError } = await import("@/lib/video");
    state.deleteError = new CloudflareStreamError(500, "internal");
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    expect(state.adminWrites).toHaveLength(0);
  });

  it("erros da RPC: publicado, já esteve no ar, de outro herói, sem vídeo do Stream; id inválido", async () => {
    for (const code of ["not_draft", "already_published", "forbidden", "not_stream"]) {
      state.rpcError = code;
      expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: false, error: code });
    }
    expect(state.deleted).toHaveLength(0);
    expect(await discardVideoPost({ contentId: "nao-e-uuid" })).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("publicar/despublicar pelo editor", () => {
  // editor de conteúdo: só o admin, pelo herói escolhido (0045)
  beforeEach(() => {
    state.isAdmin = true;
  });

  it("vídeo do Stream passa pela mesma checagem do composer", async () => {
    state.status = { state: "pending", durationSec: null, creatorId: ids.CREATOR, reason: null };
    expect(await publishContent({ id: ids.CONTENT })).toEqual({ ok: false, error: "processing" });
    state.status = { state: "incomplete", durationSec: null, creatorId: ids.CREATOR, reason: null };
    expect(await publishContent({ id: ids.CONTENT })).toEqual({ ok: false, error: "upload_incomplete" });
    state.status = { state: "ready", durationSec: 60, creatorId: ids.CREATOR, reason: null };
    const result = await publishContent({ id: ids.CONTENT });
    // slug provisório trocado pelo do título atual antes de ir ao ar (como no composer)
    const slugCall = state.rpcs.find((r) => r.fn === "creator_set_draft_slug");
    expect(String(slugCall?.args?.p_slug)).toMatch(/^treino-de-perna-[a-z0-9]{1,6}$/);
    expect(result).toEqual({ ok: true, slug: slugCall?.args?.p_slug });
    const fns = state.rpcs.map((r) => r.fn);
    expect(fns.indexOf("creator_set_draft_slug")).toBeLessThan(fns.indexOf("creator_publish_content"));
  });

  it("editor: rascunho do Stream que já esteve no ar mantém o slug", async () => {
    state.content = { ...state.content!, slug: "ja-teve-link", published_at: "2026-10-01T10:00:00Z" };
    expect(await publishContent({ id: ids.CONTENT })).toEqual({ ok: true, slug: "ja-teve-link" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_set_draft_slug");
  });

  it("conteúdo sem Stream publica direto pela RPC; despublicar usa creator_unpublish_content", async () => {
    state.body = { media_provider: "none", media_ref: null };
    expect(await publishContent({ id: ids.CONTENT })).toMatchObject({ ok: true });
    expect(state.statusCalls).toHaveLength(0);
    expect(await unpublishContent({ id: ids.CONTENT })).toEqual({ ok: true });
    expect(state.rpcs.filter((r) => r.fn.startsWith("creator_")).map((r) => r.fn)).toEqual(["creator_publish_content", "creator_unpublish_content"]);
    state.rpcError = "not_published";
    expect(await unpublishContent({ id: ids.CONTENT })).toEqual({ ok: false, error: "not_published" });
  });
});

describe("editor completo com vídeo do Stream", () => {
  beforeEach(() => {
    state.isAdmin = true;
  });

  const form = (ref: string) =>
    ({
      id: ids.CONTENT,
      title: "Receita de domingo",
      summary: "",
      pillar: "gastronomy",
      type: "video",
      source_locale: "pt-BR",
      cover_url: `/media/stream/${ids.UID}/thumbnail`,
      duration_minutes: 2,
      difficulty: null,
      tags: [],
      has_captions: false,
      disclaimer_kind: null,
      body: { kind: "video", intro: "Passo a passo.", key_points: [], transcript: [] },
      media: { provider: "cloudflare_stream", ref, captions_url: null },
      media_license_kind: "own",
      media_license_ref: "",
      media_credit: "",
    }) as ContentFormValues;

  it("salvar mantém o uid do rascunho; trocar por outro uid é recusado", async () => {
    expect(await updateContent(form(ids.UID))).toEqual({ ok: true, id: ids.CONTENT });
    expect(state.writes.find((w) => w.op === "upsert")?.payload).toMatchObject({ media_provider: "cloudflare_stream", media_ref: ids.UID });
    state.writes.length = 0;
    expect(await updateContent(form("ffffffffffffffffffffffffffffffff"))).toEqual({ ok: false, error: "forbidden" });
    expect(state.writes).toHaveLength(0);
  });

  it("criar conteúdo novo apontando para um uid do Stream é recusado (só o composer cria)", async () => {
    expect(await createContent({ ...form(ids.UID), id: undefined })).toEqual({ ok: false, error: "forbidden" });
    expect(state.writes).toHaveLength(0);
  });
});

describe("slug do título", () => {
  it("corte em 60 que cai num separador não deixa hífen na ponta nem hífen duplo com o sufixo", () => {
    const title = "Treino rápido de 3 minutos para começar o dia com energia e foco total!";
    expect(slugify(title)).toBe("treino-rapido-de-3-minutos-para-comecar-o-dia-com-energia-e");
    for (let i = 0; i < 50; i++) expect(uniqueSlug(title)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // vários tamanhos de título: o resultado sempre casa com o formato que a RPC aceita
    const words = "a bc def ghij klmno pqrstu vwxyzab ".repeat(6);
    for (let n = 50; n < words.length; n++) expect(uniqueSlug(words.slice(0, n))).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("validação do vídeo no navegador", () => {
  it("aceita vídeo por MIME ou pela extensão quando o celular não informa o tipo", () => {
    expect(validateVideoFile({ type: "video/mp4", size: 10, name: "a.mp4" })).toBeNull();
    expect(validateVideoFile({ type: "video/quicktime", size: 10, name: "IMG_0001.MOV" })).toBeNull();
    expect(validateVideoFile({ type: "", size: 10, name: "IMG_0001.MOV" })).toBeNull();
    expect(validateVideoFile({ type: "image/jpeg", size: 10, name: "foto.jpg" })).toBe("not_video");
    expect(validateVideoFile({ type: "", size: 10, name: "notas.txt" })).toBe("not_video");
  });

  it("tamanho: vazio e acima de 2 GB são recusados; exatamente 2 GB passa", () => {
    expect(validateVideoFile({ type: "video/mp4", size: 0 })).toBe("empty_file");
    expect(validateVideoFile({ type: "video/mp4", size: MAX_POST_BYTES })).toBeNull();
    expect(validateVideoFile({ type: "video/mp4", size: MAX_POST_BYTES + 1 })).toBe("file_too_large");
  });

  it("duração bruta: até 180 s passa; 180,04 s já não (sem arredondar para baixo); desconhecida segue", () => {
    expect(validateDuration(180)).toBeNull();
    expect(validateDuration(180.04)).toBe("too_long");
    expect(validateDuration(180.1)).toBe("too_long");
    expect(validateDuration(null)).toBeNull();
    expect(validateDuration(Number.NaN)).toBeNull();
    expect(validateDuration(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("normalizeDuration arredonda para cima no décimo e descarta valores inválidos", () => {
    expect(normalizeDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeDuration(Number.NaN)).toBeNull();
    expect(normalizeDuration(0)).toBeNull();
    expect(normalizeDuration(95.437)).toBe(95.5);
    expect(normalizeDuration(180)).toBe(180);
    expect(normalizeDuration(180.04)).toBe(180.1);
    expect(normalizeDuration(0.3)).toBe(0.3);
  });

  it("percentual e minutos", () => {
    expect(uploadPercent(0, 100)).toBe(0);
    expect(uploadPercent(49.9, 100)).toBe(49);
    expect(uploadPercent(200, 100)).toBe(100);
    expect(uploadPercent(10, 0)).toBe(0);
    expect(durationMinutes(null)).toBeNull();
    expect(durationMinutes(12)).toBe(1);
    expect(durationMinutes(180)).toBe(3);
  });
});
