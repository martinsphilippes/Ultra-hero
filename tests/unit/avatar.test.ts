import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeAvatar, uploadAvatar } from "@/app/(app)/profile/avatar-actions";
import { deleteAccount, updateProfile } from "@/app/(app)/profile/actions";
import { adminRemoveCreatorPhoto, createCreator, updateCreator, type CreatorFormValues } from "@/app/admin/ops-actions";
import { updateCreatorProfile } from "@/app/creator/profile/actions";
import { creatorProfilePayload, parseCreatorProfile, type CreatorProfileInput } from "@/components/creator/profile-schema";
import { DELETE_CONFIRM_WORD } from "@/components/me/subscription";
import { AVATAR_ERRORS, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, toAvatarError } from "@/lib/avatar/constants";
import { discardsSavedPhoto, isLocalPath, isStoredAvatarUrl, publicAvatarUrl, safeAvatarSrc, storedAvatarOwner, storedAvatarPath } from "@/lib/avatar/paths";
import { coverCrop } from "@/lib/avatar/resize";
import { AVATAR_CACHE_SECONDS, AVATAR_CLEANUP_LIMIT, cleanupAvatarUploads } from "@/lib/avatar/server";
import { sniffImage } from "@/lib/avatar/sniff";
import { validateSourceFile, validateUploadBytes } from "@/lib/avatar/validation";

// Foto de perfil (0031) sem Next, Supabase nem Storage de verdade: caminhos e URLs do bucket, tipo
// pelos magic bytes, validações, a ordem das etapas das actions (reservar → gravar → aplicar →
// apagar a anterior), o que não pode acontecer (foto alheia, Storage sem service role) e a limpeza
// diária. As regras do banco (cota, kill switch, dono) são testadas de verdade no S33 do RLS.

const BASE = "https://proj.supabase.co";
const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  OTHER: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  NEW: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  OLD: "a3bb189e-8bf9-4888-9912-ace4e6543002",
}));
const url = (owner: string, file: string) => `${BASE}/storage/v1/object/public/avatars/${owner}/${file}`;
const NEW_PATH = `${ids.USER}/${ids.NEW}.webp`;
const OLD_URL = url(ids.USER, `${ids.OLD}.jpg`);

type Result = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  roles: ["consumer", "creator"] as string[],
  hasAdmin: true,
  profile: { avatar_url: null as string | null },
  hero: null as { id?: string; slug: string; status?: string; user_id?: string | null; avatar_url: string | null } | null,
  claim: { data: null, error: null } as Result,
  setPhoto: { data: [], error: null } as Result,
  orphans: { data: [], error: null } as Result,
  uploadError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  // falhas só em algumas gravações: "<cliente>:<tabela>" → números das chamadas (1, 2…) que falham
  updateFailures: {} as Record<string, number[]>,
  updateCalls: {} as Record<string, number>,
  deleteAccountError: null as { message: string } | null,
  purged: 0,
  log: [] as string[],
  writes: [] as { client: string; table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }[],
  revalidated: [] as string[],
}));

// Construtor encadeável que imita o PostgREST: registra a operação e responde conforme o estado.
function client(kind: "user" | "admin") {
  return {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.log.push(`${kind}:rpc:${fn}`);
      if (fn === "avatar_upload_claim") return state.claim;
      if (fn === "avatar_set_photo") {
        state.log.push(`  url=${String(args?.p_url)}`);
        return state.setPhoto;
      }
      if (fn === "delete_my_account") return { data: null, error: state.deleteAccountError };
      if (fn === "avatar_orphan_uploads") {
        state.log.push(`  limit=${String(args?.p_limit)}`);
        return state.orphans;
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const build = (op: string, payload?: unknown) => {
        const entry = { client: kind, table, op, payload, filters: [] as [string, string, unknown][] };
        if (op !== "select") state.writes.push(entry);
        if (op !== "select") state.log.push(`${kind}:${op}:${table}`);
        const resolve = (): Result => {
          if (op === "select") return { data: table === "profiles" ? state.profile : table === "creator_profiles" ? state.hero : null, error: null };
          if (op === "delete") return { data: Array.from({ length: state.purged }, (_, i) => ({ id: String(i) })), error: null };
          if (op === "update") {
            const key = `${kind}:${table}`;
            const n = (state.updateCalls[key] = (state.updateCalls[key] ?? 0) + 1);
            if (state.updateFailures[key]?.includes(n)) return { data: null, error: { message: "boom" } };
          }
          return { data: null, error: state.updateError };
        };
        const chain: Record<string, unknown> = {};
        for (const method of ["eq", "is", "in", "not", "lt"]) {
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
      };
    },
    auth: { signOut: async () => ({ error: null }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts: { contentType: string; upsert: boolean; cacheControl: string }) => {
          state.log.push(`${kind}:storage:upload:${bucket}/${path}:${opts.contentType}:upsert=${opts.upsert}:cache=${opts.cacheControl}`);
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
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void state.revalidated.push(path) }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => state.user, getRoles: async () => state.roles.map((role) => ({ role })), requireRole: async () => ({ user: { id: "ad000000-0000-4000-8000-000000000001" } }) }));
// dependências de ops-actions.ts (admin) que não importam aqui: mensagens viram a própria chave
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => Object.assign((key: string) => key, { has: () => true }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client("user") }));
vi.mock("@/lib/supabase/admin", () => ({
  hasAdminClient: () => state.hasAdmin,
  createAdminClient: () => {
    if (!state.hasAdmin) throw new Error("sem service role");
    return client("admin");
  },
}));
// dependências de profile/actions.ts que não importam aqui
vi.mock("@/i18n/actions", () => ({ setLocaleAction: async () => undefined }));
vi.mock("@/lib/theme/actions", () => ({ setThemeAction: async () => undefined }));
vi.mock("@/lib/analytics/track", () => ({ trackEvent: async () => undefined }));
vi.mock("@/lib/recommendations/recalculate", () => ({ recalculateRecommendations: async () => ({ persisted: false }) }));

