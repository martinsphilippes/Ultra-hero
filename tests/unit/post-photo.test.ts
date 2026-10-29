import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContent, updateContent } from "@/app/creator/content/actions";
import { discardPhotoPost, publishPhotoPost, startPhotoPost } from "@/app/creator/post/photo-actions";
import { parseContentForm } from "@/components/editors/content/schema";
import type { ContentFormValues } from "@/components/editors/types";
import { POST_PHOTO_MAX_SOURCE_BYTES, POST_PHOTO_MAX_UPLOAD_BYTES } from "@/lib/post-photo/constants";
import { isPhotoPost, isPostPhotoPath, publicPostPhotoUrl, storedPostPhotoPath } from "@/lib/post-photo/paths";
import { POST_PHOTO_CLEANUP_LIMIT, cleanupPostPhotoUploads } from "@/lib/post-photo/server";
import { fitLongEdge, mediaKindOf, pickOptions, validatePhotoSource, validatePostPhotoBytes } from "@/lib/post-photo/validation";

// Post com foto (0043) sem Next, Supabase nem Storage de verdade: roteamento foto/vídeo pelo MIME,
// validações (arquivo escolhido e bytes no servidor), caminhos do bucket, o que conta como "post com
// foto", a ordem das etapas das actions (reservar → gravar → rascunho → corpo), o desfazer em cada
// falha, o editor mantendo a foto e a limpeza diária. As regras do banco (dono da foto, cota, kill
// switch, herói ativo, uma foto por corpo) são testadas de verdade no S55 do RLS.

const BASE = "https://proj.supabase.co";
const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  OTHER: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  CONTENT: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  FILE: "5d1f5c2e-3b8a-4c7d-9e0f-1a2b3c4d5e6f",
}));
const PATH = `${ids.USER}/${ids.FILE}.webp`;
const URL_ = `${BASE}/storage/v1/object/public/post-photos/${PATH}`;

type Result = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isCreator: true,
  creatorId: null as string | null,
  hasAdmin: true,
  claim: { data: null, error: null } as Result,
  discard: { data: null, error: null } as Result,
  publish: { data: null, error: null } as Result,
  orphans: { data: [], error: null } as Result,
  content: null as Record<string, unknown> | null,
  body: null as Record<string, unknown> | null,
  insertError: null as { message: string; code?: string } | null,
  bodyError: null as { message: string; code?: string } | null,
  uploadError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  log: [] as string[],
  writes: [] as { client: string; table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }[],
}));

