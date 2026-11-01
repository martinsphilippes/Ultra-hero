import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadContentCover } from "@/app/admin/content/cover-actions";
import { coverPreviewSrc } from "@/components/editors/content/CoverPicker";
import { parseContentForm } from "@/components/editors/content/schema";
import { FEED_POST_SELECT, feedPostKind } from "@/components/discover/home/feed/posts";
import type { ContentFormValues } from "@/components/editors/types";
import { POST_PHOTO_MAX_UPLOAD_BYTES } from "@/lib/post-photo/constants";
import { isPhotoPost } from "@/lib/post-photo/paths";
import { COVER_VIDEO_MAX_SOURCE_BYTES, frameTimeFor, validateVideoSource } from "@/lib/post-photo/video-frame";

// Capa do conteúdo pelo celular (editor do admin): a action reserva a foto em nome do herói escolhido
// (cabeçalho x-acting-hero), confere os bytes, grava no bucket e devolve a URL; a prévia só mostra
// caminho da plataforma ou foto do bucket; um quadro de vídeo vira capa; artigo com texto e capa
// enviada não vira "post com foto". As regras do banco (admin por herói ativo, cota, kill switch)
// são testadas de verdade no RLS (S55 e 0045).

const BASE = "https://proj.supabase.co";
const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  CREATOR: "a3bb189e-8bf9-4888-9912-ace4e6543002",
  FILE: "5d1f5c2e-3b8a-4c7d-9e0f-1a2b3c4d5e6f",
}));
const PATH = `${ids.USER}/${ids.FILE}.webp`;
const URL_ = `${BASE}/storage/v1/object/public/post-photos/${PATH}`;

type Result = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isAdmin: true,
  uploadRights: true,
  hasAdmin: true,
  claim: { data: null, error: null } as Result,
  uploadError: null as { message: string } | null,
  /** O que acting_hero_id() devolve: o herói honrado pelo banco (null = cabeçalho ignorado). */
  acting: null as string | null,
  actingFor: [] as string[],
  log: [] as string[],
}));

function client(kind: "user" | "admin") {
  return {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "acting_hero_id") return { data: state.acting, error: null };
      state.log.push(`${kind}:rpc:${fn}:${String(args?.p_bytes)}:${String(args?.p_mime)}`);
      return fn === "post_photo_upload_claim" ? state.claim : { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts: { contentType: string; upsert: boolean }) => {
          state.log.push(`${kind}:storage:upload:${bucket}/${path}:${opts.contentType}:upsert=${opts.upsert}`);
          return { data: null, error: state.uploadError };
        },
      }),
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/partner-terms/server", () => ({ hasUploadRights: async () => state.uploadRights }));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => state.user,
  hasRole: async (role: string) => role === "admin" && state.isAdmin,
}));
vi.mock("@/lib/acting-hero/server", () => ({
  actingClient: async (heroId: string) => {
    state.actingFor.push(heroId);
    return client("user");
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => state.hasAdmin,
  createAdminClient: () => {
    if (!state.hasAdmin) throw new Error("sem service role");
    return client("admin");
  },
}));

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const webp = (w: number, h: number) => bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0x10, 0x02, 0x00], [0x9d, 0x01, 0x2a], le16(w), le16(h), [0, 0]);
const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR", [0, 0, 2, 0, 0, 0, 2, 0]);