// ---------------------------------------------------------------- imagens sintéticas
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

const webpVp8 = (w: number, h: number) => bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0x10, 0x02, 0x00], [0x9d, 0x01, 0x2a], le16(w), le16(h), [0, 0]);
function webpVp8l(w: number, h: number) {
  const a = w - 1;
  const b = h - 1;
  return bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0x2f], [a & 0xff, ((a >> 8) & 0x3f) | ((b & 0x3) << 6), (b >> 2) & 0xff, (b >> 10) & 0x0f], [0, 0, 0, 0, 0]);
}
const webpVp8x = (w: number, h: number) => bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], le24(w - 1), le24(h - 1));
// JPEG mínimo: SOI, APP0 (JFIF) e SOF0 com altura/largura
const jpeg = (w: number, h: number, sof = 0xc0) =>
  bytes([0xff, 0xd8], [0xff, 0xe0], be16(16), "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, sof], be16(17), [8], be16(h), be16(w), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], "IHDR", [0, 0, 2, 0, 0, 0, 2, 0]);

function form(data: Uint8Array, type = "image/webp") {
  const fd = new FormData();
  fd.append("file", new File([data as BlobPart], "avatar.webp", { type }));
  return fd;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  state.user = { id: ids.USER };
  state.roles = ["consumer", "creator"];
  state.hasAdmin = true;
  state.profile = { avatar_url: null };
  state.hero = null;
  state.claim = { data: NEW_PATH, error: null };
  state.setPhoto = { data: [], error: null };
  state.orphans = { data: [], error: null };
  state.uploadError = null;
  state.removeError = null;
  state.updateError = null;
  state.updateFailures = {};
  state.updateCalls = {};
  state.deleteAccountError = null;
  state.purged = 0;
  state.log = [];
  state.writes = [];
  state.revalidated = [];
});

// ---------------------------------------------------------------- caminhos
describe("paths: URLs do bucket público avatars", () => {
  it("monta e lê de volta o caminho, com ou sem barra no fim da base", () => {
    const u = publicAvatarUrl(`${BASE}/`, NEW_PATH);
    expect(u).toBe(`${BASE}/storage/v1/object/public/avatars/${NEW_PATH}`);
    expect(storedAvatarPath(u, BASE)).toBe(NEW_PATH);
    expect(storedAvatarOwner(u, BASE)).toBe(ids.USER);
    expect(isStoredAvatarUrl(u, `${BASE}/rest/v1`)).toBe(true);
  });

  it.each([
    ["outro bucket", `${BASE}/storage/v1/object/public/recipe-media/${NEW_PATH}`],
    ["outro host", `https://evil.example.com/storage/v1/object/public/avatars/${NEW_PATH}`],
    ["extensão .png", url(ids.USER, `${ids.NEW}.png`)],
    ["uuid inválido", url("nao-e-uuid", `${ids.NEW}.webp`)],
    ["barra dupla", `${BASE}/storage/v1/object/public/avatars//${NEW_PATH}`],
    ["consulta na URL", `${url(ids.USER, `${ids.NEW}.webp`)}?download=1`],
    ["subpasta a mais", url(ids.USER, `x/${ids.NEW}.webp`)],
    ["ilustração", "/placeholders/avatar-1.svg"],
  ])("recusa %s", (_label, value) => {
    expect(storedAvatarPath(value, BASE)).toBeNull();
    expect(isStoredAvatarUrl(value, BASE)).toBe(false);
  });

  it("sem base configurada nada é foto do bucket", () => {
    expect(isStoredAvatarUrl(url(ids.USER, `${ids.NEW}.webp`), null)).toBe(false);
    expect(isStoredAvatarUrl(null, BASE)).toBe(false);
  });

  it("o navegador só carrega caminho local ou foto do bucket deste projeto; o resto vira a ilustração", () => {
    const fallback = "/placeholders/avatar-3.svg";
    const own = url(ids.USER, `${ids.NEW}.webp`);
    expect(AVATAR_CACHE_SECONDS).toBe(3600);
    expect(safeAvatarSrc(own, fallback, BASE)).toBe(own);
    expect(safeAvatarSrc("/heroes/rafael-duarte-avatar.webp", fallback, BASE)).toBe("/heroes/rafael-duarte-avatar.webp");
    // avatar_url gravado pela API com o JWT do herói: nada de <img> de terceiro para o visitante
    for (const hostile of [
      "https://attacker.example/p.gif",
      `https://attacker.example/storage/v1/object/public/avatars/${NEW_PATH}`,
      `//attacker.example/storage/v1/object/public/avatars/${NEW_PATH}`,
      "/\\attacker.example/p.gif",
      "data:image/svg+xml,<svg/>",
      "javascript:alert(1)",
      "https://lh3.googleusercontent.com/a/foto",
      `${BASE}/storage/v1/object/public/recipe-media/${NEW_PATH}`,
      "",
      null,
    ]) {
      expect(safeAvatarSrc(hostile, fallback, BASE)).toBe(fallback);
    }
    // sem a base configurada só o caminho local passa
    expect(safeAvatarSrc(own, fallback, null)).toBe(fallback);
    expect(isLocalPath("/placeholders/avatar-1.svg")).toBe(true);
    expect(isLocalPath("//x.example/a.png")).toBe(false);
  });

  it("aviso de foto descartada: vale o valor salvo, não o rascunho", () => {
    const saved = url(ids.USER, `${ids.NEW}.webp`);
    expect(discardsSavedPhoto(saved, "/placeholders/avatar-2.svg")).toBe(true);
    expect(discardsSavedPhoto(saved, null)).toBe(true);
    expect(discardsSavedPhoto(saved, "")).toBe(true);
    expect(discardsSavedPhoto(saved, saved)).toBe(false);
    expect(discardsSavedPhoto(null, "/placeholders/avatar-2.svg")).toBe(false);
  });
});

