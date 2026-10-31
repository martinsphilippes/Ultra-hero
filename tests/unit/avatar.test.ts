import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeAvatar, uploadAvatar } from "@/app/(app)/profile/avatar-actions";
import { deleteAccount, updateProfile } from "@/app/(app)/profile/actions";
import { adminRemoveCreatorCover, adminRemoveCreatorPhoto, createCreator, updateCreator, type CreatorFormValues } from "@/app/admin/ops-actions";
import { updateCreatorProfile } from "@/app/creator/profile/actions";
import { removeHeroCover, uploadHeroCover } from "@/app/creator/profile/cover-actions";
import { creatorProfilePayload, parseCreatorProfile, type CreatorProfileInput } from "@/components/creator/profile-schema";
import { DELETE_CONFIRM_WORD } from "@/components/me/delete-account";
import { AVATAR_ERRORS, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, toAvatarError } from "@/lib/avatar/constants";
import { acceptsAvatarChoice, isLegacyAvatarArt, isLocalPath, isStoredAvatarUrl, publicAvatarUrl, safeAvatarSrc, storedAvatarOwner, storedAvatarPath } from "@/lib/avatar/paths";
import { aspectCrop, coverCrop } from "@/lib/avatar/resize";
import { AVATAR_CACHE_SECONDS, AVATAR_CLEANUP_LIMIT, cleanupAvatarUploads } from "@/lib/avatar/server";
import { sniffImage } from "@/lib/avatar/sniff";
import { validateSourceFile, validateUploadBytes } from "@/lib/avatar/validation";
import { COVER_ERRORS, COVER_MAX_UPLOAD_BYTES, toCoverError } from "@/lib/hero-cover/constants";
import { isStoredCoverUrl, publicCoverUrl, safeCoverSrc, storedCoverOwner } from "@/lib/hero-cover/paths";
import { COVER_CLEANUP_LIMIT, cleanupHeroCoverUploads } from "@/lib/hero-cover/server";
import { validateCoverBytes } from "@/lib/hero-cover/validation";
import enMe from "../../messages/en/me.json";
import esMe from "../../messages/es/me.json";
import ptMe from "../../messages/pt-BR/me.json";

// Foto de perfil (0031) e capa do herói (0042) sem Next, Supabase nem Storage de verdade: caminhos e
// URLs dos buckets, tipo pelos magic bytes, validações, a ordem das etapas das actions (reservar →
// gravar → aplicar → apagar a anterior), o que não pode acontecer (foto alheia, ilustração como valor
// novo, Storage sem service role) e a limpeza diária. As regras do banco (cota, kill switch, dono,
// herói ativo) são testadas de verdade no S33 e no S54 do RLS.

const BASE = "https://proj.supabase.co";
const ids = vi.hoisted(() => ({
  USER: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  OTHER: "b4cc290f-9c0a-4999-8a23-bdf5f7654113",
  NEW: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  OLD: "a3bb189e-8bf9-4888-9912-ace4e6543002",
}));
const url = (owner: string, file: string) => `${BASE}/storage/v1/object/public/avatars/${owner}/${file}`;
const coverUrl = (owner: string, file: string) => `${BASE}/storage/v1/object/public/hero-covers/${owner}/${file}`;
const NEW_PATH = `${ids.USER}/${ids.NEW}.webp`;
const OLD_URL = url(ids.USER, `${ids.OLD}.jpg`);

