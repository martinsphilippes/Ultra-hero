import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" lança fora de um React Server Component; aqui é só um marcador.
vi.mock("server-only", () => ({}));

import { isVideoUploadConfigured, resolveVideoSource } from "@/lib/video";
import {
  CloudflareStreamError,
  CloudflareStreamProvider,
  MAX_UPLOAD_BYTES,
  isStreamUid,
  sanitizeFileName,
  thumbnailPath,
  thumbnailUrl,
} from "@/lib/video/providers/cloudflare-stream";
import { InvalidMediaRefError, NotConfiguredError } from "@/lib/video/types";
import { GET as thumbnailRoute } from "@/app/media/stream/[uid]/thumbnail/route";

const UID = "ea95132c15732412d22c1476fa83f27a";
const ACCOUNT = "acc123";
const TOKEN = "tok-secret";
const CODE = "abc123xyz";
const CREATOR = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const MANAGED_ENV = [
  "VIDEO_PROVIDER",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_STREAM_API_TOKEN",
  "CLOUDFLARE_STREAM_CUSTOMER_CODE",
  "CLOUDFLARE_STREAM_SIGNING_KEY_ID",
  "CLOUDFLARE_STREAM_SIGNING_KEY_PEM",
] as const;

let savedEnv: Record<string, string | undefined> = {};

function configure() {
  process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT;
  process.env.CLOUDFLARE_STREAM_API_TOKEN = TOKEN;
  process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = CODE;
}

function mockFetch(response: Response | (() => Response | Promise<Response>)) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    return typeof response === "function" ? response() : response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function decodeMetadata(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(",").map((pair) => {
      const [key, value = ""] = pair.split(" ");
      return [key, Buffer.from(value, "base64").toString("utf8")];
    }),
  );
}

beforeEach(() => {
  savedEnv = {};
  for (const name of MANAGED_ENV) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const name of MANAGED_ENV) {
    const value = savedEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isStreamUid", () => {
  it("aceita 32 hexadecimais minúsculos", () => {
    expect(isStreamUid(UID)).toBe(true);
  });

  it.each(["", "uid-123", UID.slice(1), `${UID}0`, UID.toUpperCase(), `../${UID.slice(3)}`, `${UID.slice(0, 31)}g`, 42, null])(
    "recusa %s",
    (value) => {
      expect(isStreamUid(value)).toBe(false);
    },
  );
});

describe("thumbnailUrl / thumbnailPath", () => {
  it("monta a URL do Cloudflare com time em segundos e height", () => {
    expect(thumbnailUrl(UID, { time: 2.7, height: 270 }, CODE)).toBe(
      `https://customer-${CODE}.cloudflarestream.com/${UID}/thumbnails/thumbnail.jpg?time=2s&height=270`,
    );
  });

  it("sem opções não manda parâmetros e ignora valores inválidos", () => {
    const base = `https://customer-${CODE}.cloudflarestream.com/${UID}/thumbnails/thumbnail.jpg`;
    expect(thumbnailUrl(UID, {}, CODE)).toBe(base);
    expect(thumbnailUrl(UID, { time: -1, height: 0 }, CODE)).toBe(base);
  });

  it("lê o customer code do env; sem ele, NotConfiguredError", () => {
    expect(() => thumbnailUrl(UID)).toThrow(NotConfiguredError);
    configure();
    expect(thumbnailUrl(UID)).toContain(`customer-${CODE}.cloudflarestream.com`);
  });

  it("recusa uid inválido", () => {
    expect(() => thumbnailUrl("x/../y", {}, CODE)).toThrow(InvalidMediaRefError);
    expect(() => thumbnailPath("nope")).toThrow(InvalidMediaRefError);
  });

  it("thumbnailPath é caminho do próprio app", () => {
    expect(thumbnailPath(UID)).toBe(`/media/stream/${UID}/thumbnail`);
  });
});