// ---------------------------------------------------------------- magic bytes
describe("sniffImage: tipo e dimensões pelos bytes", () => {
  it("WebP com quadro VP8, VP8L e VP8X", () => {
    expect(sniffImage(webpVp8(512, 512))).toEqual({ mime: "image/webp", width: 512, height: 512 });
    expect(sniffImage(webpVp8l(300, 200))).toEqual({ mime: "image/webp", width: 300, height: 200 });
    expect(sniffImage(webpVp8x(4000, 3000))).toEqual({ mime: "image/webp", width: 4000, height: 3000 });
  });

  it("JPEG baseline e progressivo (SOF0/SOF2), pulando o APP0", () => {
    expect(sniffImage(jpeg(512, 512))).toEqual({ mime: "image/jpeg", width: 512, height: 512 });
    expect(sniffImage(jpeg(640, 480, 0xc2))).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
  });

  it("PNG, HTML, vazio e arquivos truncados não passam", () => {
    expect(sniffImage(png)).toBeNull();
    expect(sniffImage(bytes("<!doctype html><html><body>oi</body></html>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(bytes([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImage(webpVp8(512, 512).slice(0, 20))).toBeNull();
    // JPEG que chega ao início dos dados (SOS) sem quadro
    expect(sniffImage(bytes([0xff, 0xd8], [0xff, 0xda], be16(4), [0, 0]))).toBeNull();
    // WebP VP8 sem o código de início do quadro-chave
    const broken = webpVp8(512, 512);
    broken[23] = 0;
    expect(sniffImage(broken)).toBeNull();
  });
});

describe("validações", () => {
  it("arquivo escolhido no aparelho: imagem (MIME ou extensão), não vazio, até 15 MB", () => {
    expect(validateSourceFile({ type: "image/heic", size: 1000, name: "IMG_1.HEIC" })).toBeNull();
    expect(validateSourceFile({ type: "", size: 1000, name: "foto.jpeg" })).toBeNull();
    expect(validateSourceFile({ type: "", size: 1000, name: "foto.txt" })).toBe("not_image");
    expect(validateSourceFile({ type: "video/mp4", size: 1000, name: "v.mp4" })).toBe("not_image");
    expect(validateSourceFile({ type: "image/jpeg", size: 0, name: "a.jpg" })).toBe("empty_file");
    expect(validateSourceFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1, name: "a.jpg" })).toBe("file_too_large");
  });

  it("bytes enviados: WebP/JPEG, quadrado, até 1024 px e 2 MiB", () => {
    expect(validateUploadBytes(webpVp8(512, 512))).toEqual({ ok: true, image: { mime: "image/webp", width: 512, height: 512 } });
    expect(validateUploadBytes(jpeg(640, 480))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(validateUploadBytes(webpVp8x(2048, 2048))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(validateUploadBytes(png)).toEqual({ ok: false, error: "not_image" });
    expect(validateUploadBytes(new Uint8Array())).toEqual({ ok: false, error: "empty_file" });
    expect(validateUploadBytes(new Uint8Array(MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, error: "file_too_large" });
  });

  it("recorte central quadrado e códigos de erro conhecidos", () => {
    expect(coverCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(coverCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(toAvatarError("too_many_uploads")).toBe("too_many_uploads");
    expect(toAvatarError("invalid_path")).toBe("generic");
    expect(AVATAR_ERRORS).toContain("decode_failed");
  });
});

// ---------------------------------------------------------------- envio
describe("uploadAvatar", () => {
  it("reserva, grava com o service role, aplica e só então apaga a foto anterior da própria pessoa", async () => {
    state.hero = { slug: "helena-vilar", avatar_url: OLD_URL };
    state.setPhoto = { data: [OLD_URL, "/placeholders/avatar-2.svg", url(ids.OTHER, `${ids.OLD}.webp`)], error: null };
    const result = await uploadAvatar(form(webpVp8(512, 512)));
    expect(result).toEqual({ ok: true, avatarUrl: url(ids.USER, `${ids.NEW}.webp`) });
    expect(state.log).toEqual([
      "user:rpc:avatar_upload_claim",
      // cache curto (1 h): a foto removida não fica servida por meses em cache
      `admin:storage:upload:avatars/${NEW_PATH}:image/webp:upsert=false:cache=3600`,
      "user:rpc:avatar_set_photo",
      `  url=${url(ids.USER, `${ids.NEW}.webp`)}`,
      // anterior própria: referências antes do objeto; a ilustração e a foto alheia não são tocadas
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
    ]);
    expect(state.revalidated).toEqual(expect.arrayContaining(["/", "/profile", "/creator", "/personalities/helena-vilar"]));
    // o perfil do herói mora no /profile: o endereço antigo só redireciona
    expect(state.revalidated).not.toContain("/creator/profile");
  });

  it("o tipo vem dos bytes: PNG disfarçado de WebP não chega ao banco", async () => {
    expect(await uploadAvatar(form(png, "image/webp"))).toEqual({ ok: false, error: "not_image" });
    expect(await uploadAvatar(form(jpeg(640, 480), "image/jpeg"))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(state.log).toEqual([]);
  });

  it("sem arquivo, sem sessão ou sem service role não reserva nada", async () => {
    expect(await uploadAvatar(new FormData())).toEqual({ ok: false, error: "not_image" });
    state.hasAdmin = false;
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "avatar_not_configured" });
    state.user = null;
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "unauthenticated" });
    expect(state.log).toEqual([]);
  });

  it("cota e kill switch do banco chegam como código; banco sem a 0031 vira não configurado", async () => {
    state.claim = { data: null, error: { message: "too_many_uploads" } };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "too_many_uploads" });
    state.claim = { data: null, error: { message: "uploads_disabled" } };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "uploads_disabled" });
    state.claim = { data: null, error: { code: "PGRST202", message: "Could not find the function public.avatar_upload_claim(p_bytes, p_mime) in the schema cache" } };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "avatar_not_configured" });
    expect(state.log.filter((l) => l.includes("storage"))).toEqual([]);
  });

  it("caminho reservado que não é da própria pessoa é recusado antes do Storage", async () => {
    state.claim = { data: `${ids.OTHER}/${ids.NEW}.webp`, error: null };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "generic" });
    expect(state.log).toEqual(["user:rpc:avatar_upload_claim"]);
  });

  it("falha no Storage não aplica nem marca o envio (o objeto pode ter chegado: a limpeza diária apaga)", async () => {
    state.uploadError = { message: "network" };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "upload_failed" });
    expect(state.log.at(-1)).toMatch(/^admin:storage:upload:/);
    expect(state.log).not.toContain("user:rpc:avatar_set_photo");
    expect(state.log).not.toContain("admin:update:avatar_uploads");
  });

  it("falha ao aplicar tira a foto nova do bucket e só então marca o envio", async () => {
    state.setPhoto = { data: null, error: { message: "invalid_path" } };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.slice(-2)).toEqual([`admin:storage:remove:avatars/${NEW_PATH}`, "admin:update:avatar_uploads"]);
  });

  it("falha ao aplicar com o Storage recusando a remoção: o envio fica pendente para a limpeza diária", async () => {
    state.setPhoto = { data: null, error: { message: "invalid_path" } };
    state.removeError = { message: "503" };
    expect(await uploadAvatar(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.at(-1)).toBe(`admin:storage:remove:avatars/${NEW_PATH}`);
    expect(state.log).not.toContain("admin:update:avatar_uploads");
  });
});