type Result = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  uploadRights: true,
  user: null as { id: string } | null,
  roles: ["consumer", "creator"] as string[],
  hasAdmin: true,
  profile: { avatar_url: null as string | null },
  hero: null as { id?: string; slug: string; status?: string; user_id?: string | null; avatar_url: string | null; cover_url?: string | null } | null,
  claim: { data: null, error: null } as Result,
  setPhoto: { data: [], error: null } as Result,
  orphans: { data: [], error: null } as Result,
  coverClaim: { data: null, error: null } as Result,
  coverSet: { data: null, error: null } as Result,
  coverClear: { data: null, error: null } as Result,
  coverOrphans: { data: [], error: null } as Result,
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
  // idioma e tema gravados por updateProfile (cookies + perfil)
  prefs: [] as string[],
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
      if (fn === "hero_cover_upload_claim") return state.coverClaim;
      if (fn === "hero_cover_set") {
        state.log.push(`  url=${String(args?.p_url)}`);
        return state.coverSet;
      }
      if (fn === "hero_cover_clear") return state.coverClear;
      if (fn === "hero_cover_orphan_uploads") {
        state.log.push(`  limit=${String(args?.p_limit)}`);
        return state.coverOrphans;
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
// Termos do Parceiro (0068): confirmação de direitos antes do envio; cada teste liga ou desliga
vi.mock("@/lib/partner-terms/server", () => ({ hasUploadRights: async () => state.uploadRights }));
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
vi.mock("@/i18n/actions", () => ({ setLocaleAction: async (v: string) => void state.prefs.push(`locale:${v}`) }));
vi.mock("@/lib/theme/actions", () => ({ setThemeAction: async (v: string) => void state.prefs.push(`theme:${v}`) }));
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
  state.uploadRights = true;
  state.roles = ["consumer", "creator"];
  state.hasAdmin = true;
  state.profile = { avatar_url: null };
  state.hero = null;
  state.claim = { data: NEW_PATH, error: null };
  state.setPhoto = { data: [], error: null };
  state.orphans = { data: [], error: null };
  state.coverClaim = { data: `${ids.USER}/${ids.NEW}.webp`, error: null };
  state.coverSet = { data: null, error: null };
  state.coverClear = { data: null, error: null };
  state.coverOrphans = { data: [], error: null };
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
  state.prefs = [];
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

  it("o navegador só carrega foto real (local ou do bucket deste projeto); ilustração antiga e o resto viram as iniciais", () => {
    const own = url(ids.USER, `${ids.NEW}.webp`);
    expect(AVATAR_CACHE_SECONDS).toBe(3600);
    expect(safeAvatarSrc(own, BASE)).toBe(own);
    // foto oficial dos heróis demo (foto real) continua
    expect(safeAvatarSrc("/heroes/ronaldinho-gaucho-avatar.webp", BASE)).toBe("/heroes/ronaldinho-gaucho-avatar.webp");
    // ilustração antiga salva no banco = sem foto
    for (const legacy of ["/placeholders/avatar-1.svg", "/placeholders/avatar-8.svg"]) {
      expect(isLegacyAvatarArt(legacy)).toBe(true);
      expect(safeAvatarSrc(legacy, BASE)).toBeNull();
    }
    // logo de vendedor (outra arte local) não é avatar de pessoa: continua
    expect(safeAvatarSrc("/placeholders/product-1.svg", BASE)).toBe("/placeholders/product-1.svg");
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
      expect(safeAvatarSrc(hostile, BASE)).toBeNull();
    }
    // sem a base configurada só o caminho local passa
    expect(safeAvatarSrc(own, null)).toBeNull();
    expect(isLocalPath("/placeholders/avatar-1.svg")).toBe(true);
    expect(isLocalPath("//x.example/a.png")).toBe(false);
  });

  it("escolha de avatar num formulário: nenhum ou a foto atual e própria; ilustração nunca mais", () => {
    const own = url(ids.USER, `${ids.NEW}.webp`);
    expect(acceptsAvatarChoice(null, own, ids.USER, BASE)).toBe(true);
    expect(acceptsAvatarChoice(own, own, ids.USER, BASE)).toBe(true);
    expect(acceptsAvatarChoice("/placeholders/avatar-2.svg", null, ids.USER, BASE)).toBe(false);
    expect(acceptsAvatarChoice("/placeholders/avatar-2.svg", "/placeholders/avatar-2.svg", ids.USER, BASE)).toBe(false);
    expect(acceptsAvatarChoice("/heroes/ronaldinho-gaucho-avatar.webp", null, ids.USER, BASE)).toBe(false);
    expect(acceptsAvatarChoice(own, null, ids.USER, BASE)).toBe(false);
    expect(acceptsAvatarChoice(url(ids.OTHER, `${ids.OLD}.jpg`), url(ids.OTHER, `${ids.OLD}.jpg`), ids.USER, BASE)).toBe(false);
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

  it("recorte central quadrado (foto) e 16:9 (capa) e códigos de erro conhecidos", () => {
    expect(coverCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(coverCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(aspectCrop(4000, 3000, 16 / 9)).toEqual({ sx: 0, sy: 375, sw: 4000, sh: 2250 });
    expect(aspectCrop(1080, 1920, 16 / 9)).toEqual({ sx: 0, sy: 656, sw: 1080, sh: 608 });
    expect(aspectCrop(3000, 1000, 16 / 9)).toEqual({ sx: 611, sy: 0, sw: 1778, sh: 1000 });
    expect(aspectCrop(640, 480, 1)).toEqual({ sx: 80, sy: 0, sw: 480, sh: 480 });
    expect(toAvatarError("too_many_uploads")).toBe("too_many_uploads");
    expect(toAvatarError("invalid_path")).toBe("generic");
    expect(AVATAR_ERRORS).toContain("decode_failed");
  });
});

// ---------------------------------------------------------------- envio
describe("uploadAvatar", () => {
  it("reserva, grava com o service role, aplica e só então apaga a foto anterior da própria pessoa", async () => {
    state.hero = { slug: "erick-jacquin", avatar_url: OLD_URL };
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
    expect(state.revalidated).toEqual(expect.arrayContaining(["/", "/profile", "/creator", "/personalities/erick-jacquin"]));
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
  it("com ilustração antiga salva não toca o Storage", async () => {
    state.profile = { avatar_url: "/placeholders/avatar-3.svg" };
    expect(await removeAvatar()).toEqual({ ok: true, avatarUrl: "/placeholders/avatar-3.svg" });
    expect(state.log).toEqual([]);
  });

  it("com foto própria limpa as referências, apaga o objeto e marca o envio", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.hero = { slug: "erick-jacquin", avatar_url: OLD_URL };
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

  it("ilustração não é mais aceita como valor novo (nem a que já estava salva)", async () => {
    state.profile = { avatar_url: "/placeholders/avatar-4.svg" };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-4.svg" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-1.svg" })).toEqual({ ok: false, error: "invalid_input" });
    expect(state.writes).toEqual([]);
  });

  it("tirar a foto (avatar nulo) a tira do ar (perfil de herói incluso)", async () => {
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
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
    state.hero = { slug: "erick-jacquin", avatar_url: OLD_URL };
    expect(await updateProfile(base)).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
    expect(state.writes[0].payload).toEqual({ display_name: "Ana" });
    expect(state.writes[0].payload).not.toHaveProperty("avatar_url");
  });

  it("mandar o avatar continua gravando (só nulo ou a foto atual) e tirar a foto continua liberando a foto", async () => {
    state.profile = { avatar_url: "/placeholders/avatar-1.svg" };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.writes[0].payload).toEqual({ display_name: "Ana", avatar_url: null });
    state.log = [];
    state.writes = [];
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.log).toContain(`admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`);
  });

  it("validações seguem: nada de ilustração, foto só a atual e da própria pessoa", async () => {
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/avatar-2.svg" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: "/placeholders/cover-training-1.svg" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: "/heroes/ronaldinho-gaucho-avatar.webp" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: url(ids.OTHER, `${ids.OLD}.jpg`) })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, avatarUrl: url(ids.USER, `${ids.NEW}.webp`) })).toEqual({ ok: false, error: "invalid_input" });
    expect(await updateProfile({ ...base, displayName: " " })).toEqual({ ok: false, error: "invalid_input" });
    expect(state.writes).toEqual([]);
  });
});