function form(data: Uint8Array, creatorId: string | null = ids.CREATOR, type = "image/webp") {
  const fd = new FormData();
  if (creatorId !== null) fd.append("creatorId", creatorId);
  fd.append("file", new File([data as BlobPart], "capa.webp", { type }));
  return fd;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  state.user = { id: ids.USER };
  state.isAdmin = true;
  state.uploadRights = true;
  state.hasAdmin = true;
  state.claim = { data: PATH, error: null };
  state.uploadError = null;
  state.acting = ids.CREATOR;
  state.actingFor = [];
  state.log = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("uploadContentCover", () => {
  it("reserva pelo herói escolhido, grava com o service role e devolve a URL pública", async () => {
    const result = await uploadContentCover(form(webp(1600, 900)));
    expect(result).toEqual({ ok: true, coverUrl: URL_ });
    expect(state.actingFor).toEqual([ids.CREATOR]);
    expect(state.log).toEqual([`user:rpc:post_photo_upload_claim:${webp(1600, 900).length}:image/webp`, `admin:storage:upload:post-photos/${PATH}:image/webp:upsert=false`]);
  });

  it("só admin, com sessão e com o herói escolhido", async () => {
    state.user = null;
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "unauthenticated" });
    state.user = { id: ids.USER };
    state.isAdmin = false;
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "forbidden" });
    state.isAdmin = true;
    expect(await uploadContentCover(form(webp(800, 600), null))).toEqual({ ok: false, error: "creator_required" });
    expect(await uploadContentCover(form(webp(800, 600), "nao-e-uuid"))).toEqual({ ok: false, error: "creator_required" });
    expect(state.log).toEqual([]);
  });

  it("sem service role ou sem a URL do projeto: não configurado, antes de ler o arquivo", async () => {
    state.hasAdmin = false;
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    state.hasAdmin = true;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    expect(state.log).toEqual([]);
  });

  it("confere os bytes antes de reservar: vazio, grande, PNG (não é WebP/JPEG) e dimensões fora", async () => {
    expect(await uploadContentCover(form(new Uint8Array()))).toEqual({ ok: false, error: "empty_file" });
    expect(await uploadContentCover(form(new Uint8Array(POST_PHOTO_MAX_UPLOAD_BYTES + 1)))).toEqual({ ok: false, error: "file_too_large" });
    expect(await uploadContentCover(form(png, ids.CREATOR, "image/png"))).toEqual({ ok: false, error: "not_image" });
    expect(await uploadContentCover(form(webp(4096, 100)))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(await uploadContentCover(form(webp(32, 32)))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(state.log).toEqual([]);
  });

  it("herói escolhido que o banco não honra (inativo, inexistente, admin com perfil próprio): not_a_hero, sem reservar", async () => {
    state.acting = null;
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "not_a_hero" });
    state.acting = ids.USER;
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "not_a_hero" });
    expect(state.log).toEqual([]);
  });

  it("sem a declaração de direitos pede a confirmação antes de reservar", async () => {
    state.uploadRights = false;
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "upload_rights_required" });
    expect(state.log).toEqual([]);
  });

  it("erros do banco viram códigos da tela: kill switch, cota, herói inativo, migração ausente", async () => {
    state.claim = { data: null, error: { message: "uploads_disabled" } };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "uploads_disabled" });
    state.claim = { data: null, error: { message: "too_many_uploads" } };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "too_many_uploads" });
    state.claim = { data: null, error: { message: "not_a_hero", code: "42501" } };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "not_a_hero" });
    state.claim = { data: null, error: { message: "permission denied for table x", code: "42501" } };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "not_a_hero" });
    state.claim = { data: null, error: { message: "function missing", code: "PGRST202" } };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    state.claim = { data: null, error: { message: "boom" } };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.filter((l) => l.includes("storage"))).toEqual([]);
  });

  it("caminho reservado fora da pasta de quem enviou ou fora do padrão: erro, nada gravado", async () => {
    state.claim = { data: `${ids.CREATOR}/${ids.FILE}.webp`, error: null };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "generic" });
    state.claim = { data: `${ids.USER}/../x.webp`, error: null };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.filter((l) => l.includes("storage"))).toEqual([]);
  });

  it("falha no Storage: upload_failed, sem marcar como apagado (a limpeza diária resolve)", async () => {
    state.uploadError = { message: "bucket indisponível" };
    expect(await uploadContentCover(form(webp(800, 600)))).toEqual({ ok: false, error: "upload_failed" });
  });
});