describe("removeAvatar", () => {
  it("com ilustração não toca o Storage", async () => {
    state.profile = { avatar_url: "/placeholders/avatar-3.svg" };
    expect(await removeAvatar()).toEqual({ ok: true, avatarUrl: "/placeholders/avatar-3.svg" });
    expect(state.log).toEqual([]);
  });

  it("com foto própria limpa as referências, apaga o objeto e marca o envio", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.hero = { slug: "helena-vilar", avatar_url: OLD_URL };
    expect(await removeAvatar()).toEqual({ ok: true, avatarUrl: null });
    expect(state.log).toEqual([
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
    ]);
    expect(state.writes[0].filters).toEqual([["eq", "avatar_url", OLD_URL]]);
  });

  it("referência que não sai não é anunciada como removida", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.updateError = { message: "boom" };
    expect(await removeAvatar()).toEqual({ ok: false, error: "generic" });
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
  });

  it("foto de outra pessoa (herói ligado pelo admin) não é apagada por aqui", async () => {
    state.profile = { avatar_url: url(ids.OTHER, `${ids.OLD}.jpg`) };
    expect(await removeAvatar()).toEqual({ ok: true, avatarUrl: url(ids.OTHER, `${ids.OLD}.jpg`) });
    expect(state.log).toEqual([]);
  });
});

describe("updateProfile com foto", () => {
  const base = { displayName: "Ana", locale: "pt-BR", theme: "dark" };

  it("foto alheia ou diferente da atual é recusada (a foto só entra pelo envio)", async () => {
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: url(ids.OTHER, `${ids.OLD}.jpg`) })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: url(ids.USER, `${ids.NEW}.webp`) })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: "https://evil.example.com/a.jpg" })).toEqual({ ok: false, error: "invalid_input" });
    expect(state.writes).toEqual([]);
  });

  it("salvar mantendo a foto atual não apaga nada", async () => {
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: OLD_URL })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
  });

  it("trocar a foto por ilustração tira a foto do ar (perfil de herói incluso)", async () => {
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-4.svg" })).toEqual({ ok: true });
    expect(state.log).toEqual([
      "user:update:profiles",
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
    ]);
  });
});

