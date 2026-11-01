import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCollectibleAction } from "@/app/admin/collectibles/actions";
import { uploadCollectiblePhoto } from "@/app/admin/collectibles/photo-actions";
import { POST_PHOTO_MAX_UPLOAD_BYTES } from "@/lib/post-photo/constants";

// Fotos do colecionável pelo celular (0074): a action reserva o envio pelo admin
// (collectible_photo_upload_claim), confere os bytes, grava no bucket e devolve a URL; salvar o item
// recusa foto já apagada pela limpeza diária. Regras do banco (admin, kill switch, cota, órfãos) no S81.

const BASE = "https://proj.supabase.co";
const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  FILE: "5d1f5c2e-3b8a-4c7d-9e0f-1a2b3c4d5e6f",
  ITEM: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
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
  /** Linhas vivas de post_photo_uploads (caminhos) que o admin enxerga ao salvar. */
  uploads: [] as string[],
  save: { data: null, error: null } as Result,
  log: [] as string[],
}));

function client(kind: "user" | "admin") {
  return {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.log.push(`${kind}:rpc:${fn}`);
      if (fn === "collectible_photo_upload_claim") {
        state.log.push(`  bytes=${String(args?.p_bytes)} mime=${String(args?.p_mime)}`);
        return state.claim;
      }
      if (fn === "admin_collectible_save") {
        state.log.push(`  photos=${JSON.stringify((args?.p_data as { photos: string[] }).photos)}`);
        return state.save;
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const entry = { table, filters: [] as [string, unknown][] };
      const chain: Record<string, unknown> = {};
      for (const method of ["eq", "is", "in"]) {
        chain[method] = (column: string, value: unknown) => {
          entry.filters.push([`${method}:${column}`, value]);
          return chain;
        };
      }
      chain.select = () => chain;
      chain.then = (ok: (v: Result) => void) => {
        state.log.push(`${kind}:select:${table}:${JSON.stringify(entry.filters)}`);
        const wanted = (entry.filters.find(([k]) => k === "in:path")?.[1] as string[] | undefined) ?? [];
        ok({ data: state.uploads.filter((p) => wanted.includes(p)).map((path) => ({ path })), error: null });
      };
      return { select: () => chain };
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
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => Object.assign((key: string) => `${namespace}.${key}`, { has: () => true }),
}));
vi.mock("@/lib/partner-terms/server", () => ({ hasUploadRights: async () => state.uploadRights }));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => state.user,
  hasRole: async (role: string) => role === "admin" && state.isAdmin,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client("user") }));
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

function form(data: Uint8Array, type = "image/webp") {
  const fd = new FormData();
  fd.append("file", new File([data as BlobPart], "foto.webp", { type }));
  return fd;
}

const item = (photos: string[]) => ({
  title: "Camisa assinada",
  description: "",
  creator_id: null,
  photos,
  authenticity_note: "",
  start_price_cents: 5000,
  bid_increments_cents: [1000],
  duration_minutes: 1440,
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  state.user = { id: ids.USER };
  state.isAdmin = true;
  state.uploadRights = true;
  state.hasAdmin = true;
  state.claim = { data: PATH, error: null };
  state.uploadError = null;
  state.uploads = [PATH];
  state.save = { data: ids.ITEM, error: null };
  state.log = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("uploadCollectiblePhoto", () => {
  it("reserva pelo admin, grava com o service role e devolve a URL pública", async () => {
    expect(await uploadCollectiblePhoto(form(webp(1200, 900)))).toEqual({ ok: true, url: URL_ });
    expect(state.log).toEqual([
      "user:rpc:collectible_photo_upload_claim",
      `  bytes=${webp(1200, 900).length} mime=image/webp`,
      `admin:storage:upload:post-photos/${PATH}:image/webp:upsert=false`,
    ]);
  });

  it("só admin com sessão; sem service role não configurado; nada lido antes", async () => {
    state.user = null;
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "unauthenticated" });
    state.user = { id: ids.USER };
    state.isAdmin = false;
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "forbidden" });
    state.isAdmin = true;
    state.hasAdmin = false;
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    expect(state.log).toEqual([]);
  });

  it("confere os bytes antes de reservar: vazio, grande, PNG e dimensões fora", async () => {
    expect(await uploadCollectiblePhoto(form(new Uint8Array()))).toEqual({ ok: false, error: "empty_file" });
    expect(await uploadCollectiblePhoto(form(new Uint8Array(POST_PHOTO_MAX_UPLOAD_BYTES + 1)))).toEqual({ ok: false, error: "file_too_large" });
    expect(await uploadCollectiblePhoto(form(png, "image/png"))).toEqual({ ok: false, error: "not_image" });
    expect(await uploadCollectiblePhoto(form(webp(4096, 100)))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(state.log).toEqual([]);
  });

  it("direitos, kill switch, cota, migração ausente e caminho fora da pasta", async () => {
    state.uploadRights = false;
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "upload_rights_required" });
    state.uploadRights = true;
    state.claim = { data: null, error: { message: "uploads_disabled" } };
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "uploads_disabled" });
    state.claim = { data: null, error: { message: "too_many_uploads" } };
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "too_many_uploads" });
    state.claim = { data: null, error: { message: "forbidden", code: "42501" } };
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "forbidden" });
    state.claim = { data: null, error: { message: "missing", code: "PGRST202" } };
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "photo_not_configured" });
    state.claim = { data: `${ids.ITEM}/${ids.FILE}.webp`, error: null };
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.filter((l) => l.includes("storage"))).toEqual([]);
    state.claim = { data: PATH, error: null };
    state.uploadError = { message: "bucket indisponível" };
    expect(await uploadCollectiblePhoto(form(webp(800, 600)))).toEqual({ ok: false, error: "upload_failed" });
  });
});

describe("saveCollectibleAction com fotos do celular", () => {
  it("foto enviada ainda viva: salva com a URL; caminho da plataforma não é conferido", async () => {
    expect(await saveCollectibleAction(null, item([URL_, "/collectibles/ball.svg"]))).toEqual({ ok: true, id: ids.ITEM, message: "collectibles.admin.form.created" });
    expect(state.log).toEqual([
      `user:select:post_photo_uploads:[["in:path",["${PATH}"]],["is:deleted_at",null]]`,
      "user:rpc:admin_collectible_save",
      `  photos=${JSON.stringify([URL_, "/collectibles/ball.svg"])}`,
    ]);
  });

  it("foto já apagada pela limpeza diária: photo_missing, sem salvar", async () => {
    state.uploads = [];
    expect(await saveCollectibleAction(ids.ITEM, item([URL_]))).toEqual({ ok: false, error: "collectibles.admin.errors.photo_missing" });
    expect(state.log.filter((l) => l.includes("admin_collectible_save"))).toEqual([]);
  });

  it("sem foto do bucket não consulta os envios", async () => {
    expect(await saveCollectibleAction(null, item(["/collectibles/ball.svg"]))).toMatchObject({ ok: true });
    expect(state.log.some((l) => l.includes("post_photo_uploads"))).toBe(false);
  });
});