describe("prévia da capa e validação do formulário", () => {
  it("mostra caminho da plataforma ou foto do bucket deste projeto; recusa outro host e externas", () => {
    expect(coverPreviewSrc("", BASE)).toBeNull();
    expect(coverPreviewSrc("/heroes/erick-jacquin-cover.webp", BASE)).toBe("/heroes/erick-jacquin-cover.webp");
    expect(coverPreviewSrc(URL_, BASE)).toBe(URL_);
    expect(coverPreviewSrc(URL_.replace("proj.supabase.co", "evil.example"), BASE)).toBeNull();
    expect(coverPreviewSrc("https://example.com/x.jpg", BASE)).toBeNull();
    expect(coverPreviewSrc("//evil.example/x.jpg", BASE)).toBeNull();
    expect(coverPreviewSrc(URL_, null)).toBeNull();
  });

  it("o formulário aceita a capa enviada, capa antiga da plataforma ou nenhuma; recusa URL de fora", () => {
    const values = (cover_url: string) =>
      ({
        title: "Treino de 10 minutos",
        summary: "",
        pillar: "training",
        type: "guide",
        source_locale: "pt-BR",
        cover_url,
        duration_minutes: 10,
        difficulty: null,
        tags: [],
        has_captions: false,
        disclaimer_kind: null,
        body: { kind: "guide", intro: "", sections: [], key_points: [] },
        media: { provider: "none", ref: null, captions_url: null },
        media_license_kind: "own",
        media_license_ref: "",
        media_credit: "",
      }) as ContentFormValues;
    expect(parseContentForm(values(URL_)).ok).toBe(true);
    expect(parseContentForm(values("/placeholders/cover-training-1.svg")).ok).toBe(true);
    expect(parseContentForm(values("")).ok).toBe(true);
    const bad = parseContentForm(values("https://example.com/x.jpg"));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors.cover_url).toBe("invalidCover");
  });
});

describe("quadro do vídeo como capa", () => {
  it("instante do quadro: 1 s, sem passar de 10% do vídeo; sem duração, o primeiro quadro", () => {
    expect(frameTimeFor(60)).toBe(1);
    expect(frameTimeFor(12)).toBe(1);
    expect(frameTimeFor(3)).toBeCloseTo(0.3);
    expect(frameTimeFor(0)).toBe(0);
    expect(frameTimeFor(Number.NaN)).toBe(0);
    expect(frameTimeFor(Number.POSITIVE_INFINITY)).toBe(0);
    expect(frameTimeFor(null)).toBe(0);
  });

  it("vídeo vazio ou acima de 300 MB não é decodificado", () => {
    expect(validateVideoSource({ size: 0 })).toBe("empty_file");
    expect(validateVideoSource({ size: COVER_VIDEO_MAX_SOURCE_BYTES + 1 })).toBe("file_too_large");
    expect(validateVideoSource({ size: 25 * 1024 * 1024 })).toBeNull();
  });
});

describe("post com foto × artigo com capa enviada", () => {
  it("com o corpo conhecido, só o provedor 'upload' é post com foto; sem corpo, vale a capa", () => {
    expect(isPhotoPost({ type: "article", cover_url: URL_, media_provider: "upload" }, BASE)).toBe(true);
    expect(isPhotoPost({ type: "article", cover_url: URL_, media_provider: "none" }, BASE)).toBe(false);
    expect(isPhotoPost({ type: "article", cover_url: URL_, media_provider: null }, BASE)).toBe(false);
    expect(isPhotoPost({ type: "article", cover_url: URL_ }, BASE)).toBe(true);
    expect(isPhotoPost({ type: "guide", cover_url: URL_, media_provider: "upload" }, BASE)).toBe(false);
  });

  it("feed: lê o provedor do corpo embutido (1:1); sem corpo (visitante), o provedor fica desconhecido", () => {
    expect(FEED_POST_SELECT).toContain("body:content_bodies(media_provider)");
    expect(feedPostKind({ type: "article", cover_url: URL_, body: { media_provider: "upload" } })).toEqual({ type: "article", cover_url: URL_, media_provider: "upload" });
    expect(feedPostKind({ type: "article", cover_url: URL_, body: { media_provider: "none" } })).toEqual({ type: "article", cover_url: URL_, media_provider: "none" });
    expect(feedPostKind({ type: "article", cover_url: URL_, body: null })).toEqual({ type: "article", cover_url: URL_ });
    expect(feedPostKind({ type: "article", cover_url: URL_ })).toEqual({ type: "article", cover_url: URL_ });
    expect(isPhotoPost(feedPostKind({ type: "article", cover_url: URL_, body: { media_provider: "none" } }), BASE)).toBe(false);
    expect(isPhotoPost(feedPostKind({ type: "article", cover_url: URL_, body: null }), BASE)).toBe(true);
  });
});