// Os dois formulários (Dados e "Seu perfil de herói") ficam na mesma página do /profile: um deles
// pode estar com o avatar velho. Sem a pessoa mexer no avatar, ele não vai para a action e o do banco
// fica — salvar o outro formulário não troca nem apaga a foto.
describe("updateProfile sem mexer no avatar", () => {
  const base = { displayName: "Ana", locale: "pt-BR", theme: "dark" };

  it("cenário B: avatar ausente mantém a foto do banco (nem lê, nem regrava, nem libera)", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.hero = { slug: "helena-vilar", avatar_url: OLD_URL };
    expect(await updateProfile(base)).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
    expect(state.writes[0].payload).toEqual({ display_name: "Ana" });
    expect(state.writes[0].payload).not.toHaveProperty("avatar_url");
  });

  it("mexer no avatar continua gravando e trocar a foto por ilustração continua liberando a foto", async () => {
    state.profile = { avatar_url: "/placeholders/avatar-1.svg" };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-2.svg" })).toEqual({ ok: true });
    expect(state.writes[0].payload).toEqual({ display_name: "Ana", avatar_url: "/placeholders/avatar-2.svg" });
    state.log = [];
    state.writes = [];
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.log).toContain(`admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`);
  });

  it("validações seguem: ilustração só da lista, foto só a atual e da própria pessoa", async () => {
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/cover-training-1.svg" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: "/heroes/rafael-duarte-avatar.webp" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: url(ids.OTHER, `${ids.OLD}.jpg`) })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: url(ids.USER, `${ids.NEW}.webp`) })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, displayName: " " })).toEqual({ ok: false, error: "invalid_input" });
    expect(state.writes).toEqual([]);
  });
});

// Herói ativo: um avatar só. A tela Dados dele nunca envia o avatar; se um chegar (POST direto, aba
// antiga), vale também no perfil público, para os dois nunca ficarem diferentes.
describe("updateProfile com herói ativo (um avatar só)", () => {
  const base = { displayName: "Helena", locale: "pt-BR", theme: "dark" };
  const HERO_ID = "c0000000-0000-4000-8000-000000000002";
  beforeEach(() => {
    state.hero = { id: HERO_ID, slug: "helena-vilar", status: "active", avatar_url: "/placeholders/avatar-1.svg" };
    state.profile = { avatar_url: "/placeholders/avatar-1.svg" };
  });

  it("avatar que chega aqui vale também no perfil público (app primeiro, depois a página pública)", async () => {
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-5.svg" })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles", "user:update:creator_profiles"]);
    expect(state.writes[1].payload).toEqual({ avatar_url: "/placeholders/avatar-5.svg" });
    expect(state.writes[1].filters).toEqual([["eq", "id", HERO_ID]]);
  });

  it("sem o avatar (o que a tela Dados do herói envia) nenhum dos dois é tocado", async () => {
    expect(await updateProfile(base)).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
    expect(state.writes[0].payload).toEqual({ display_name: "Helena" });
  });

  it("perfil inativo ou sem o papel: só o app muda (como antes)", async () => {
    state.hero = { ...state.hero!, status: "suspended" };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-5.svg" })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
    state.log = [];
    state.hero = { ...state.hero!, status: "active" };
    state.roles = ["consumer"];
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-5.svg" })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
  });

  it("falha no perfil público: o avatar do app volta ao anterior e a tela é avisada", async () => {
    state.updateFailures = { "user:creator_profiles": [1] };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-5.svg" })).toEqual({ ok: false, error: "avatar_not_saved" });
    expect(state.log).toEqual(["user:update:profiles", "user:update:creator_profiles", "user:update:profiles"]);
    expect(state.writes[2].payload).toEqual({ avatar_url: "/placeholders/avatar-1.svg" });
  });

  it("trocar a foto (nos dois lados) por ilustração: grava os dois e libera a foto uma vez", async () => {
    state.hero = { ...state.hero!, avatar_url: OLD_URL };
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-6.svg" })).toEqual({ ok: true });
    expect(state.log.filter((l) => l.startsWith("admin:storage:remove"))).toEqual([`admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`]);
    expect(state.log.slice(0, 2)).toEqual(["user:update:profiles", "user:update:creator_profiles"]);
  });
});