describe("sanitizeFileName", () => {
  it("remove caminho, controles e vírgula; limita a 100", () => {
    expect(sanitizeFileName("C:\\fotos\\treino,1.mp4")).toBe("treino1.mp4");
    expect(sanitizeFileName("/a/b/vídeo\n.mov")).toBe("vídeo.mov");
    expect(sanitizeFileName("x".repeat(150))).toHaveLength(100);
    expect(sanitizeFileName(undefined)).toBe("video");
    expect(sanitizeFileName("  ")).toBe("video");
  });
});

describe("CloudflareStreamProvider.createUploadUrl", () => {
  const provider = new CloudflareStreamProvider();
  const opts = { creatorId: CREATOR, maxDurationSec: 180, premium: false, fileSize: 50_000_000, fileName: "meu treino.mp4" };

  it("sem env → NotConfiguredError listando as três variáveis, sem rede", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 201 }));
    const error = await provider.createUploadUrl(opts).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotConfiguredError);
    expect((error as NotConfiguredError).envVars).toEqual(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_STREAM_API_TOKEN", "CLOUDFLARE_STREAM_CUSTOMER_CODE"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, MAX_UPLOAD_BYTES + 1, Number.NaN])("recusa fileSize %s antes da rede", async (fileSize) => {
    configure();
    const fetchMock = mockFetch(new Response(null, { status: 201 }));
    await expect(provider.createUploadUrl({ ...opts, fileSize })).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("faz a criação tus com os headers certos e lê Location + stream-media-id", async () => {
    configure();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    const location = "https://upload.videodelivery.net/tus/abc?tusv2=true";
    const fetchMock = mockFetch(new Response(null, { status: 201, headers: { Location: location, "stream-media-id": UID } }));
    try {
      const ticket = await provider.createUploadUrl(opts);
      expect(ticket).toEqual({
        uploadUrl: location,
        mediaRef: { provider: "cloudflare-stream", id: UID, premium: false },
        expiresAt: "2026-10-21T12:30:00.000Z",
        protocol: "tus",
      });
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream?direct_user=true`);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Tus-Resumable"]).toBe("1.0.0");
    expect(headers["Upload-Length"]).toBe("50000000");
    expect(headers["Upload-Creator"]).toBe(CREATOR);
    expect(headers["Upload-Metadata"]).toBe(
      [
        `maxDurationSeconds ${Buffer.from("180").toString("base64")}`,
        `expiry ${Buffer.from("2026-10-21T12:30:00.000Z").toString("base64")}`,
        `name ${Buffer.from("meu treino.mp4").toString("base64")}`,
      ].join(","),
    );
    expect(decodeMetadata(headers["Upload-Metadata"])).toEqual({
      maxDurationSeconds: "180",
      expiry: "2026-10-21T12:30:00.000Z",
      name: "meu treino.mp4",
    });
    // Premium não liga requiresignedurls: a regra de acesso é do admin.
    expect(headers["Upload-Metadata"]).not.toContain("requiresignedurls");
  });

  it("erro HTTP do Cloudflare vira CloudflareStreamError com status e mensagem", async () => {
    configure();
    mockFetch(new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 }));
    const error = await provider.createUploadUrl(opts).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CloudflareStreamError);
    expect((error as CloudflareStreamError).status).toBe(403);
    expect((error as Error).message).toContain("Authentication error");
    expect((error as Error).message).toContain("10000");
  });

  it("corpo de erro não-JSON ainda dá erro legível", async () => {
    configure();
    mockFetch(new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    await expect(provider.createUploadUrl(opts)).rejects.toThrow(/502: Bad Gateway/);
  });

  it("falha de rede vira CloudflareStreamError status 0", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(provider.createUploadUrl(opts)).rejects.toMatchObject({ name: "CloudflareStreamError", status: 0 });
  });

  it("resposta sem Location ou sem stream-media-id válido é erro", async () => {
    configure();
    mockFetch(new Response(null, { status: 201, headers: { "stream-media-id": UID } }));
    await expect(provider.createUploadUrl(opts)).rejects.toThrow(/Location/);
    mockFetch(new Response(null, { status: 201, headers: { Location: "https://upload.videodelivery.net/tus/x", "stream-media-id": "bad" } }));
    await expect(provider.createUploadUrl(opts)).rejects.toThrow(/stream-media-id/);
  });

  it("nome ausente vira 'video'", async () => {
    configure();
    const fetchMock = mockFetch(new Response(null, { status: 201, headers: { Location: "https://upload.videodelivery.net/tus/x", "stream-media-id": UID } }));
    await provider.createUploadUrl({ ...opts, fileName: undefined });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(decodeMetadata(headers["Upload-Metadata"]).name).toBe("video");
  });
});

describe("CloudflareStreamProvider.getVideoStatus", () => {
  const provider = new CloudflareStreamProvider();

  function videoResponse(result: Record<string, unknown>) {
    return new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200, headers: { "content-type": "application/json" } });
  }

  it("valida o uid antes da rede", async () => {
    configure();
    const fetchMock = mockFetch(videoResponse({}));
    await expect(provider.getVideoStatus("../accounts")).rejects.toThrow(InvalidMediaRefError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem env → NotConfiguredError", async () => {
    await expect(provider.getVideoStatus(UID)).rejects.toThrow(NotConfiguredError);
  });

  it("faz GET autenticado no vídeo", async () => {
    configure();
    const fetchMock = mockFetch(videoResponse({ readyToStream: true, status: { state: "ready" }, duration: 42.5, creator: CREATOR }));
    await expect(provider.getVideoStatus(UID)).resolves.toEqual({ state: "ready", durationSec: 42.5, creatorId: CREATOR });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/${UID}`);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it.each([
    [{ readyToStream: false, status: { state: "pendingupload" }, duration: -1 }, { state: "pending", durationSec: null, creatorId: null }],
    [{ readyToStream: false, status: { state: "inprogress" }, duration: -1, creator: "" }, { state: "pending", durationSec: null, creatorId: null }],
    [{ readyToStream: false, status: { state: "ready" }, duration: 10 }, { state: "pending", durationSec: 10, creatorId: null }],
    [{ readyToStream: false, status: { state: "error" }, duration: -1, creator: CREATOR }, { state: "errored", durationSec: null, creatorId: CREATOR }],
    [{}, { state: "pending", durationSec: null, creatorId: null }],
  ])("mapeia %j", async (result, expected) => {
    configure();
    mockFetch(videoResponse(result));
    await expect(provider.getVideoStatus(UID)).resolves.toEqual(expected);
  });

  it("404 do Cloudflare vira CloudflareStreamError status 404", async () => {
    configure();
    mockFetch(new Response(JSON.stringify({ success: false, errors: [{ code: 10003, message: "Not Found" }] }), { status: 404 }));
    await expect(provider.getVideoStatus(UID)).rejects.toMatchObject({ name: "CloudflareStreamError", status: 404 });
  });
});

describe("CloudflareStreamProvider playback", () => {
  const provider = new CloudflareStreamProvider();
  const iframe = `https://customer-${CODE}.cloudflarestream.com/${UID}/iframe?poster=${encodeURIComponent(
    `https://customer-${CODE}.cloudflarestream.com/${UID}/thumbnails/thumbnail.jpg?height=720`,
  )}`;

  it("devolve iframe com poster codificado", async () => {
    configure();
    await expect(provider.getPlaybackSource({ provider: "cloudflare-stream", id: UID }, { signed: false })).resolves.toEqual({
      type: "iframe",
      url: iframe,
      title: "",
    });
  });

  it("getEmbed usa a mesma URL e 16/9", () => {
    configure();
    expect(provider.getEmbed({ provider: "cloudflare-stream", id: UID })).toEqual({ url: iframe, aspectRatio: "16/9" });
  });

  it("uid inválido → unavailable/invalid-ref", async () => {
    configure();
    await expect(provider.getPlaybackSource({ provider: "cloudflare-stream", id: "uid-123" }, { signed: false })).resolves.toEqual({
      type: "unavailable",
      reason: "invalid-ref",
    });
  });

  it("signed sem chaves de assinatura → NotConfiguredError com as variáveis de assinatura", async () => {
    configure();
    const error = await provider.getPlaybackSource({ provider: "cloudflare-stream", id: UID }, { signed: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotConfiguredError);
    expect((error as NotConfiguredError).envVars).toEqual(["CLOUDFLARE_STREAM_SIGNING_KEY_ID", "CLOUDFLARE_STREAM_SIGNING_KEY_PEM"]);
  });

  it("signed com chaves ainda é erro explícito (token não implementado)", async () => {
    configure();
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID = "k";
    process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM = "p";
    await expect(provider.getPlaybackSource({ provider: "cloudflare-stream", id: UID }, { signed: true })).rejects.toThrow(NotConfiguredError);
  });

  it("customer code com caractere estranho não vira outro host", async () => {
    configure();
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = "evil.com/x";
    await expect(provider.getPlaybackSource({ provider: "cloudflare-stream", id: UID }, { signed: false })).rejects.toThrow(NotConfiguredError);
  });

  it("resolveVideoSource entrega o iframe para conteúdo free do Stream", async () => {
    configure();
    await expect(
      resolveVideoSource({ mediaProvider: "cloudflare_stream", mediaRef: UID, body: {}, durationMinutes: 3, premium: false }),
    ).resolves.toEqual({ type: "iframe", url: iframe, title: "" });
  });
});

describe("isVideoUploadConfigured", () => {
  it("false sem provedor cloudflare ou sem as três variáveis", () => {
    expect(isVideoUploadConfigured()).toBe(false);
    configure();
    expect(isVideoUploadConfigured()).toBe(false); // provedor padrão é embed
    process.env.VIDEO_PROVIDER = "embed";
    expect(isVideoUploadConfigured("cloudflare_stream")).toBe(false); // env tem prioridade
    process.env.VIDEO_PROVIDER = "cloudflare_stream";
    delete process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
    expect(isVideoUploadConfigured()).toBe(false);
  });

  it("true com VIDEO_PROVIDER=cloudflare_stream e as três variáveis", () => {
    configure();
    process.env.VIDEO_PROVIDER = "cloudflare_stream";
    expect(isVideoUploadConfigured()).toBe(true);
  });

  it("aceita o setting quando não há env", () => {
    configure();
    expect(isVideoUploadConfigured("cloudflare-stream")).toBe(true);
  });
});

describe("GET /media/stream/[uid]/thumbnail", () => {
  function call(uid: string) {
    return thumbnailRoute(new Request(`http://localhost/media/stream/${uid}/thumbnail`), { params: Promise.resolve({ uid }) });
  }

  it("uid inválido → 404 sem rede", async () => {
    configure();
    const fetchMock = mockFetch(new Response("x"));
    const res = await call("nope");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem configuração → 404 sem rede", async () => {
    const fetchMock = mockFetch(new Response("x"));
    const res = await call(UID);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sucesso repassa os bytes como image/jpeg com cache de 1 dia", async () => {
    configure();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const fetchMock = mockFetch(new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }));
    const res = await call(UID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://customer-${CODE}.cloudflarestream.com/${UID}/thumbnails/thumbnail.jpg?height=720`);
  });

  it("vídeo inexistente no Cloudflare → 404", async () => {
    configure();
    mockFetch(new Response("not found", { status: 404 }));
    expect((await call(UID)).status).toBe(404);
  });

  it.each([
    ["5xx", () => new Response("err", { status: 500 })],
    ["corpo que não é imagem", () => new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } })],
  ])("Cloudflare com %s → 502", async (_label, make) => {
    configure();
    mockFetch(make);
    const res = await call(UID);
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("falha de rede → 502", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await call(UID)).status).toBe(502);
  });
});