// Herói ativo: um avatar só. A tela Dados dele nunca envia o avatar; se um chegar (POST direto, aba
// antiga), vale também no perfil público, para os dois nunca ficarem diferentes.
describe("updateProfile com herói ativo (um avatar só)", () => {
  const base = { displayName: "Érick", locale: "pt-BR", theme: "dark" };
  const HERO_ID = "c0000000-0000-4000-8000-000000000002";
  beforeEach(() => {
    state.hero = { id: HERO_ID, slug: "erick-jacquin", status: "active", avatar_url: "/placeholders/avatar-1.svg" };
    state.profile = { avatar_url: "/placeholders/avatar-1.svg" };
  });

  it("avatar que chega aqui vale também no perfil público (app primeiro, depois a página pública)", async () => {
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles", "user:update:creator_profiles"]);
    expect(state.writes[1].payload).toEqual({ avatar_url: null });
    expect(state.writes[1].filters).toEqual([["eq", "id", HERO_ID]]);
  });

  it("sem o avatar (o que a tela Dados do herói envia) nenhum dos dois é tocado", async () => {
    expect(await updateProfile(base)).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
    expect(state.writes[0].payload).toEqual({ display_name: "Érick" });
  });

  it("perfil inativo ou sem o papel: só o app muda (como antes)", async () => {
    state.hero = { ...state.hero!, status: "suspended" };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
    state.log = [];
    state.hero = { ...state.hero!, status: "active" };
    state.roles = ["consumer"];
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:profiles"]);
  });

  it("falha no perfil público: o avatar do app volta ao anterior e a tela é avisada", async () => {
    state.updateFailures = { "user:creator_profiles": [1] };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: false, error: "avatar_not_saved" });
    expect(state.log).toEqual(["user:update:profiles", "user:update:creator_profiles", "user:update:profiles"]);
    expect(state.writes[2].payload).toEqual({ avatar_url: "/placeholders/avatar-1.svg" });
    // só o nome foi salvo: idioma e tema não mudam, e o aviso diz exatamente isso nos 3 idiomas
    expect(state.prefs).toEqual([]);
    expect(state.writes[0].payload).toMatchObject({ display_name: "Érick" });
    expect(ptMe.profile.data.errors.avatar_not_saved).toBe("Seu nome foi salvo, mas o avatar, o idioma e o tema não mudaram. Tente de novo.");
    expect(enMe.profile.data.errors.avatar_not_saved).toBe("Your name was saved, but your avatar, language and theme did not change. Please try again.");
    expect(esMe.profile.data.errors.avatar_not_saved).toBe("Tu nombre se guardó, pero el avatar, el idioma y el tema no cambiaron. Inténtalo de nuevo.");
  });

  it("sucesso grava idioma e tema depois do avatar", async () => {
    expect(await updateProfile({ ...base, locale: "en", theme: "light", avatarUrl: null })).toEqual({ ok: true });
    expect(state.prefs).toEqual(["locale:en", "theme:light"]);
  });

  it("tirar a foto (nos dois lados): grava os dois e libera a foto uma vez", async () => {
    state.hero = { ...state.hero!, avatar_url: OLD_URL };
    state.profile = { avatar_url: OLD_URL };
    expect(await updateProfile({ ...base, avatarUrl: null })).toEqual({ ok: true });
    expect(state.log.filter((l) => l.startsWith("admin:storage:remove"))).toEqual([`admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`]);
    expect(state.log.slice(0, 2)).toEqual(["user:update:profiles", "user:update:creator_profiles"]);
  });
});

