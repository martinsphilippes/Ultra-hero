import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" lança ao ser importado fora de um React Server Component; aqui é só um marcador.
vi.mock("server-only", () => ({}));

import {
  getVideoProvider,
  mediaRefFromBody,
  normalizeProviderKind,
  parseTranscript,
  parseVimeoId,
  parseYouTubeId,
  resolveVideoSource,
  type ResolvedVideo,
} from "@/lib/video";
import { getDemoSource } from "@/lib/video/providers/demo";
import { EmbedProvider } from "@/lib/video/providers/embed";
import { authorizeCron } from "@/app/api/cron/_lib/cron";

const YT_ID = "dQw4w9WgXcQ";
const VIMEO_ID = "76979871";
// Outro número no formato de ID do Vimeo (ex.: ID de showcase/álbum/canal) para provar qual número é extraído.
const OTHER_VIMEO_ID = "10234567";

// Variáveis que os módulos testados leem; limpas antes de cada teste e restauradas depois.
const MANAGED_ENV = [
  "CRON_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VIDEO_PROVIDER",
  "MUX_TOKEN_ID",
  "MUX_TOKEN_SECRET",
  "MUX_SIGNING_KEY_ID",
  "MUX_SIGNING_KEY_PRIVATE",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_STREAM_API_TOKEN",
  "CLOUDFLARE_STREAM_CUSTOMER_CODE",
  "CLOUDFLARE_STREAM_SIGNING_KEY_ID",
  "CLOUDFLARE_STREAM_SIGNING_KEY_PEM",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const name of MANAGED_ENV) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  // Os provedores avisam no console fora de produção; silencia sem perder a verificação.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const name of MANAGED_ENV) {
    const value = savedEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type ResolveInput = Parameters<typeof resolveVideoSource>[0];

function resolve(overrides: Partial<ResolveInput>): Promise<ResolvedVideo> {
  return resolveVideoSource({
    mediaProvider: "embed_youtube",
    mediaRef: YT_ID,
    body: {},
    durationMinutes: null,
    premium: false,
    ...overrides,
  });
}

function iframeUrl(result: ResolvedVideo): URL {
  if (result.type !== "iframe") throw new Error(`esperava iframe, veio ${JSON.stringify(result)}`);
  return new URL(result.url);
}

describe("normalizeProviderKind", () => {
  it("aceita os valores canônicos", () => {
    expect(normalizeProviderKind("embed")).toBe("embed");
    expect(normalizeProviderKind("mux")).toBe("mux");
    expect(normalizeProviderKind("cloudflare-stream")).toBe("cloudflare-stream");
  });

  it("tolera maiúsculas, espaços, sublinhado e o apelido 'cloudflare'", () => {
    expect(normalizeProviderKind("  MUX ")).toBe("mux");
    expect(normalizeProviderKind("Cloudflare_Stream")).toBe("cloudflare-stream");
    expect(normalizeProviderKind("cloudflare")).toBe("cloudflare-stream");
    expect(normalizeProviderKind("EMBED")).toBe("embed");
  });

  it("retorna null para valores desconhecidos ou que não são texto", () => {
    expect(normalizeProviderKind("youtube")).toBeNull();
    expect(normalizeProviderKind("")).toBeNull();
    expect(normalizeProviderKind(undefined)).toBeNull();
    expect(normalizeProviderKind(null)).toBeNull();
    expect(normalizeProviderKind(42)).toBeNull();
    expect(normalizeProviderKind({ provider: "mux" })).toBeNull();
  });
});

describe("getVideoProvider", () => {
  it("prioriza kind explícito > env VIDEO_PROVIDER > setting > 'embed'", () => {
    expect(getVideoProvider().kind).toBe("embed");
    expect(getVideoProvider(null, "mux").kind).toBe("mux");
    expect(getVideoProvider(null, "valor-invalido").kind).toBe("embed");

    process.env.VIDEO_PROVIDER = "cloudflare";
    expect(getVideoProvider(null, "mux").kind).toBe("cloudflare-stream");
    expect(getVideoProvider("embed", "mux").kind).toBe("embed");
  });

  it("ignora VIDEO_PROVIDER inválido e cai no setting", () => {
    process.env.VIDEO_PROVIDER = "vimeo";
    expect(getVideoProvider(null, "mux").kind).toBe("mux");
  });
});