function client(kind: "user" | "admin") {
  return {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.log.push(`${kind}:rpc:${fn}`);
      if (fn === "my_creator_id") return { data: state.creatorId, error: null };
      if (fn === "post_photo_upload_claim") {
        state.log.push(`  bytes=${String(args?.p_bytes)} mime=${String(args?.p_mime)}`);
        return state.claim;
      }
      if (fn === "creator_discard_photo_draft") return state.discard;
      if (fn === "creator_set_draft_slug") return { data: { slug: args?.p_slug }, error: null };
      if (fn === "creator_publish_content") return state.publish;
      if (fn === "post_photo_orphan_uploads") {
        state.log.push(`  limit=${String(args?.p_limit)}`);
        return state.orphans;
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const build = (op: string, payload?: unknown) => {
        const entry = { client: kind, table, op, payload, filters: [] as [string, string, unknown][] };
        if (op !== "select") {
          state.writes.push(entry);
          state.log.push(`${kind}:${op}:${table}`);
        }
        const resolve = (): Result => {
          if (op === "select") {
            const row = table === "content" ? state.content : table === "content_bodies" ? state.body : table === "creator_profiles" ? { pillars: ["nutrition"] } : null;
            return { data: row, error: null };
          }
          if (op === "insert" && table === "content_bodies") return { data: null, error: state.bodyError };
          if (op === "insert" && table === "content") return state.insertError ? { data: null, error: state.insertError } : { data: { id: ids.CONTENT, slug: "post-com-foto-abc" }, error: null };
          if (op === "delete") return { data: [], error: null };
          return { data: null, error: null };
        };
        const chain: Record<string, unknown> = {};
        for (const method of ["eq", "is", "in", "not", "lt", "gte"]) {
          chain[method] = (column: string, ...rest: unknown[]) => {
            entry.filters.push([method, column, rest.length > 1 ? rest : rest[0]]);
            return chain;
          };
        }
        chain.select = () => chain;
        chain.maybeSingle = async () => resolve();
        chain.single = async () => resolve();
        chain.then = (ok: (v: Result) => void) => ok(resolve());
        return chain;
      };
      return {
        select: () => build("select"),
        update: (payload: unknown) => build("update", payload),
        delete: () => build("delete"),
        insert: (payload: unknown) => build("insert", payload),
        upsert: async (payload: unknown) => {
          state.writes.push({ client: kind, table, op: "upsert", payload, filters: [] });
          return { error: null };
        },
      };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts: { contentType: string; upsert: boolean }) => {
          state.log.push(`${kind}:storage:upload:${bucket}/${path}:${opts.contentType}:upsert=${opts.upsert}`);
          return { data: null, error: state.uploadError };
        },
        remove: async (paths: string[]) => {
          state.log.push(`${kind}:storage:remove:${bucket}/${paths.join(",")}`);
          return { data: [], error: state.removeError };
        },
      }),
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
  getLocale: async () => "pt-BR",
}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user, hasRole: async (role: string) => role === "creator" && state.isCreator }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client("user") }));
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => state.hasAdmin,
  createAdminClient: () => {
    if (!state.hasAdmin) throw new Error("sem service role");
    return client("admin");
  },
}));

// ---------------------------------------------------------------- imagens sintéticas
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const webp = (w: number, h: number) => bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0x10, 0x02, 0x00], [0x9d, 0x01, 0x2a], le16(w), le16(h), [0, 0]);
const jpeg = (w: number, h: number) =>
  bytes([0xff, 0xd8], [0xff, 0xe0], be16(16), "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xc0], be16(17), [8], be16(h), be16(w), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR", [0, 0, 2, 0, 0, 0, 2, 0]);