describe("updateCreatorProfile (perfil do herói no /profile)", () => {
  const values = (avatar?: string): CreatorProfileInput => ({
    headline: "Treino curto",
    bio: "Bio nova",
    ...(avatar === undefined ? {} : { avatar_url: avatar }),
    socials: { instagram: "@erick", youtube: "", site: "" },
  });
  const heroUpdates = () => state.writes.filter((w) => w.client === "user" && w.table === "creator_profiles" && w.op === "update");
  const appUpdates = () => state.writes.filter((w) => w.client === "user" && w.table === "profiles" && w.op === "update");

  beforeEach(() => {
    state.hero = { id: "c0000000-0000-4000-8000-000000000002", slug: "erick-jacquin", status: "active", avatar_url: OLD_URL };
    state.profile = { avatar_url: OLD_URL };
  });

  it("cenário A: foto enviada em Dados e o formulário do herói salvo sem mexer no avatar — a foto fica nos dois lados", async () => {
    expect(await updateCreatorProfile(values())).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:creator_profiles"]);
    expect(heroUpdates()[0].payload).not.toHaveProperty("avatar_url");
    // nenhum dos dois avatares é tocado
    expect(appUpdates()).toEqual([]);
    expect(heroUpdates()[0].payload).toMatchObject({ headline: "Treino curto", bio: "Bio nova" });
    // a capa só muda pelo envio próprio (0042): salvar o formulário nunca a regrava
    expect(heroUpdates()[0].payload).not.toHaveProperty("cover_url");
    expect(state.revalidated).toEqual(expect.arrayContaining(["/profile", "/creator", "/personalities/erick-jacquin"]));
    expect(state.revalidated).not.toContain("/creator/profile");
  });

  it("capa que chegue no formulário (aba antiga, POST direto) é descartada: nem desenho nem URL solta é gravada", async () => {
    for (const cover of ["/placeholders/cover-training-1.svg", "https://attacker.example/c.png", ""]) {
      expect(await updateCreatorProfile({ ...values(), cover_url: cover } as CreatorProfileInput)).toEqual({ ok: true });
    }
    expect(heroUpdates()).toHaveLength(3);
    for (const w of heroUpdates()) expect(w.payload).not.toHaveProperty("cover_url");
  });

  it("um avatar só: tirar a foto vale no perfil público e no app, e a foto antiga sai do ar uma vez só", async () => {
    expect(await updateCreatorProfile(values(""))).toEqual({ ok: true });
    expect(heroUpdates()[0].payload).toMatchObject({ avatar_url: null });
    expect(appUpdates()).toHaveLength(1);
    expect(appUpdates()[0].payload).toEqual({ avatar_url: null });
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

  it("ilustração antiga nos dois lados e o avatar tirado: grava os dois sem foto e não toca o Storage", async () => {
    state.hero = { ...state.hero!, avatar_url: "/placeholders/avatar-1.svg" };
    state.profile = { avatar_url: "/placeholders/avatar-1.svg" };
    expect(await updateCreatorProfile(values(""))).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:creator_profiles", "user:update:profiles"]);
    expect(heroUpdates()[0].payload).toMatchObject({ avatar_url: null });
    expect(appUpdates()[0].payload).toEqual({ avatar_url: null });
    expect(state.revalidated).toEqual(expect.arrayContaining(["/", "/profile", "/personalities/erick-jacquin"]));
  });

  it("app com outra foto própria (dados antigos): tirar a foto apaga as duas e os dois lados ficam sem foto", async () => {
    const appPhoto = url(ids.USER, `${ids.NEW}.webp`);
    state.profile = { avatar_url: appPhoto };
    expect(await updateCreatorProfile(values(""))).toEqual({ ok: true });
    expect(appUpdates()[0].payload).toEqual({ avatar_url: null });
    expect(state.log.filter((l) => l.startsWith("admin:storage:remove"))).toEqual([`admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`, `admin:storage:remove:avatars/${NEW_PATH}`]);
  });

  it("manter a foto atual (mexeu e voltou) regrava o mesmo valor nos dois lados e não apaga nada", async () => {
    expect(await updateCreatorProfile(values(OLD_URL))).toEqual({ ok: true });
    expect(state.log).toEqual(["user:update:creator_profiles", "user:update:profiles"]);
    expect(heroUpdates()[0].payload).toMatchObject({ avatar_url: OLD_URL });
    expect(appUpdates()[0].payload).toEqual({ avatar_url: OLD_URL });
  });

  it("ilustração (qualquer uma), capa desenhada, foto oficial ou caminho solto são recusados sem gravar nada", async () => {
    for (const bad of ["/placeholders/avatar-1.svg", "/placeholders/avatar-4.svg", "/placeholders/cover-training-1.svg", "/heroes/ronaldinho-gaucho-avatar.webp", "/placeholders/avatar-9.svg", "/qualquer.png"]) {
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
    expect(await updateCreatorProfile(values(""))).toEqual({ ok: false, error: "avatar_not_saved" });
    expect(heroUpdates().map((w) => (w.payload as { avatar_url?: string | null }).avatar_url)).toEqual([null, OLD_URL]);
    expect(heroUpdates()[1].payload).toEqual({ avatar_url: OLD_URL });
    // nada é apagado: a foto segue nos dois lados
    expect(state.log.some((l) => l.startsWith("admin:"))).toBe(false);
  });

  it("falha ao gravar no app e ao desfazer: continua avisando (nunca diz que salvou) e não apaga a foto", async () => {
    state.updateFailures = { "user:profiles": [1], "user:creator_profiles": [2] };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await updateCreatorProfile(values(""))).toEqual({ ok: false, error: "avatar_not_saved" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(state.log.some((l) => l.startsWith("admin:"))).toBe(false);
  });

  it("falha no perfil público (a primeira gravação): o app não é tocado", async () => {
    state.updateFailures = { "user:creator_profiles": [1] };
    expect(await updateCreatorProfile(values(""))).toMatchObject({ ok: false });
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

  it("formulário: nunca envia avatar nem capa (foto e capa têm envio próprio)", () => {
    const form = { ...values(), avatar_url: "/placeholders/avatar-1.svg", cover_url: "/placeholders/cover-training-1.svg" };
    expect(creatorProfilePayload(form)).toEqual({ headline: "Treino curto", bio: "Bio nova", socials: { instagram: "@erick", youtube: "", site: "" } });
  });

  it("esquema: avatar ausente = inalterado; presente só vazio ou foto do bucket; capa nem entra", () => {
    const untouched = parseCreatorProfile(values());
    expect(untouched.ok).toBe(true);
    expect(untouched.ok && "avatar_url" in untouched.data).toBe(false);
    expect(parseCreatorProfile(values(""))).toMatchObject({ ok: true, data: { avatar_url: "" } });
    expect(parseCreatorProfile(values("//evil.example/a.png"))).toEqual({ ok: false, errors: { avatar_url: "invalidCover" } });
    expect(parseCreatorProfile(values("/placeholders/avatar-1.svg"))).toEqual({ ok: false, errors: { avatar_url: "invalidCover" } });
    const withCover = parseCreatorProfile({ ...values(), cover_url: "https://evil.example/c.png" });
    expect(withCover.ok && "cover_url" in withCover.data).toBe(false);
    expect(parseCreatorProfile({ ...values(), headline: "x".repeat(121) })).toEqual({ ok: false, errors: { headline: "tooLong" } });
  });
});

describe("deleteAccount com foto", () => {
  it("a foto sai do Storage e do perfil público só depois da exclusão confirmada", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.hero = { slug: "erick-jacquin", avatar_url: OLD_URL };
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
  const values = (): CreatorFormValues => ({
    name: "Ronaldinho Gaúcho",
    slug: "ronaldinho-gaucho",
    headline: "",
    bio: "Nova bio",
    pillars: ["training"],
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
    state.hero = { id: CREATOR, slug: "ronaldinho-gaucho", user_id: ids.USER, avatar_url: OLD_URL };
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
    state.hero = { id: CREATOR, slug: "ronaldinho-gaucho", user_id: ids.USER, avatar_url: othersPhoto };
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
    state.hero = { id: CREATOR, slug: "ronaldinho-gaucho", user_id: null, avatar_url: OLD_URL };
    expect(await adminRemoveCreatorPhoto({ id: CREATOR }, "conta excluída")).toMatchObject({ ok: true });
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
  });

  it("editar o herói nunca regrava foto nem capa (são do próprio herói; nada de ilustração)", async () => {
    await updateCreator(CREATOR, { ...values(), avatarUrl: "/placeholders/avatar-4.svg", coverUrl: "/placeholders/cover-training-1.svg" } as CreatorFormValues);
    expect(creatorUpdates()).toHaveLength(1);
    expect(creatorUpdates()[0].payload).not.toHaveProperty("avatar_url");
    expect(creatorUpdates()[0].payload).not.toHaveProperty("cover_url");
    expect(creatorUpdates()[0].payload).toMatchObject({ bio: "Nova bio" });
  });

  it("criar herói: nasce sem foto e sem capa (nada de ilustração)", async () => {
    await createCreator({ ...values(), avatarUrl: "/placeholders/avatar-1.svg", coverUrl: "/placeholders/cover-routine-1.svg" } as CreatorFormValues);
    const insert = state.writes.find((w) => w.table === "creator_profiles" && w.op === "insert");
    expect(insert?.payload).toMatchObject({ name: "Ronaldinho Gaúcho" });
    expect(insert?.payload).not.toHaveProperty("avatar_url");
    expect(insert?.payload).not.toHaveProperty("cover_url");
  });

  it("remover a capa enviada pelo próprio usuário ligado: referência, objeto, envio e auditoria", async () => {
    const cover = coverUrl(ids.USER, `${ids.OLD}.webp`);
    state.hero = { id: CREATOR, slug: "ronaldinho-gaucho", user_id: ids.USER, avatar_url: null, cover_url: cover };
    expect(await adminRemoveCreatorCover({ id: CREATOR }, "capa imprópria")).toMatchObject({ ok: true });
    expect(state.log).toEqual([
      "admin:update:creator_profiles",
      `admin:storage:remove:hero-covers/${ids.USER}/${ids.OLD}.webp`,
      "admin:update:hero_cover_uploads",
      "admin:rpc:audit_log",
    ]);
    expect(creatorUpdates()[0].payload).toEqual({ cover_url: null });
  });

  it("capa de outra pessoa ou capa que não é foto enviada: só a referência sai (ou nada)", async () => {
    const others = coverUrl(ids.OTHER, `${ids.OLD}.webp`);
    state.hero = { id: CREATOR, slug: "ronaldinho-gaucho", user_id: ids.USER, avatar_url: null, cover_url: others };
    expect(await adminRemoveCreatorCover({ id: CREATOR }, "capa de terceiro")).toMatchObject({ ok: true });
    expect(state.log).toEqual(["admin:update:creator_profiles", "admin:rpc:audit_log"]);
    state.log = [];
    state.hero = { id: CREATOR, slug: "ronaldinho-gaucho", user_id: ids.USER, avatar_url: null, cover_url: "/heroes/ronaldinho-gaucho-cover.webp" };
    expect(await adminRemoveCreatorCover({ id: CREATOR }, "capa oficial")).toMatchObject({ ok: false });
    expect(state.log).toEqual([]);
  });
});

// ---------------------------------------------------------------- capa do herói (0042)
describe("capa do herói: caminhos e exibição", () => {
  it("monta e lê de volta a URL do bucket hero-covers; o bucket de avatar não serve de capa", () => {
    const u = publicCoverUrl(`${BASE}/`, NEW_PATH);
    expect(u).toBe(coverUrl(ids.USER, `${ids.NEW}.webp`));
    expect(isStoredCoverUrl(u, BASE)).toBe(true);
    expect(storedCoverOwner(u, BASE)).toBe(ids.USER);
    expect(isStoredCoverUrl(url(ids.USER, `${ids.NEW}.webp`), BASE)).toBe(false);
    expect(isStoredAvatarUrl(u, BASE)).toBe(false);
  });

  it("só foto real aparece: capa desenhada antiga, vazio e URL de outro host viram superfície lisa (null)", () => {
    const own = coverUrl(ids.USER, `${ids.NEW}.webp`);
    expect(safeCoverSrc(own, BASE)).toBe(own);
    expect(safeCoverSrc("/heroes/anitta-cover.webp", BASE)).toBe("/heroes/anitta-cover.webp");
    for (const none of [
      "/placeholders/cover-routine-1.svg",
      "/placeholders/cover-gastronomy-3.svg",
      "https://attacker.example/c.png",
      `//attacker.example/storage/v1/object/public/hero-covers/${NEW_PATH}`,
      url(ids.USER, `${ids.NEW}.webp`).replace(BASE, "https://evil.example"),
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeCoverSrc(none, BASE)).toBeNull();
    }
  });

  it("bytes da capa: WebP/JPEG 16:9 de 640 a 1600 px e até 3 MiB", () => {
    expect(validateCoverBytes(webpVp8(1600, 900))).toEqual({ ok: true, image: { mime: "image/webp", width: 1600, height: 900 } });
    expect(validateCoverBytes(jpeg(1280, 720))).toMatchObject({ ok: true });
    // arredondamento de 1 px aceito; quadrado, retrato, grande ou pequeno demais não
    expect(validateCoverBytes(webpVp8x(1000, 563))).toMatchObject({ ok: true });
    for (const [w, h] of [[512, 512], [900, 1600], [1920, 1080], [320, 180], [1600, 1000]]) {
      expect(validateCoverBytes(webpVp8x(w, h))).toEqual({ ok: false, error: "invalid_dimensions" });
    }
    expect(validateCoverBytes(png)).toEqual({ ok: false, error: "not_image" });
    expect(validateCoverBytes(new Uint8Array())).toEqual({ ok: false, error: "empty_file" });
    expect(validateCoverBytes(new Uint8Array(COVER_MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, error: "file_too_large" });
    expect(toCoverError("not_a_hero")).toBe("not_a_hero");
    expect(toCoverError("invalid_path")).toBe("generic");
    expect(COVER_ERRORS).toContain("cover_not_configured");
  });
});

describe("uploadHeroCover / removeHeroCover", () => {
  const NEW_COVER = coverUrl(ids.USER, `${ids.NEW}.webp`);
  const OLD_COVER = coverUrl(ids.USER, `${ids.OLD}.jpg`);
  beforeEach(() => {
    state.hero = { id: "c0000000-0000-4000-8000-000000000002", slug: "erick-jacquin", status: "active", avatar_url: null, cover_url: OLD_COVER };
  });

  it("sem a confirmação de direitos (Termos do Parceiro), nada é reservado nem gravado; o admin não passa pela trava", async () => {
    state.uploadRights = false;
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "upload_rights_required" });
    expect(state.log).toEqual([]);
    state.roles = ["admin"];
    expect((await uploadHeroCover(form(webpVp8(1600, 900)))).ok).toBe(true);
  });

  it("reserva, grava com o service role, aplica no herói e só então apaga a capa anterior própria", async () => {
    state.coverSet = { data: OLD_COVER, error: null };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: true, coverUrl: NEW_COVER });
    expect(state.log).toEqual([
      "user:rpc:hero_cover_upload_claim",
      `admin:storage:upload:hero-covers/${NEW_PATH}:image/webp:upsert=false:cache=3600`,
      "user:rpc:hero_cover_set",
      `  url=${NEW_COVER}`,
      // anterior própria: referência antes do objeto
      "admin:update:creator_profiles",
      `admin:storage:remove:hero-covers/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:hero_cover_uploads",
    ]);
    expect(state.revalidated).toEqual(expect.arrayContaining(["/profile", "/creator", "/personalities", "/personalities/erick-jacquin"]));
    // nada do avatar é tocado
    expect(state.log.some((l) => l.includes("avatar"))).toBe(false);
  });

  it("capa anterior oficial, desenhada ou de outra pessoa não é apagada do Storage", async () => {
    for (const previous of ["/heroes/erick-jacquin-cover.webp", "/placeholders/cover-gastronomy-1.svg", coverUrl(ids.OTHER, `${ids.OLD}.webp`), null]) {
      state.log = [];
      state.coverSet = { data: previous, error: null };
      expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toMatchObject({ ok: true });
      expect(state.log.filter((l) => l.includes("storage:remove"))).toEqual([]);
    }
  });

  it("tipo e proporção vêm dos bytes: avatar quadrado ou PNG disfarçado não chegam ao banco", async () => {
    expect(await uploadHeroCover(form(webpVp8(512, 512)))).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(await uploadHeroCover(form(png, "image/webp"))).toEqual({ ok: false, error: "not_image" });
    expect(await uploadHeroCover(new FormData())).toEqual({ ok: false, error: "not_image" });
    expect(state.log).toEqual([]);
  });

  it("sem sessão, sem papel de herói ou sem service role não reserva nada", async () => {
    state.hasAdmin = false;
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "cover_not_configured" });
    expect(await removeHeroCover()).toEqual({ ok: false, error: "cover_not_configured" });
    state.hasAdmin = true;
    state.roles = ["consumer"];
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "not_a_hero" });
    expect(await removeHeroCover()).toEqual({ ok: false, error: "not_a_hero" });
    state.user = null;
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "unauthenticated" });
    expect(state.log).toEqual([]);
  });

  it("herói inativo, cota e kill switch do banco chegam como código; banco sem a 0042 vira não configurado", async () => {
    state.coverClaim = { data: null, error: { message: "not_a_hero" } };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "not_a_hero" });
    state.coverClaim = { data: null, error: { message: "too_many_uploads" } };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "too_many_uploads" });
    state.coverClaim = { data: null, error: { message: "uploads_disabled" } };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "uploads_disabled" });
    state.coverClaim = { data: null, error: { code: "PGRST202", message: "Could not find the function public.hero_cover_upload_claim" } };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "cover_not_configured" });
    state.coverClear = { data: null, error: { code: "PGRST202", message: "Could not find the function public.hero_cover_clear" } };
    expect(await removeHeroCover()).toEqual({ ok: false, error: "cover_not_configured" });
    expect(state.log.filter((l) => l.includes("storage"))).toEqual([]);
  });

  it("caminho reservado de outra pessoa é recusado antes do Storage; falha ao aplicar tira a capa nova do bucket", async () => {
    state.coverClaim = { data: `${ids.OTHER}/${ids.NEW}.webp`, error: null };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "generic" });
    expect(state.log).toEqual(["user:rpc:hero_cover_upload_claim"]);
    state.log = [];
    state.coverClaim = { data: NEW_PATH, error: null };
    state.coverSet = { data: null, error: { message: "invalid_path" } };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "generic" });
    expect(state.log.slice(-2)).toEqual([`admin:storage:remove:hero-covers/${NEW_PATH}`, "admin:update:hero_cover_uploads"]);
  });

  it("falha no Storage não aplica nem marca o envio (a limpeza diária apaga)", async () => {
    state.uploadError = { message: "network" };
    expect(await uploadHeroCover(form(webpVp8(1600, 900)))).toEqual({ ok: false, error: "upload_failed" });
    expect(state.log).not.toContain("user:rpc:hero_cover_set");
    expect(state.log).not.toContain("admin:update:hero_cover_uploads");
  });

  it("remover: a RPC tira a capa do herói; foto própria sai do bucket, a oficial e a desenhada só perdem a referência", async () => {
    state.coverClear = { data: OLD_COVER, error: null };
    expect(await removeHeroCover()).toEqual({ ok: true, coverUrl: null });
    expect(state.log).toEqual([
      "user:rpc:hero_cover_clear",
      "admin:update:creator_profiles",
      `admin:storage:remove:hero-covers/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:hero_cover_uploads",
    ]);
    for (const previous of ["/heroes/erick-jacquin-cover.webp", "/placeholders/cover-routine-1.svg", coverUrl(ids.OTHER, `${ids.OLD}.webp`), null]) {
      state.log = [];
      state.coverClear = { data: previous, error: null };
      expect(await removeHeroCover()).toEqual({ ok: true, coverUrl: null });
      expect(state.log).toEqual(["user:rpc:hero_cover_clear"]);
    }
  });
});

describe("deleteAccount com capa de herói", () => {
  it("a capa própria sai do Storage junto com a foto, só depois da exclusão confirmada", async () => {
    state.profile = { avatar_url: OLD_URL };
    state.hero = { slug: "erick-jacquin", avatar_url: OLD_URL, cover_url: coverUrl(ids.USER, `${ids.NEW}.webp`) };
    expect(await deleteAccount({ confirmation: DELETE_CONFIRM_WORD })).toEqual({ ok: true });
    expect(state.log).toEqual([
      "user:rpc:delete_my_account",
      "admin:update:profiles",
      "admin:update:creator_profiles",
      `admin:storage:remove:avatars/${ids.USER}/${ids.OLD}.jpg`,
      "admin:update:avatar_uploads",
      "admin:update:creator_profiles",
      `admin:storage:remove:hero-covers/${NEW_PATH}`,
      "admin:update:hero_cover_uploads",
    ]);
  });

  it("capa oficial ou de outra pessoa não é apagada; exclusão recusada não apaga nada", async () => {
    state.hero = { slug: "erick-jacquin", avatar_url: null, cover_url: "/heroes/erick-jacquin-cover.webp" };
    expect(await deleteAccount({ confirmation: DELETE_CONFIRM_WORD })).toEqual({ ok: true });
    expect(state.log).toEqual(["user:rpc:delete_my_account"]);
    state.log = [];
    state.hero = { slug: "erick-jacquin", avatar_url: null, cover_url: coverUrl(ids.USER, `${ids.NEW}.webp`) };
    state.deleteAccountError = { message: "retention_exception_active" };
    expect(await deleteAccount({ confirmation: DELETE_CONFIRM_WORD })).toMatchObject({ ok: false });
    expect(state.log).toEqual(["user:rpc:delete_my_account"]);
  });
});

describe("cleanupHeroCoverUploads", () => {
  const orphanA = `${ids.USER}/${ids.NEW}.webp`;
  const orphanB = `${ids.OTHER}/${ids.OLD}.jpg`;

  it("limpa a referência no herói, apaga em lote, marca e remove registros antigos já apagados", async () => {
    state.coverOrphans = { data: [orphanA, orphanB], error: null };
    state.purged = 2;
    const result = await cleanupHeroCoverUploads(client("admin") as never, BASE, new Date("2026-10-29T03:00:00Z"));
    expect(result).toEqual({ covers_deleted: 2, covers_errors: 0, covers_rows_purged: 2 });
    expect(state.log).toEqual([
      "admin:rpc:hero_cover_orphan_uploads",
      `  limit=${COVER_CLEANUP_LIMIT}`,
      "admin:update:creator_profiles",
      `admin:storage:remove:hero-covers/${orphanA},${orphanB}`,
      "admin:update:hero_cover_uploads",
      "admin:delete:hero_cover_uploads",
    ]);
    expect(state.writes[0].filters).toEqual([["in", "cover_url", [coverUrl(ids.USER, `${ids.NEW}.webp`), coverUrl(ids.OTHER, `${ids.OLD}.jpg`)]]]);
    expect(state.writes.at(-1)?.filters).toEqual([
      ["not", "deleted_at", ["is", null]],
      ["lt", "created_at", "2026-10-27T03:00:00.000Z"],
    ]);
  });

  it("falha no Storage ou na referência não marca (tenta de novo amanhã); sem a 0042 lança", async () => {
    state.coverOrphans = { data: [orphanA], error: null };
    state.removeError = { message: "503" };
    expect(await cleanupHeroCoverUploads(client("admin") as never, BASE)).toMatchObject({ covers_deleted: 0, covers_errors: 1 });
    expect(state.log).not.toContain("admin:update:hero_cover_uploads");
    state.removeError = null;
    state.updateError = { message: "boom" };
    state.log = [];
    expect(await cleanupHeroCoverUploads(client("admin") as never, BASE)).toMatchObject({ covers_deleted: 0, covers_errors: 1 });
    expect(state.log.some((l) => l.includes("storage"))).toBe(false);
    state.updateError = null;
    await expect(cleanupHeroCoverUploads(client("admin") as never, null)).rejects.toThrow();
    state.coverOrphans = { data: null, error: { message: "Could not find the function public.hero_cover_orphan_uploads" } };
    await expect(cleanupHeroCoverUploads(client("admin") as never, BASE)).rejects.toThrow(/hero_cover_orphan_uploads/);
  });
});