describe("updateCreatorProfile (perfil do herói no /profile)", () => {
  const values = (avatar?: string): CreatorProfileInput => ({
    headline: "Treino curto",
    bio: "Bio nova",
    ...(avatar === undefined ? {} : { avatar_url: avatar }),
    cover_url: "/placeholders/cover-training-1.svg",
    socials: { instagram: "@helena", youtube: "", site: "" },
  });
  const heroUpdates = () => state.writes.filter((w) => w.client === "user" && w.table === "creator_profiles" && w.op === "update");
  const appUpdates = () => state.writes.filter((w) => w.client === "user" && w.table === "profiles" && w.op === "update");

  beforeEach(() => {
    state.hero = { id: "c0000000-0000-4000-8000-000000000002", slug: "helena-vilar", status: "active", avatar_url: OLD_URL };
    state.profile = { avatar_url: OLD_URL };
  });

  it("cenário A: foto enviada em Dados e o formulário do herói salvo sem mexer no avatar — a foto fica nos dois lados", async () => {
    expect(await updateCreatorProfile(values())).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:creator_profiles"]);
    expect(heroUpdates()[0].payload).not.toHaveProperty("avatar_url");
    // nenhum dos dois avatares é tocado
    expect(appUpdates()).toEqual([]);
    expect(heroUpdates()[0].payload).toMatchObject({ headline: "Treino curto", bio: "Bio nova" });
    expect(state.revalidated).toEqual(expect.arrayContaining(["/profile", "/creator", "/personalities/helena-vilar"]));
    expect(state.revalidated).not.toContain("/creator/profile");
  });

  it("um avatar só: a ilustração vai para o perfil público e para o app, e a foto antiga sai do ar uma vez só", async () => {
    expect(await updateCreatorProfile(values("/placeholders/avatar-4.svg"))).toEqual({ ok: true });
    expect(heroUpdates()[0].payload).toMatchObject({ avatar_url: "/placeholders/avatar-4.svg" });
    expect(appUpdates()).toHaveLength(1);
    expect(appUpdates()[0].payload).toEqual({ avatar_url: "/placeholders/avatar-4.svg" });
    expect(appUpdates()[0].filters).toEqual([["eq", "id", ids.USER]]);
    // perfil público primeiro, depois o app; a foto (que estava nos dois) é liberada uma vez
    expect(state.log).toEqual([
      "user:update:creator_profiles",
      "user:update:profiles",
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
    ]);
  });

  it("ilustração com o app e a página pública já iguais: grava os dois e não toca o Storage", async () => {
    state.hero = { ...state.hero!, avatar_url: "/placeholders/avatar-1.svg" };
    state.profile = { avatar_url: "/placeholders/avatar-1.svg" };
    expect(await updateCreatorProfile(values("/placeholders/avatar-2.svg"))).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:creator_profiles", "user:update:profiles"]);
    expect(heroUpdates()[0].payload).toMatchObject({ avatar_url: "/placeholders/avatar-2.svg" });
    expect(appUpdates()[0].payload).toEqual({ avatar_url: "/placeholders/avatar-2.svg" });
    expect(state.revalidated).toEqual(expect.arrayContaining(["/", "/profile", "/personalities/helena-vilar"]));
  });

  it("app com outra foto própria (dados antigos): as duas fotos saem do ar e os dois lados ficam com a ilustração", async () => {
    const appPhoto = url(ids.USER, `${ids.NEW}.webp`);
    state.profile = { avatar_url: appPhoto };
    expect(await updateCreatorProfile(values("/placeholders/avatar-3.svg"))).toEqual({ ok: true });
    expect(appUpdates()[0].payload).toEqual({ avatar_url: "/placeholders/avatar-3.svg" });
    expect(state.log.filter((l) => l.startsWith("admin:storage:remove"))).toEqual([`admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`, `admin:storage:remove:avatars/${NEW_PATH}`]);
  });

  it("manter a foto atual (mexeu e voltou) regrava o mesmo valor nos dois lados e não apaga nada", async () => {
    expect(await updateCreatorProfile(values(OLD_URL))).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:creator_profiles", "user:update:profiles"]);
    expect(heroUpdates()[0].payload).toMatchObject({ avatar_url: OLD_URL });
    expect(appUpdates()[0].payload).toEqual({ avatar_url: OLD_URL });
  });

  it("ilustração fora da lista (capa, foto oficial, caminho solto) é recusada sem gravar nada", async () => {
    for (const bad of ["/placeholders/cover-training-1.svg", "/heroes/rafael-duarte-avatar.webp", "/placeholders/avatar-9.svg", "/qualquer.png"]) {
      expect(await updateCreatorProfile(values(bad))).toEqual({ ok: false, error: "invalid_input" });
    }
    expect(state.writes).toEqual([]);
  });

  it("foto alheia é recusada sem gravar nada, mesmo sendo a atual do perfil público", async () => {
    const other = url(ids.OTHER, `${ids.OLD}.jpg`);
    state.hero = { ...state.hero!, avatar_url: other };
    expect(await updateCreatorProfile(values(other))).toEqual({ ok: false, error: "invalid_input" });
    expect(state.writes).toEqual([]);
  });

  it("falha ao gravar no app: o avatar do perfil público volta ao anterior, a foto fica e a tela é avisada", async () => {
    state.updateFailures = { "user:profiles": [1] };
    expect(await updateCreatorProfile(values("/placeholders/avatar-4.svg"))).toEqual({ ok: false, error: "avatar_not_saved" });
    expect(heroUpdates().map((w) => (w.payload as { avatar_url?: string | null }).avatar_url)).toEqual(["/placeholders/avatar-4.svg", OLD_URL]);
    expect(heroUpdates()[1].payload).toEqual({ avatar_url: OLD_URL });
    // nada é apagado: a foto segue nos dois lados
    expect(state.log.some((l) => l.startsWith("admin:"))).toBe(false);
  });

  it("falha ao gravar no app e ao desfazer: continua avisando (nunca diz que salvou) e não apaga a foto", async () => {
    state.updateFailures = { "user:profiles": [1], "user:creator_profiles": [2] };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await updateCreatorProfile(values("/placeholders/avatar-4.svg"))).toEqual({ ok: false, error: "avatar_not_saved" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(state.log.some((l) => l.startsWith("admin:"))).toBe(false);
  });

  it("falha no perfil público (a primeira gravação): o app não é tocado", async () => {
    state.updateFailures = { "user:creator_profiles": [1] };
    expect(await updateCreatorProfile(values("/placeholders/avatar-4.svg"))).toMatchObject({ ok: false });
    expect(appUpdates()).toEqual([]);
    expect(state.log).toEqual(["user:update:creator_profiles"]);
  });

  it("validações seguem: foto diferente da atual ou alheia, URL de outro host e perfil inativo são recusados", async () => {
    expect(await updateCreatorProfile(values(url(ids.USER, `${ids.NEW}.webp`)))).toEqual({ ok: false, error: "invalid_input" });
    state.hero = { ...state.hero!, avatar_url: url(ids.OTHER, `${ids.OLD}.jpg`) };
    expect(await updateCreatorProfile(values(url(ids.OTHER, `${ids.OLD}.jpg`)))).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateCreatorProfile(values("https://attacker.example/p.gif"))).toEqual({ ok: false, error: "invalid_input" });
    state.hero = { ...state.hero!, status: "suspended" };
    expect(await updateCreatorProfile(values())).toEqual({ ok: false, error: "creator_unavailable" });
    state.user = null;
    expect(await updateCreatorProfile(values())).toEqual({ ok: false, error: "unauthenticated" });
    expect(state.writes).toEqual([]);
  });

  it("sem o papel de herói (ou admin) recusa antes de ler ou gravar, mesmo com o perfil vinculado e ativo", async () => {
    state.roles = ["consumer"];
    expect(await updateCreatorProfile(values())).toEqual({ ok: false, error: "forbidden" });
    expect(state.writes).toEqual([]);
    state.roles = ["consumer", "admin"];
    expect(await updateCreatorProfile(values())).toEqual({ ok: true });
  });

  it("formulário: sem mexer no avatar ele sai do envio; mexendo, vai junto", () => {
    const form = { ...values(), avatar_url: "/placeholders/avatar-1.svg" };
    expect(creatorProfilePayload(form, false)).not.toHaveProperty("avatar_url");
    expect(creatorProfilePayload(form, false)).toMatchObject({ bio: "Bio nova", cover_url: "/placeholders/cover-training-1.svg" });
    expect(creatorProfilePayload(form, true)).toMatchObject({ avatar_url: "/placeholders/avatar-1.svg" });
  });

  it("esquema: avatar ausente = inalterado; presente continua validado; o resto também", () => {
    const untouched = parseCreatorProfile(values());
    expect(untouched.ok).toBe(true);
    expect(untouched.ok && "avatar_url" in untouched.data).toBe(false);
    expect(parseCreatorProfile(values(""))).toMatchObject({ ok: true, data: { avatar_url: "" } });
    expect(parseCreatorProfile(values("//evil.example/a.png"))).toEqual({ ok: false, errors: { avatar_url: "invalidCover" } });
    expect(parseCreatorProfile({ ...values(), cover_url: "https://evil.example/c.png" })).toEqual({ ok: false, errors: { cover_url: "invalidCover" } });
    expect(parseCreatorProfile({ ...values(), headline: "x".repeat(121) })).toEqual({ ok: false, errors: { headline: "tooLong" } });
  });
});

