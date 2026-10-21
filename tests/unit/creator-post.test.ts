import { beforeEach, describe, expect, it, vi } from "vitest";
import { discardVideoPost, publishVideoPost, startVideoPost } from "@/app/creator/post/actions";
import { createContent, publishContent, unpublishContent, updateContent } from "@/app/creator/content/actions";
import type { ContentFormValues } from "@/components/editors/types";
import { MAX_POST_BYTES, durationMinutes, normalizeDuration, uploadPercent, validateDuration, validateVideoFile } from "@/components/creator/post/validation";

// Composer de post em vídeo do herói: server actions sem Next, Supabase nem Cloudflare. Confere que
// dono e uid vêm da sessão/banco (nunca do cliente), o mapeamento de erros para creator.post.errors
// e as regras puras de arquivo/duração que o navegador aplica antes de enviar.

const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  OTHER_CREATOR: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  UID: "0123456789abcdef0123456789abcdef",
}));

type Write = { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] };

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isCreator: true,
  creatorId: null as string | null,
  configured: true,
  settings: {} as Record<string, unknown>,
  content: null as Record<string, unknown> | null,
  body: null as Record<string, unknown> | null,
  profile: { pillars: ["nutrition", "gastronomy"] } as Record<string, unknown> | null,
  rpcError: null as string | null,
  insertError: null as { message: string; code?: string } | null,
  deletedRows: [] as { id: string }[],
  status: { state: "ready", durationSec: 95.4, creatorId: null } as { state: string; durationSec: number | null; creatorId: string | null },
  statusError: null as Error | null,
  ticketError: null as Error | null,
  tickets: [] as Record<string, unknown>[],
  statusCalls: [] as string[],
  writes: [] as Write[],
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
  hasRole: async (role: string) => role === "creator" && state.isCreator,
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
    }),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.rpcs.push({ fn, args });
      if (fn === "my_creator_id") return { data: state.creatorId, error: null };
      if (fn === "public_settings") return { data: state.settings, error: null };
      if (state.rpcError) return { data: null, error: { message: state.rpcError } };
      const status = fn === "creator_unpublish_content" ? "draft" : "published";
      return { data: { id: args?.p_content, slug: "receita-de-domingo-x1y2z3", status }, error: null };
    },
    from: (table: string) => {
      const entry: Write = { table, op: "select", filters: [] };
      const rowFor = () => (table === "content" ? state.content : table === "content_bodies" ? state.body : table === "creator_profiles" ? state.profile : null);
      const chain = {
        eq(column: string, value: unknown) {
          entry.filters.push([column, value]);
          return chain;
        },
        maybeSingle: async () => ({ data: rowFor(), error: null }),
        select: () => ({
          single: async () =>
            state.insertError ? { data: null, error: state.insertError } : { data: { id: ids.CONTENT, slug: `${String(entry.payload?.slug)}` }, error: null },
          then: (resolve: (v: unknown) => void) => resolve({ data: state.deletedRows, error: null }),
        }),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
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
  state.creatorId = ids.CREATOR;
  state.configured = true;
  state.settings = { "video.provider": "cloudflare_stream" };
  state.content = { id: ids.CONTENT, slug: "post-em-video-abc123", status: "draft", creator_id: ids.CREATOR };
  state.body = { media_provider: "cloudflare_stream", media_ref: ids.UID };
  state.profile = { pillars: ["nutrition", "gastronomy"] };
  state.rpcError = null;
  state.insertError = null;
  state.deletedRows = [];
  state.status = { state: "ready", durationSec: 95.4, creatorId: ids.CREATOR };
  state.statusError = null;
  state.ticketError = null;
  state.tickets.length = 0;
  state.statusCalls.length = 0;
  state.writes.length = 0;
  state.rpcs.length = 0;
  state.revalidated.length = 0;
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

  it("fluxo feliz: ticket de 180 s no nome do herói da sessão e rascunho com cloudflare_stream + own + miniatura", async () => {
    const result = await startVideoPost(START);
    expect(result).toEqual({ ok: true, contentId: ids.CONTENT, uploadUrl: "https://upload.cloudflarestream.com/tus/abc" });
    expect(state.tickets[0]).toEqual({ creatorId: ids.CREATOR, maxDurationSec: 180, premium: false, fileSize: 48_000_000, fileName: "VID_20261021.mp4" });

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
  });

  it("erro do banco ao criar o rascunho vira chave de mensagem", async () => {
    state.insertError = { message: "new row violates row-level security policy for table \"content\"" };
    expect(await startVideoPost(START)).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("publishVideoPost", () => {
  it("vídeo ainda processando devolve processing, mas o texto já fica salvo", async () => {
    state.status = { state: "pending", durationSec: null, creatorId: ids.CREATOR };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "processing" });
    const update = state.writes.find((w) => w.table === "content" && w.op === "update")!;
    expect(update.payload).toEqual({ title: "Receita de domingo", summary: "Arroz de forno em 3 passos.", pillar: "gastronomy" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
  });

  it("errored → video_failed; duração acima de 185 s → too_long; creator diferente → forbidden", async () => {
    state.status = { state: "errored", durationSec: null, creatorId: ids.CREATOR };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "video_failed" });
    state.status = { state: "ready", durationSec: 190, creatorId: ids.CREATOR };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "too_long" });
    state.status = { state: "ready", durationSec: 60, creatorId: ids.OTHER_CREATOR };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    expect(state.rpcs.map((r) => r.fn)).not.toContain("creator_publish_content");
  });

  it("consulta o uid gravado no banco, nunca um vindo do cliente", async () => {
    await publishVideoPost({ ...PUBLISH, uid: "ffffffffffffffffffffffffffffffff" } as typeof PUBLISH);
    expect(state.statusCalls).toEqual([ids.UID]);
  });

  it("sucesso: chama creator_publish_content, grava duração e revalida as vitrines", async () => {
    const result = await publishVideoPost(PUBLISH);
    expect(result).toEqual({ ok: true, slug: "receita-de-domingo-x1y2z3" });
    expect(state.rpcs.find((r) => r.fn === "creator_publish_content")?.args).toEqual({ p_content: ids.CONTENT });
    expect(state.writes.filter((w) => w.op === "update").map((w) => w.payload)).toContainEqual({ duration_minutes: 2 });
    expect(state.revalidated).toEqual(["/creator", "/creator/content", "/", "/explore"]);
  });

  it("creatorId vazio no Cloudflare não bloqueia (vídeo antigo sem campo creator)", async () => {
    state.status = { state: "ready", durationSec: 30, creatorId: null };
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: true, slug: "receita-de-domingo-x1y2z3" });
  });

  it("rascunho de outro herói (ou invisível pela RLS) → forbidden, sem gravar nada", async () => {
    state.content = { id: ids.CONTENT, slug: "x", status: "draft", creator_id: ids.OTHER_CREATOR };
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

  it("erros da RPC viram chaves (missing_media, media_license_mismatch)", async () => {
    state.rpcError = "missing_media";
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "missing_media" });
    state.rpcError = "media_license_mismatch: cloudflare_stream x third_party_embed";
    expect(await publishVideoPost(PUBLISH)).toEqual({ ok: false, error: "media_license_mismatch" });
  });

  it("segundo toque depois de publicado devolve o mesmo slug sem chamar a RPC", async () => {
    state.content = { id: ids.CONTENT, slug: "ja-no-ar", status: "published", creator_id: ids.CREATOR };
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
  it("a RLS não deixa o herói apagar: o rascunho fica e a action avisa", async () => {
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: false });
    expect(state.writes.find((w) => w.op === "delete")?.filters).toEqual([["id", ids.CONTENT]]);
  });

  it("se a regra permitir, apaga; publicado ou de outro herói não", async () => {
    state.deletedRows = [{ id: ids.CONTENT }];
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    state.content = { id: ids.CONTENT, slug: "x", status: "published", creator_id: ids.CREATOR };
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: false, error: "not_draft" });
    state.content = { id: ids.CONTENT, slug: "x", status: "draft", creator_id: ids.OTHER_CREATOR };
    expect(await discardVideoPost({ contentId: ids.CONTENT })).toEqual({ ok: false, error: "forbidden" });
    expect(await discardVideoPost({ contentId: "nao-e-uuid" })).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("publicar/despublicar pelo editor", () => {
  it("vídeo do Stream passa pela mesma checagem do composer", async () => {
    state.status = { state: "pending", durationSec: null, creatorId: ids.CREATOR };
    expect(await publishContent({ id: ids.CONTENT })).toEqual({ ok: false, error: "processing" });
    state.status = { state: "ready", durationSec: 60, creatorId: ids.CREATOR };
    expect(await publishContent({ id: ids.CONTENT })).toEqual({ ok: true, slug: "receita-de-domingo-x1y2z3" });
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

  it("duração: até 180 s passa, acima não; desconhecida segue (o Cloudflare corta)", () => {
    expect(validateDuration(180)).toBeNull();
    expect(validateDuration(180.1)).toBe("too_long");
    expect(validateDuration(null)).toBeNull();
    expect(normalizeDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeDuration(Number.NaN)).toBeNull();
    expect(normalizeDuration(0)).toBeNull();
    expect(normalizeDuration(95.437)).toBe(95.4);
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