describe("mediaRefFromBody", () => {
  it("mapeia embeds do YouTube e do Vimeo para o provedor 'embed' com o subtipo", () => {
    expect(mediaRefFromBody("embed_youtube", YT_ID, false)).toEqual({ provider: "embed", id: YT_ID, source: "youtube", premium: false });
    expect(mediaRefFromBody("embed_vimeo", VIMEO_ID, true)).toEqual({ provider: "embed", id: VIMEO_ID, source: "vimeo", premium: true });
  });

  it("mapeia provedores pagos sem subtipo de embed", () => {
    expect(mediaRefFromBody("cloudflare_stream", "uid-123", true)).toEqual({ provider: "cloudflare-stream", id: "uid-123", premium: true });
    expect(mediaRefFromBody("mux", "playback-1", false)).toEqual({ provider: "mux", id: "playback-1", premium: false });
  });

  it.each([
    ["embed_youtube", YT_ID],
    ["embed_vimeo", VIMEO_ID],
    ["cloudflare_stream", "uid-123"],
    ["mux", "playback-1"],
  ] as const)("%s preserva a flag premium nos dois sentidos", (mediaProvider, ref) => {
    expect(mediaRefFromBody(mediaProvider, ref, true)?.premium).toBe(true);
    expect(mediaRefFromBody(mediaProvider, ref, false)?.premium).toBe(false);
  });

  it("retorna null sem referência de mídia, mesmo com provedor válido", () => {
    expect(mediaRefFromBody("embed_youtube", null, false)).toBeNull();
    expect(mediaRefFromBody("mux", "", false)).toBeNull();
  });

  it("retorna null para 'none' e 'upload' (sem reprodução externa no POC)", () => {
    expect(mediaRefFromBody("none", YT_ID, false)).toBeNull();
    expect(mediaRefFromBody("upload", "arquivo.mp4", false)).toBeNull();
  });
});

describe("parseYouTubeId", () => {
  it.each([
    ["ID puro", YT_ID],
    ["ID com espaços", `  ${YT_ID}  `],
    ["watch", `https://www.youtube.com/watch?v=${YT_ID}`],
    ["watch com outros parâmetros", `https://www.youtube.com/watch?feature=share&v=${YT_ID}&t=42s`],
    ["watch sem www", `https://youtube.com/watch?v=${YT_ID}`],
    ["watch mobile", `https://m.youtube.com/watch?v=${YT_ID}`],
    ["host em maiúsculas", `https://WWW.YOUTUBE.COM/watch?v=${YT_ID}`],
    ["youtu.be", `https://youtu.be/${YT_ID}`],
    ["youtu.be com si/t", `https://youtu.be/${YT_ID}?si=abc123&t=10`],
    ["shorts", `https://www.youtube.com/shorts/${YT_ID}`],
    ["embed", `https://www.youtube.com/embed/${YT_ID}`],
    ["embed nocookie", `https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0`],
    ["live", `https://www.youtube.com/live/${YT_ID}`],
    ["legado /v/", `https://www.youtube.com/v/${YT_ID}`],
    ["http", `http://www.youtube.com/watch?v=${YT_ID}`],
  ])("extrai o ID de %s", (_label, raw) => {
    expect(parseYouTubeId(raw)).toBe(YT_ID);
  });

  it.each([
    ["host fora da allowlist", `https://evil.example.com/watch?v=${YT_ID}`],
    ["subdomínio enganoso", `https://www.youtube.com.evil.com/watch?v=${YT_ID}`],
    ["credenciais apontando para outro host", `https://youtube.com@evil.com/watch?v=${YT_ID}`],
    ["outro serviço do Google", `https://music.youtube.com/watch?v=${YT_ID}`],
    ["protocolo não http(s)", `ftp://youtube.com/watch?v=${YT_ID}`],
    ["javascript:", `javascript:alert('${YT_ID}')`],
    ["ID curto demais", "dQw4w9WgXc"],
    ["ID com caractere inválido", "dQw4w9WgXc!"],
    ["watch sem v", "https://www.youtube.com/watch"],
    ["v com tamanho errado", `https://www.youtube.com/watch?v=${YT_ID}x`],
    ["caminho desconhecido", `https://www.youtube.com/channel/${YT_ID}`],
    ["URL sem protocolo", `youtu.be/${YT_ID}`],
    ["texto livre", "meu vídeo favorito"],
  ])("rejeita %s", (_label, raw) => {
    expect(parseYouTubeId(raw)).toBeNull();
  });
});