describe("deleteAccount com foto", () => {
  it("a foto sai do Storage e do perfil público só depois da exclusão confirmada", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.hero = { slug: "helena-vilar", avatar_url: OLD_URL };
    expect(await deleteAccount({ confirmation: DELETE_CONFIRM_WORD })).toEqual({ ok: true });
    expect(state.log).toEqual([
      "user:rpc:delete_my_account",
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
    ]);
  });

  it("exclusão recusada pelo banco não apaga a foto", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.deleteAccountError = { message: "retention_exception_active" };
    expect(await deleteAccount({ confirmation: DELETE_CONFIRM_WORD })).toEqual({ ok: false, error: "retention_exception_active" });
    expect(state.log).toEqual(["user:rpc:delete_my_account"]);
  });
});

// ---------------------------------------------------------------- limpeza diária
describe("cleanupAvatarUploads", () => {
  const orphanA = `${ids.USER}/${ids.NEW}.webp`;
  const orphanB = `${ids.OTHER}/${ids.OLD}.jpg`;

  it("limpa referências, apaga em lote, marca e remove registros antigos já apagados", async () => {
    state.orphans = { data: [orphanA, orphanB], error: null };
    state.purged = 3;
    const result = await cleanupAvatarUploads(client("admin") as never, BASE, new Date("2026-10-22T03:00:00Z"));
    expect(result).toEqual({ avatars_deleted: 2, avatars_errors: 0, avatars_rows_purged: 3 });
    expect(state.log).toEqual([
      "admin:rpc:avatar_orphan_uploads",
      `  limit=${AVATAR_CLEANUP_LIMIT}`,
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${orphanA},${orphanB}`,
      "admin:update:avatar_uploads",
      "admin:delete:avatar_uploads",
    ]);
    expect(state.writes[0].filters).toEqual([["in", "avatar_url", [url(ids.USER, `${ids.NEW}.webp`), url(ids.OTHER, `${ids.OLD}.jpg`)]]]);
    // registros: só os já apagados e criados há mais de 2 dias
    expect(state.writes.at(-1)?.filters).toEqual([
      ["not", "deleted_at", ["is", null]],
      ["lt", "created_at", "2026-10-20T03:00:00.000Z"],
    ]);
  });

  it("falha no Storage não marca (tenta de novo amanhã)", async () => {
    state.orphans = { data: [orphanA], error: null };
    state.removeError = { message: "503" };
    const result = await cleanupAvatarUploads(client("admin") as never, BASE);
    expect(result).toMatchObject({ avatars_deleted: 0, avatars_errors: 1 });
    expect(state.log).not.toContain("admin:update:avatar_uploads");
  });

  it("referência que não sai impede apagar o objeto", async () => {
    state.orphans = { data: [orphanA], error: null };
    state.updateError = { message: "boom" };
    const result = await cleanupAvatarUploads(client("admin") as never, BASE);
    expect(result).toMatchObject({ avatars_deleted: 0, avatars_errors: 1 });
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
  });

  it("sem órfãos só limpa registros; sem base ou sem a 0031 lança (o cron registra e segue)", async () => {
    expect(await cleanupAvatarUploads(client("admin") as never, BASE)).toEqual({ avatars_deleted: 0, avatars_errors: 0, avatars_rows_purged: 0 });
    await expect(cleanupAvatarUploads(client("admin") as never, null)).rejects.toThrow();
    state.orphans = { data: null, error: { message: "Could not find the function public.avatar_orphan_uploads" } };
    await expect(cleanupAvatarUploads(client("admin") as never, BASE)).rejects.toThrow(/avatar_orphan_uploads/);
  });
});

// ---------------------------------------------------------------- admin (ops-actions)
describe("admin: foto do herói", () => {
  const CREATOR = "c0000000-0000-4000-8000-000000000001";
  const values = (avatarUrl: string): CreatorFormValues => ({
    name: "Rafael Duarte",
    slug: "rafael-duarte",
    headline: "",
    bio: "Nova bio",
    pillars: ["training"],
    avatarUrl,
    coverUrl: "/placeholders/cover-training-1.svg",
    isFictional: true,
    rightsNote: "",
    sortOrder: 100,
    rightsStatus: "fictional",
    rightsHolder: "",
    rightsValidUntil: "",
    documentRef: "",
    privateNotes: "",
  });
  const creatorUpdates = () => state.writes.filter((w) => w.table === "creator_profiles" && w.op === "update");

  it("remover a foto do próprio usuário ligado: referências, objeto e envio", async () => {
    state.hero = { id: CREATOR, slug: "rafael-duarte", user_id: ids.USER, avatar_url: OLD_URL };
    expect(await adminRemoveCreatorPhoto({ id: CREATOR }, "foto imprópria")).toMatchObject({ ok: true });
    expect(state.log).toEqual([
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
      "admin:rpc:audit_log",
    ]);
  });

  it("herói apontando para a foto de outra pessoa: só a referência dele sai; o objeto e o perfil do dono ficam", async () => {
    const othersPhoto = url(ids.OTHER, `${ids.OLD}.webp`);
    state.hero = { id: CREATOR, slug: "rafael-duarte", user_id: ids.USER, avatar_url: othersPhoto };
    expect(await adminRemoveCreatorPhoto({ id: CREATOR }, "foto de terceiro")).toMatchObject({ ok: true });
    expect(state.log).toEqual(["admin:update:creator_profiles", "admin:rpc:audit_log"]);
    expect(creatorUpdates()[0].payload).toEqual({ avatar_url: null });
    expect(creatorUpdates()[0].filters).toEqual([
      ["eq", "id", CREATOR],
      ["eq", "avatar_url", othersPhoto],
    ]);
    // herói sem usuário (conta excluída): também só a referência; a limpeza diária apaga o objeto
    state.log = [];
    state.writes = [];
    state.hero = { id: CREATOR, slug: "rafael-duarte", user_id: null, avatar_url: OLD_URL };
    expect(await adminRemoveCreatorPhoto({ id: CREATOR }, "conta excluída")).toMatchObject({ ok: true });
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
  });

  it("editar o herói com a foto no formulário não regrava avatar_url (formulário velho não traz foto apagada de volta)", async () => {
    await updateCreator(CREATOR, values(OLD_URL));
    expect(creatorUpdates()).toHaveLength(1);
    expect(creatorUpdates()[0].payload).not.toHaveProperty("avatar_url");
    expect(creatorUpdates()[0].payload).toMatchObject({ bio: "Nova bio" });
    // trocar por ilustração continua gravando
    state.writes = [];
    await updateCreator(CREATOR, values("/placeholders/avatar-4.svg"));
    expect(creatorUpdates()[0].payload).toMatchObject({ avatar_url: "/placeholders/avatar-4.svg" });
    // URL de outro host nem passa na validação
    state.writes = [];
    expect(await updateCreator(CREATOR, values("https://attacker.example/p.gif"))).toMatchObject({ ok: false });
    expect(creatorUpdates()).toHaveLength(0);
  });

  it("criar herói só com ilustração: foto do bucket (alheia ou apagada) é recusada", async () => {
    expect(await createCreator(values(url(ids.OTHER, `${ids.OLD}.webp`)))).toEqual({ ok: false, error: "invalid_input" });
    expect(state.writes).toEqual([]);
  });
});