function form(data: Uint8Array, type = "image/webp") {
  const fd = new FormData();
  fd.append("file", new File([data as BlobPart], "foto.webp", { type }));
  return fd;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  state.user = { id: ids.USER };
  state.isCreator = true;
  state.creatorId = ids.CREATOR;
  state.hasAdmin = true;
  state.claim = { data: PATH, error: null };
  state.discard = { data: { id: ids.CONTENT, path: PATH }, error: null };
  state.publish = { data: { id: ids.CONTENT, slug: "cafe-da-manha-x1y2", status: "published" }, error: null };
  state.orphans = { data: [], error: null };
  state.content = { id: ids.CONTENT, slug: "post-com-foto-abc", status: "draft", creator_id: ids.CREATOR, published_at: null };
  state.body = { media_provider: "upload", media_ref: PATH };
  state.insertError = null;
  state.bodyError = null;
  state.uploadError = null;
  state.removeError = null;
  state.log = [];
  state.writes = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ---------------------------------------------------------------- regras puras
describe("foto ou vídeo pelo arquivo escolhido", () => {
  it("o MIME decide; sem MIME vale a extensão; o resto não é foto nem vídeo", () => {
    expect(mediaKindOf({ type: "image/jpeg", name: "IMG_1.jpg" })).toBe("photo");
    expect(mediaKindOf({ type: "image/heic", name: "IMG_1.HEIC" })).toBe("photo");
    expect(mediaKindOf({ type: "video/quicktime", name: "IMG_2.MOV" })).toBe("video");
    expect(mediaKindOf({ type: "video/mp4", name: "foto.jpg" })).toBe("video"); // o MIME vence a extensão
    expect(mediaKindOf({ type: "", name: "IMG_3.jpeg" })).toBe("photo");
    expect(mediaKindOf({ type: "", name: "VID_4.mp4" })).toBe("video");
    expect(mediaKindOf({ type: "application/pdf", name: "foto.jpg" })).toBeNull();
    expect(mediaKindOf({ type: "", name: "nota.txt" })).toBeNull();
  });

  it("arquivo de foto escolhido: tipo, vazio e tamanho de origem", () => {
    expect(validatePhotoSource({ type: "image/jpeg", size: 4_000_000, name: "a.jpg" })).toBeNull();
    expect(validatePhotoSource({ type: "video/mp4", size: 10, name: "a.mp4" })).toBe("not_image");
    expect(validatePhotoSource({ type: "image/jpeg", size: 0, name: "a.jpg" })).toBe("empty_file");
    expect(validatePhotoSource({ type: "image/jpeg", size: POST_PHOTO_MAX_SOURCE_BYTES + 1, name: "a.jpg" })).toBe("file_too_large");
  });

  it("bytes no servidor: WebP/JPEG de verdade, lado maior até 2048, menor lado de 64, até 3,5 MiB", () => {
    expect(validatePostPhotoBytes(webp(2048, 1536))).toMatchObject({ ok: true, image: { mime: "image/webp", width: 2048, height: 1536 } });
    expect(validatePostPhotoBytes(jpeg(1536, 2048))).toMatchObject({ ok: true, image: { mime: "image/jpeg" } });
    expect(validatePostPhotoBytes(webp(2049, 1000))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(validatePostPhotoBytes(webp(2000, 40))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(validatePostPhotoBytes(png)).toEqual({ ok: false, error: "not_image" });
    expect(validatePostPhotoBytes(new Uint8Array())).toEqual({ ok: false, error: "empty_file" });
    expect(validatePostPhotoBytes(new Uint8Array(POST_PHOTO_MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, error: "file_too_large" });
    // 3,5 MiB cabem no limite de 4 MB da server action com folga para o multipart
    expect(POST_PHOTO_MAX_UPLOAD_BYTES).toBeLessThan(4 * 1024 * 1024 - 64 * 1024);
  });

  it("redução sem recorte: cabe no lado maior e nunca amplia", () => {
    expect(fitLongEdge(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitLongEdge(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(fitLongEdge(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitLongEdge(0, 600)).toEqual({ width: 0, height: 0 });
  });

  it("botões do passo 1: foto independe do Stream; galeria liga se um dos dois funciona", () => {
    expect(pickOptions({ videoConfigured: false, photo: "ready" })).toEqual({ takePhoto: true, recordVideo: false, gallery: true });
    expect(pickOptions({ videoConfigured: true, photo: "not_configured" })).toEqual({ takePhoto: false, recordVideo: true, gallery: true });
    expect(pickOptions({ videoConfigured: false, photo: "disabled" })).toEqual({ takePhoto: false, recordVideo: false, gallery: false });
    expect(pickOptions({ videoConfigured: true, photo: "ready" })).toEqual({ takePhoto: true, recordVideo: true, gallery: true });
  });
});

describe("caminhos e post com foto", () => {
  it("URL pública e caminho do bucket deste projeto; outro host, outro bucket ou consulta não valem", () => {
    expect(publicPostPhotoUrl(BASE, PATH)).toBe(URL_);
    expect(storedPostPhotoPath(URL_, BASE)).toBe(PATH);
    expect(storedPostPhotoPath(URL_.replace("proj.supabase.co", "evil.example"), BASE)).toBeNull();
    expect(storedPostPhotoPath(URL_.replace("/post-photos/", "/hero-covers/"), BASE)).toBeNull();
    expect(storedPostPhotoPath(`${URL_}?x=1`, BASE)).toBeNull();
    expect(isPostPhotoPath(PATH)).toBe(true);
    expect(isPostPhotoPath(`../${PATH}`)).toBe(false);
  });

  it("post com foto = artigo com a capa no bucket post-photos; vídeo, guia ou capa desenhada não", () => {
    expect(isPhotoPost({ type: "article", cover_url: URL_ }, BASE)).toBe(true);
    expect(isPhotoPost({ type: "guide", cover_url: URL_ }, BASE)).toBe(false);
    expect(isPhotoPost({ type: "article", cover_url: "/placeholders/cover-routine-1.svg" }, BASE)).toBe(false);
    expect(isPhotoPost({ type: "article", cover_url: null }, BASE)).toBe(false);
    expect(isPhotoPost({ type: "article", cover_url: URL_ }, null)).toBe(false);
  });
});

// ---------------------------------------------------------------- actions
describe("startPhotoPost", () => {
  it("reserva com o tipo dos bytes, grava no bucket (sem upsert), cria o rascunho com a foto na capa e o corpo com o caminho", async () => {
    // o navegador diz "image/png", mas os bytes são JPEG: vale o que os bytes dizem
    expect(await startPhotoPost(form(jpeg(1600, 1200), "image/png"))).toEqual({ ok: true, contentId: ids.CONTENT });
    expect(state.log).toEqual([
      "user:rpc:my_creator_id",
      "user:rpc:post_photo_upload_claim",
      expect.stringMatching(/^ {2}bytes=\d+ mime=image\/jpeg$/),
      `admin:storage:upload:post-photos/${PATH}:image/jpeg:upsert=false`,
      "user:insert:content",
      "user:insert:content_bodies",
    ]);
    const content = state.writes.find((w) => w.table === "content")?.payload as Record<string, unknown>;
    expect(content).toMatchObject({ type: "article", creator_id: ids.CREATOR, created_by: ids.USER, cover_url: URL_, media_license_kind: "own", title: "creator.post.photo.draftTitle" });
    const body = state.writes.find((w) => w.table === "content_bodies")?.payload as Record<string, unknown>;
    expect(body).toMatchObject({ content_id: ids.CONTENT, media_provider: "upload", media_ref: PATH, body: { kind: "article", format: "photo" } });
  });

  it("bytes que não são foto, dimensões fora da faixa ou arquivo grande param antes de reservar", async () => {
    expect(await startPhotoPost(form(png, "image/jpeg"))).toEqual({ ok: false, error: "not_image" });
    expect(await startPhotoPost(form(webp(4000, 3000)))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(await startPhotoPost(form(new Uint8Array(POST_PHOTO_MAX_UPLOAD_BYTES + 1)))).toEqual({ ok: false, error: "file_too_large" });
    expect(state.log.filter((l) => l.includes("claim"))).toEqual([]);
  });

  it("sem sessão de herói, sem service role ou banco sem a 0043: nada é gravado", async () => {
    state.isCreator = false;
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "forbidden" });
    state.isCreator = true;
    state.hasAdmin = false;
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    state.hasAdmin = true;
    state.claim = { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    state.claim = { data: null, error: { message: "too_many_uploads" } };
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "too_many_uploads" });
    expect(state.writes).toEqual([]);
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
  });

  it("caminho reservado que não é do usuário da sessão é recusado sem gravar", async () => {
    state.claim = { data: `${ids.OTHER}/${ids.FILE}.webp`, error: null };
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
  });

  it("falha no Storage: upload_failed e nenhum rascunho", async () => {
    state.uploadError = { message: "boom" };
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "upload_failed" });
    expect(state.writes.filter((w) => w.table === "content")).toEqual([]);
  });

  it("rascunho recusado: a foto sai do bucket e o envio é marcado", async () => {
    state.insertError = { message: "photo_media_forbidden" };
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_media_forbidden" });
    expect(state.log).toContain(`admin:storage:remove:post-photos/${PATH}`);
    expect(state.writes.find((w) => w.client === "admin" && w.table === "post_photo_uploads")?.payload).toMatchObject({ deleted_at: expect.any(String) });
  });

  it("corpo recusado pelo banco: o rascunho é apagado e a foto sai do bucket", async () => {
    state.bodyError = { message: "photo_media_forbidden" };
    expect(await startPhotoPost(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_media_forbidden" });
    const del = state.writes.find((w) => w.client === "admin" && w.table === "content" && w.op === "delete");
    expect(del?.filters).toEqual([
      ["eq", "id", ids.CONTENT],
      ["eq", "status", "draft"],
    ]);
    expect(state.log).toContain(`admin:storage:remove:post-photos/${PATH}`);
  });
});

describe("publishPhotoPost", () => {
  const PUBLISH = { contentId: ids.CONTENT, title: "  Café da manhã  ", caption: "Pão, ovo e fruta.", pillar: "nutrition" as const };

  it("grava texto, troca o slug provisório e publica pela RPC do banco", async () => {
    expect(await publishPhotoPost(PUBLISH)).toEqual({ ok: true, slug: "cafe-da-manha-x1y2" });
    expect(state.writes.find((w) => w.table === "content" && w.op === "update")?.payload).toEqual({ title: "Café da manhã", summary: "Pão, ovo e fruta.", pillar: "nutrition" });
    expect(state.log.filter((l) => l.startsWith("user:rpc:creator_"))).toEqual(["user:rpc:creator_set_draft_slug", "user:rpc:creator_publish_content"]);
  });

  it("conteúdo de outro herói, sem foto no corpo ou sem título: nada é gravado", async () => {
    state.content = { ...state.content, creator_id: ids.OTHER };
    expect(await publishPhotoPost(PUBLISH)).toEqual({ ok: false, error: "forbidden" });
    state.content = { ...state.content, creator_id: ids.CREATOR };
    state.body = { media_provider: "cloudflare_stream", media_ref: "0123456789abcdef0123456789abcdef" };
    expect(await publishPhotoPost(PUBLISH)).toEqual({ ok: false, error: "missing_media" });
    expect(await publishPhotoPost({ ...PUBLISH, title: "   " })).toEqual({ ok: false, error: "missing_title" });
    expect(state.writes).toEqual([]);
  });

  it("segundo toque depois de publicado devolve o mesmo slug sem chamar o banco de novo", async () => {
    state.content = { ...state.content, status: "published", slug: "ja-no-ar" };
    expect(await publishPhotoPost(PUBLISH)).toEqual({ ok: true, slug: "ja-no-ar" });
    expect(state.log).not.toContain("user:rpc:creator_publish_content");
  });

  it("erro do banco vira o código da tela (ex.: revisão exigida para o tipo)", async () => {
    state.publish = { data: null, error: { message: "review_required" } };
    expect(await publishPhotoPost(PUBLISH)).toEqual({ ok: false, error: "review_required" });
  });
});

describe("discardPhotoPost", () => {
  it("a RPC apaga o rascunho; a foto devolvida sai do bucket e o envio é marcado", async () => {
    expect(await discardPhotoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    expect(state.log).toContain(`admin:storage:remove:post-photos/${PATH}`);
    expect(state.writes.find((w) => w.table === "post_photo_uploads")?.filters).toEqual([
      ["eq", "path", PATH],
      ["is", "deleted_at", null],
    ]);
  });

  it("caminho nulo (foto usada em outro conteúdo) ou de outro usuário: o objeto fica", async () => {
    state.discard = { data: { id: ids.CONTENT, path: null }, error: null };
    expect(await discardPhotoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    state.discard = { data: { id: ids.CONTENT, path: `${ids.OTHER}/${ids.FILE}.webp` }, error: null };
    expect(await discardPhotoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    expect(state.log.some((l) => l.includes("storage:remove"))).toBe(false);
  });

  it("Storage falha: o descarte segue (a limpeza diária apaga) e o envio não é marcado", async () => {
    state.removeError = { message: "boom" };
    expect(await discardPhotoPost({ contentId: ids.CONTENT })).toEqual({ ok: true, deleted: true });
    expect(state.writes.filter((w) => w.table === "post_photo_uploads")).toEqual([]);
  });

  it("erros da RPC voltam como código; banco sem a 0043 = indisponível", async () => {
    state.discard = { data: null, error: { message: "not_draft" } };
    expect(await discardPhotoPost({ contentId: ids.CONTENT })).toEqual({ ok: false, error: "not_draft" });
    state.discard = { data: null, error: { message: "x", code: "PGRST202" } };
    expect(await discardPhotoPost({ contentId: ids.CONTENT })).toEqual({ ok: false, error: "photo_not_configured" });
    expect(await discardPhotoPost({ contentId: "nao-e-uuid" })).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("editor de conteúdo com post de foto", () => {
  const values = (ref: string, cover = URL_) =>
    ({
      id: ids.CONTENT,
      title: "Café da manhã",
      summary: "Pão, ovo e fruta.",
      pillar: "nutrition",
      type: "article",
      source_locale: "pt-BR",
      cover_url: cover,
      duration_minutes: null,
      difficulty: null,
      tags: [],
      has_captions: false,
      disclaimer_kind: null,
      body: { kind: "article", intro: "", sections: [], key_points: [] },
      media: { provider: "upload", ref, captions_url: null },
      media_license_kind: "own",
      media_license_ref: "",
      media_credit: "",
    }) as ContentFormValues;

  it("aceita a foto do bucket na capa e o caminho no corpo; recusa caminho solto e capa de outro host", () => {
    const ok = parseContentForm(values(PATH));
    expect(ok.ok && ok.data.media).toEqual({ provider: "upload", ref: PATH, captions_url: null });
    expect(parseContentForm(values("qualquer/coisa.webp")).ok).toBe(false);
    expect(parseContentForm(values(PATH, URL_.replace("proj.supabase.co", "evil.example"))).ok).toBe(false);
  });

  it("salvar mantém a foto do rascunho; trocar por outra é recusado; criar com foto só pelo composer", async () => {
    expect(await updateContent(values(PATH))).toEqual({ ok: true, id: ids.CONTENT });
    expect(state.writes.find((w) => w.op === "upsert")?.payload).toMatchObject({ media_provider: "upload", media_ref: PATH });
    state.writes = [];
    expect(await updateContent(values(`${ids.USER}/${ids.CONTENT}.webp`))).toEqual({ ok: false, error: "forbidden" });
    expect(await createContent({ ...values(PATH), id: undefined })).toEqual({ ok: false, error: "forbidden" });
    expect(state.writes).toEqual([]);
  });
});

describe("cleanupPostPhotoUploads", () => {
  it("tira a capa e o corpo que ainda apontam para a foto, apaga os objetos e só então marca", async () => {
    state.orphans = { data: [PATH], error: null };
    const result = await cleanupPostPhotoUploads(client("admin") as never, BASE, new Date("2026-10-29T03:00:00Z"));
    expect(result).toEqual({ post_photos_deleted: 1, post_photos_errors: 0, post_photos_rows_purged: 0 });
    expect(state.log).toEqual([
      "admin:rpc:post_photo_orphan_uploads",
      `  limit=${POST_PHOTO_CLEANUP_LIMIT}`,
      "admin:update:content",
      "admin:update:content_bodies",
      `admin:storage:remove:post-photos/${PATH}`,
      "admin:update:post_photo_uploads",
      "admin:delete:post_photo_uploads",
    ]);
    expect(state.writes[0]).toMatchObject({ payload: { cover_url: null }, filters: [["in", "cover_url", [URL_]]] });
    expect(state.writes[1]).toMatchObject({ payload: { media_provider: "none", media_ref: null } });
  });

  it("Storage falha: não marca (tenta de novo amanhã); sem base do Supabase não apaga nada", async () => {
    state.orphans = { data: [PATH], error: null };
    state.removeError = { message: "boom" };
    expect(await cleanupPostPhotoUploads(client("admin") as never, BASE)).toMatchObject({ post_photos_deleted: 0, post_photos_errors: 1 });
    expect(state.log).not.toContain("admin:update:post_photo_uploads");
    await expect(cleanupPostPhotoUploads(client("admin") as never, null)).rejects.toThrow();
  });
});