describe("parseVimeoId", () => {
  it.each([
    ["ID puro", VIMEO_ID],
    ["vimeo.com/<id>", `https://vimeo.com/${VIMEO_ID}`],
    ["www.vimeo.com/<id>", `https://www.vimeo.com/${VIMEO_ID}`],
    ["player.vimeo.com/video/<id>", `https://player.vimeo.com/video/${VIMEO_ID}?h=abc`],
    ["canal", `https://vimeo.com/channels/staffpicks/${VIMEO_ID}`],
    ["canal com nome numérico", `https://vimeo.com/channels/${OTHER_VIMEO_ID}/${VIMEO_ID}`],
    ["grupo", `https://vimeo.com/groups/motion/videos/${VIMEO_ID}`],
    ["grupo com nome numérico", `https://vimeo.com/groups/${OTHER_VIMEO_ID}/videos/${VIMEO_ID}`],
  ])("extrai o ID de %s", (_label, raw) => {
    expect(parseVimeoId(raw)).toBe(VIMEO_ID);
  });

  it.each([
    ["6 dígitos (mínimo)", "123456", "123456"],
    ["12 dígitos (máximo)", "123456789012", "123456789012"],
    ["URL com 12 dígitos", "https://vimeo.com/123456789012", "123456789012"],
  ])("aceita os limites do ID numérico: %s", (_label, raw, expected) => {
    expect(parseVimeoId(raw)).toBe(expected);
  });

  it.each([
    ["host fora da allowlist", `https://vimeo.evil.com/${VIMEO_ID}`],
    ["outro host de vídeo", `https://www.dailymotion.com/video/${VIMEO_ID}`],
    ["protocolo não http(s)", `ftp://vimeo.com/${VIMEO_ID}`],
    ["javascript: com host do Vimeo", `javascript://vimeo.com/${VIMEO_ID}`],
    ["ID com 13 dígitos", "1234567890123"],
    ["URL com ID de 13 dígitos", "https://vimeo.com/1234567890123"],
    ["ID com poucos dígitos", "12345"],
    ["ID não numérico", "abcdefgh"],
    ["URL sem ID numérico", "https://vimeo.com/user/fulano"],
  ])("rejeita %s", (_label, raw) => {
    expect(parseVimeoId(raw)).toBeNull();
  });

  // Regressão: antes devolvia o primeiro número do caminho, isto é, o ID do showcase/álbum.
  it.each([
    ["showcase", `https://vimeo.com/showcase/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
    ["showcase (www, com query)", `https://www.vimeo.com/showcase/${OTHER_VIMEO_ID}/video/${VIMEO_ID}?share=copy`],
    ["álbum", `https://vimeo.com/album/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
  ])("URL de %s devolve o ID do vídeo, não o do contêiner", (_label, raw) => {
    expect(parseVimeoId(raw)).toBe(VIMEO_ID);
  });

  // Allowlist de formatos: caminhos com mais de um número (ou em posição inesperada) fora dos formatos
  // conhecidos são rejeitados em vez de "chutar" um dos números.
  it.each([
    ["dois números soltos", `https://vimeo.com/${OTHER_VIMEO_ID}/${VIMEO_ID}`],
    ["não listado com hash (vimeo.com/<id>/<hash>)", `https://vimeo.com/${VIMEO_ID}/a1b2c3d4e5`],
    ["showcase sem vídeo", `https://vimeo.com/showcase/${OTHER_VIMEO_ID}`],
    ["álbum sem vídeo", `https://vimeo.com/album/${OTHER_VIMEO_ID}`],
    ["showcase com segmento extra", `https://vimeo.com/showcase/${OTHER_VIMEO_ID}/video/${VIMEO_ID}/extra`],
    ["showcase com videoId não numérico", `https://vimeo.com/showcase/${OTHER_VIMEO_ID}/video/abc`],
    ["prefixo desconhecido", `https://vimeo.com/ondemand/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
    ["canal com segmento extra", `https://vimeo.com/channels/staffpicks/${OTHER_VIMEO_ID}/${VIMEO_ID}`],
    ["grupo sem /videos/", `https://vimeo.com/groups/motion/${VIMEO_ID}`],
    ["grupo com segmento extra", `https://vimeo.com/groups/motion/videos/${VIMEO_ID}/${OTHER_VIMEO_ID}`],
    ["player com segmento extra", `https://player.vimeo.com/video/${VIMEO_ID}/${OTHER_VIMEO_ID}`],
    ["player sem /video/", `https://player.vimeo.com/${VIMEO_ID}`],
    ["formato de página no host do player", `https://player.vimeo.com/showcase/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
    ["formato do player no host de páginas", `https://vimeo.com/video/${VIMEO_ID}`],
    ["literal com caixa diferente", `https://vimeo.com/Showcase/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
    ["nome de contêiner com caractere inválido", `https://vimeo.com/channels/a%2Fb/${VIMEO_ID}`],
  ])("rejeita caminho fora da allowlist: %s", (_label, raw) => {
    expect(parseVimeoId(raw)).toBeNull();
  });
});

describe("parseTranscript", () => {
  it("ordena por tempo, arredonda para baixo e descarta entradas malformadas", () => {
    expect(
      parseTranscript([
        { t: 30.9, text: " Segunda fala " },
        { t: "5", text: "Primeira fala" },
        { t: -1, text: "tempo negativo" },
        { t: "abc", text: "tempo inválido" },
        { t: 10, text: "   " },
        { t: 12, text: 99 },
        null,
        "texto solto",
        [1, "array"],
      ]),
    ).toEqual([
      { t: 5, text: "Primeira fala" },
      { t: 30, text: "Segunda fala" },
    ]);
  });

  it("retorna lista vazia quando não é array", () => {
    expect(parseTranscript(undefined)).toEqual([]);
    expect(parseTranscript({ t: 1, text: "x" })).toEqual([]);
  });
});

describe("getDemoSource", () => {
  it("usa a duração declarada quando ela cobre a transcrição", () => {
    const source = getDemoSource({ body: { transcript: [{ t: 10, text: "Oi" }] }, durationMinutes: 5, poster: "/p.jpg" });
    expect(source).toEqual({ type: "demo", durationSec: 300, transcript: [{ t: 10, text: "Oi" }], poster: "/p.jpg" });
  });

  it("estende a duração para cobrir a última fala (+20s)", () => {
    const source = getDemoSource({ body: { transcript: [{ t: 400, text: "Fim" }] }, durationMinutes: 5 });
    expect(source.durationSec).toBe(420);
  });

  it("cai em 120s sem duração nem transcrição e converte poster null em undefined", () => {
    const source = getDemoSource({ body: null, durationMinutes: null, poster: null });
    expect(source).toEqual({ type: "demo", durationSec: 120, transcript: [], poster: undefined });
    expect(getDemoSource({ body: "texto", durationMinutes: -3 }).durationSec).toBe(120);
  });

  it("com transcrição fora de ordem, a duração cobre a fala mais tardia", () => {
    const source = getDemoSource({
      body: { transcript: [{ t: 400, text: "Fim" }, { t: 10, text: "Início" }, { t: 200, text: "Meio" }] },
      durationMinutes: 1,
    });
    expect(source.transcript.map((line) => line.t)).toEqual([10, 200, 400]);
    expect(source.durationSec).toBe(420);
  });

  it("com transcrição curta e sem duração, usa a última fala e não o padrão", () => {
    expect(getDemoSource({ body: { transcript: [{ t: 3, text: "a" }] }, durationMinutes: 0 }).durationSec).toBe(23);
  });
});

describe("EmbedProvider", () => {
  it("getEmbed devolve URL de privacidade em 16/9 e rejeita fonte desconhecida", () => {
    const provider = new EmbedProvider();
    const info = provider.getEmbed({ provider: "embed", id: YT_ID, source: "youtube" });
    expect(info.aspectRatio).toBe("16/9");
    expect(new URL(info.url).hostname).toBe("www.youtube-nocookie.com");
    expect(() => provider.getEmbed({ provider: "embed", id: YT_ID })).toThrow(/fonte de embed desconhecida/);
  });
});

describe("resolveVideoSource", () => {
  describe("provedor 'none' → player de demonstração", () => {
    it("monta a fonte simulada a partir do corpo, ignorando media_ref", async () => {
      const result = await resolve({
        mediaProvider: "none",
        mediaRef: YT_ID,
        body: { transcript: [{ t: 0, text: "Bem-vindo" }, { t: 45, text: "Aquecimento" }] },
        durationMinutes: 2,
        poster: "/capa.jpg",
      });
      expect(result).toEqual({
        type: "demo",
        durationSec: 120,
        transcript: [
          { t: 0, text: "Bem-vindo" },
          { t: 45, text: "Aquecimento" },
        ],
        poster: "/capa.jpg",
      });
    });

    it("funciona mesmo com corpo vazio", async () => {
      const result = await resolve({ mediaProvider: "none", mediaRef: null, body: null });
      expect(result).toEqual({ type: "demo", durationSec: 120, transcript: [], poster: undefined });
    });
  });

  describe("YouTube", () => {
    it.each([
      ["ID puro", YT_ID],
      ["watch", `https://www.youtube.com/watch?v=${YT_ID}&list=PL123`],
      ["shorts", `https://www.youtube.com/shorts/${YT_ID}`],
      ["youtu.be", `https://youtu.be/${YT_ID}?t=5`],
      ["embed", `https://www.youtube.com/embed/${YT_ID}`],
    ])("%s vira iframe youtube-nocookie com o ID normalizado", async (_label, mediaRef) => {
      const result = await resolve({ mediaProvider: "embed_youtube", mediaRef });
      expect(result).toMatchObject({ type: "iframe" });
      const url = iframeUrl(result);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("www.youtube-nocookie.com");
      expect(url.pathname).toBe(`/embed/${YT_ID}`);
      expect(url.searchParams.get("rel")).toBe("0");
      expect(url.searchParams.get("modestbranding")).toBe("1");
      expect(url.searchParams.get("playsinline")).toBe("1");
      // Parâmetros da URL original (list, t, si) não vazam para o player.
      expect(url.searchParams.has("list")).toBe(false);
      expect(url.searchParams.has("t")).toBe(false);
    });

    it("define idioma do player para pt/en/es a partir do locale", async () => {
      const ptBR = iframeUrl(await resolve({ locale: "pt-BR" }));
      expect(ptBR.searchParams.get("hl")).toBe("pt");
      expect(ptBR.searchParams.get("cc_lang_pref")).toBe("pt");

      const es = iframeUrl(await resolve({ locale: "es" }));
      expect(es.searchParams.get("hl")).toBe("es");
    });

    it.each([
      ["pt", "pt"],
      ["en", "en"],
      ["en-US", "en"],
      ["es-419", "es"],
      ["PT-BR", "pt"],
      ["EN", "en"],
    ])("locale %s → hl/cc_lang_pref=%s", async (locale, lang) => {
      const url = iframeUrl(await resolve({ locale }));
      expect(url.searchParams.get("hl")).toBe(lang);
      expect(url.searchParams.get("cc_lang_pref")).toBe(lang);
    });

    it("não define idioma para locale não suportado ou ausente", async () => {
      expect(iframeUrl(await resolve({ locale: "fr-FR" })).searchParams.has("hl")).toBe(false);
      expect(iframeUrl(await resolve({ locale: "" })).searchParams.has("hl")).toBe(false);
      expect(iframeUrl(await resolve({})).searchParams.has("hl")).toBe(false);
    });

    it("conteúdo premium continua como iframe (embed não assina) e só avisa em dev", async () => {
      const result = await resolve({ premium: true, userId: "u1" });
      expect(result.type).toBe("iframe");
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("ignora `signed`"));
    });
  });

  describe("Vimeo", () => {
    it.each([
      ["ID puro", VIMEO_ID],
      ["vimeo.com", `https://vimeo.com/${VIMEO_ID}`],
      ["player.vimeo.com", `https://player.vimeo.com/video/${VIMEO_ID}`],
      ["showcase", `https://vimeo.com/showcase/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
      ["álbum", `https://vimeo.com/album/${OTHER_VIMEO_ID}/video/${VIMEO_ID}`],
    ])("%s vira iframe do player.vimeo.com com dnt=1", async (_label, mediaRef) => {
      const url = iframeUrl(await resolve({ mediaProvider: "embed_vimeo", mediaRef, locale: "pt-BR" }));
      expect(url.hostname).toBe("player.vimeo.com");
      expect(url.pathname).toBe(`/video/${VIMEO_ID}`);
      expect(url.searchParams.get("dnt")).toBe("1");
      expect(url.searchParams.get("playsinline")).toBe("1");
    });
  });

  describe("hosts fora da allowlist e referências inválidas", () => {
    it.each([
      ["embed_youtube", `https://evil.example.com/watch?v=${YT_ID}`],
      ["embed_youtube", `https://www.youtube.com.evil.com/watch?v=${YT_ID}`],
      ["embed_youtube", `https://www.dailymotion.com/video/${YT_ID}`],
      ["embed_youtube", "<script>alert(1)</script>"],
      ["embed_vimeo", `https://vimeo.evil.com/${VIMEO_ID}`],
      ["embed_vimeo", `https://www.youtube.com/watch?v=${YT_ID}`],
      ["embed_vimeo", "javascript:alert(1)"],
      ["embed_vimeo", `https://vimeo.com/${OTHER_VIMEO_ID}/${VIMEO_ID}`],
    ] as const)("%s com %s → unavailable/invalid-ref", async (mediaProvider, mediaRef) => {
      await expect(resolve({ mediaProvider, mediaRef })).resolves.toEqual({ type: "unavailable", reason: "invalid-ref" });
    });
  });

  describe("sem mídia externa ou provedor pago sem chaves", () => {
    it("embed sem media_ref → not-ready", async () => {
      await expect(resolve({ mediaProvider: "embed_youtube", mediaRef: null })).resolves.toEqual({ type: "unavailable", reason: "not-ready" });
    });

    it("'upload' não tem reprodução no POC → not-ready", async () => {
      await expect(resolve({ mediaProvider: "upload", mediaRef: "arquivo.mp4" })).resolves.toEqual({ type: "unavailable", reason: "not-ready" });
    });

    it.each(["cloudflare_stream", "mux"] as const)("%s sem env → missing-keys, sem lançar", async (mediaProvider) => {
      await expect(resolve({ mediaProvider, mediaRef: "ref-1" })).resolves.toEqual({ type: "unavailable", reason: "missing-keys" });
      expect(console.warn).toHaveBeenCalled();
    });

    it("VIDEO_PROVIDER não sobrepõe o provedor gravado no conteúdo", async () => {
      process.env.VIDEO_PROVIDER = "mux";
      expect((await resolve({ mediaProvider: "embed_youtube", mediaRef: YT_ID })).type).toBe("iframe");
    });

    it("mux com chaves mas sem implementação nunca inventa URL", async () => {
      process.env.MUX_TOKEN_ID = "id";
      process.env.MUX_TOKEN_SECRET = "secret";
      await expect(resolve({ mediaProvider: "mux", mediaRef: "ref-1" })).resolves.toEqual({ type: "unavailable", reason: "missing-keys" });
    });
  });

  describe("em produção (NODE_ENV=production)", () => {
    it("premium em embed continua iframe, sem aviso no console", async () => {
      vi.stubEnv("NODE_ENV", "production");
      expect((await resolve({ premium: true, userId: "u1" })).type).toBe("iframe");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it.each(["cloudflare_stream", "mux"] as const)("%s sem env → missing-keys, sem aviso no console", async (mediaProvider) => {
      vi.stubEnv("NODE_ENV", "production");
      await expect(resolve({ mediaProvider, mediaRef: "ref-1" })).resolves.toEqual({ type: "unavailable", reason: "missing-keys" });
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  it("erro inesperado do provedor é propagado, não mascarado como missing-keys", async () => {
    // Única forma de simular uma falha que não seja NotConfiguredError: os provedores reais não lançam outra coisa.
    vi.spyOn(EmbedProvider.prototype, "getPlaybackSource").mockRejectedValue(new Error("falha de rede"));
    await expect(resolve({ mediaProvider: "embed_youtube", mediaRef: YT_ID })).rejects.toThrow("falha de rede");
  });
});

describe("authorizeCron", () => {
  const SECRET = "s3cr3t-cron";

  function cronRequest(authorization?: string): Request {
    const headers = new Headers();
    if (authorization !== undefined) headers.set("authorization", authorization);
    return new Request("https://app.example.com/api/cron/retention", { headers });
  }

  async function expectError(response: Response | null, status: number, error: string) {
    expect(response).not.toBeNull();
    expect(response!.status).toBe(status);
    expect(response!.headers.get("cache-control")).toBe("no-store");
    expect(await response!.json()).toEqual({ ok: false, error });
  }

  it("sem CRON_SECRET → 500 cron_secret_missing, mesmo com bearer", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    await expectError(authorizeCron(cronRequest("Bearer undefined")), 500, "cron_secret_missing");
    await expectError(authorizeCron(cronRequest("Bearer ")), 500, "cron_secret_missing");
  });

  it("CRON_SECRET vazio conta como ausente → 500", async () => {
    process.env.CRON_SECRET = "";
    await expectError(authorizeCron(cronRequest("Bearer ")), 500, "cron_secret_missing");
  });

  it.each([
    ["sem header", undefined],
    ["header vazio", ""],
    ["segredo errado", "Bearer outro-segredo"],
    ["segredo com prefixo correto mas maior", `Bearer ${SECRET}x`],
    ["segredo truncado", `Bearer ${SECRET.slice(0, -1)}`],
    ["sem o esquema Bearer", SECRET],
    ["esquema em minúsculas", `bearer ${SECRET}`],
    ["outro esquema", `Basic ${SECRET}`],
  ])("bearer inválido (%s) → 403 forbidden", async (_label, authorization) => {
    process.env.CRON_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    await expectError(authorizeCron(cronRequest(authorization)), 403, "forbidden");
  });

  it("bearer inválido é rejeitado antes de checar o service role", async () => {
    process.env.CRON_SECRET = SECRET;
    await expectError(authorizeCron(cronRequest("Bearer errado")), 403, "forbidden");
  });

  it("bearer correto sem SUPABASE_SERVICE_ROLE_KEY → 500 service_role_missing", async () => {
    process.env.CRON_SECRET = SECRET;
    await expectError(authorizeCron(cronRequest(`Bearer ${SECRET}`)), 500, "service_role_missing");
  });

  it("bearer correto + service role → null (autorizado)", () => {
    process.env.CRON_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(authorizeCron(cronRequest(`Bearer ${SECRET}`))).toBeNull();
  });

  it("segredo não ASCII: aceita o exato e rejeita (sem lançar) quando o tamanho em bytes difere", async () => {
    process.env.CRON_SECRET = "segredo-çã";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(authorizeCron(cronRequest("Bearer segredo-çã"))).toBeNull();
    await expectError(authorizeCron(cronRequest("Bearer segredo-ca")), 403, "forbidden");
  });
});
