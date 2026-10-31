import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/recommendations/candidates";
import { deterministicEngine, diversify, rankDeterministic, scoreCandidate } from "@/lib/recommendations/deterministic";
import { countRecentRuns, decideEngine, DEFAULT_RATE_LIMIT_PER_HOUR, providerHasKey, readPublicAiSettings } from "@/lib/recommendations/guardrails";
import { geminiEngine } from "@/lib/recommendations/providers/gemini";
import { openAiEngine } from "@/lib/recommendations/providers/openai";
import { buildPrompt, errorMessage, estimateCost, fetchJson, validateOutput } from "@/lib/recommendations/providers/shared";
import { parseReason, serializeReason } from "@/lib/recommendations/reasons";
import type { Candidate, Reason, UserSignals } from "@/lib/recommendations/types";
import { MAX_LLM_CANDIDATES, MAX_PER_PILLAR_TOP } from "@/lib/recommendations/types";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const DAY = 86_400_000;

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

function candidate(overrides: Partial<Candidate> & { content_id: string }): Candidate {
  return {
    pillar: "routine",
    type: "video",
    difficulty: null,
    tags: [],
    access_level: "free",
    is_featured: false,
    published_at: null,
    ...overrides,
  };
}

function signals(overrides: Partial<UserSignals> = {}): UserSignals {
  return {
    userId: "user-1",
    locale: "pt-BR",
    interests: [],
    pillarAffinity: {},
    difficultyLevel: "beginner",
    completedCount: 0,
    ...overrides,
  };
}

type Scored = ReturnType<typeof scoreCandidate>;

function scored(id: string, pillar: Candidate["pillar"], score: number): Scored {
  return { candidate: candidate({ content_id: id, pillar }), score, reason: { key: "generic" } };
}

// ---------------------------------------------------------------------------
// Motor determinístico
// ---------------------------------------------------------------------------

describe("scoreCandidate", () => {
  it("item neutro pontua só o ajuste de dificuldade desconhecida (0,5) com justificativa genérica", () => {
    const result = scoreCandidate(candidate({ content_id: "c1" }), signals(), NOW);
    expect(result.score).toBe(0.5);
    expect(result.reason).toEqual({ key: "generic" });
  });

  it("soma 3 pontos por tag de interesse e justifica pela primeira tag do item que casou", () => {
    const result = scoreCandidate(
      candidate({ content_id: "c1", tags: ["sono", "foco", "receita"] }),
      signals({ interests: ["foco", "sono", "forca"] }),
      NOW,
    );
    expect(result.score).toBe(6.5);
    expect(result.reason).toEqual({ key: "interest", params: { tag: "sono" } });
  });

  it("normaliza a afinidade de pilar pelo maior valor (máx. 2 pontos)", () => {
    const s = signals({ pillarAffinity: { training: 4, nutrition: 2 } });
    const training = scoreCandidate(candidate({ content_id: "t", pillar: "training" }), s, NOW);
    const nutrition = scoreCandidate(candidate({ content_id: "n", pillar: "nutrition" }), s, NOW);
    const routine = scoreCandidate(candidate({ content_id: "r", pillar: "routine" }), s, NOW);
    expect(training.score).toBe(2.5);
    expect(training.reason).toEqual({ key: "pillar", params: { pillar: "training" } });
    expect(nutrition.score).toBe(1.5);
    expect(nutrition.reason.key).toBe("generic");
    expect(routine.score).toBe(0.5);
  });

  it("justifica pelo pilar a partir de 1,5 ponto de afinidade (limiar inclusivo)", () => {
    const result = scoreCandidate(candidate({ content_id: "r", pillar: "routine" }), signals({ pillarAffinity: { training: 4, routine: 3 } }), NOW);
    expect(result.score).toBe(2);
    expect(result.reason).toEqual({ key: "pillar", params: { pillar: "routine" } });
  });

  it("afinidade toda zerada ou vazia não gera NaN nem pontos de pilar", () => {
    for (const pillarAffinity of [{}, { routine: 0, training: 0 }]) {
      const result = scoreCandidate(candidate({ content_id: "r" }), signals({ pillarAffinity }), NOW);
      expect(result.score).toBe(0.5);
      expect(Number.isFinite(result.score)).toBe(true);
    }
  });

  it("ajuste de dificuldade: igual = 1, vizinho = 0,5, oposto = 0, desconhecido = 0,5", () => {
    const intermediate = signals({ difficultyLevel: "intermediate" });
    expect(scoreCandidate(candidate({ content_id: "a", difficulty: "intermediate" }), intermediate, NOW).score).toBe(1);
    expect(scoreCandidate(candidate({ content_id: "b", difficulty: "beginner" }), intermediate, NOW).score).toBe(0.5);
    expect(scoreCandidate(candidate({ content_id: "c", difficulty: "advanced" }), intermediate, NOW).score).toBe(0.5);
    expect(scoreCandidate(candidate({ content_id: "d", difficulty: "advanced" }), signals({ difficultyLevel: "beginner" }), NOW).score).toBe(0);
    expect(scoreCandidate(candidate({ content_id: "e", difficulty: null }), intermediate, NOW).score).toBe(0.5);
  });

  it("justifica pela dificuldade só quando o nível casa exatamente e não há motivo mais forte", () => {
    const exact = scoreCandidate(candidate({ content_id: "a", difficulty: "beginner" }), signals(), NOW);
    expect(exact.reason).toEqual({ key: "difficulty" });
    const unknown = scoreCandidate(candidate({ content_id: "b", difficulty: null }), signals(), NOW);
    expect(unknown.reason).toEqual({ key: "generic" });
  });

  it("novidade decai linearmente em 30 dias e arredonda o score para 3 casas", () => {
    const at = (published_at: string | null) => scoreCandidate(candidate({ content_id: "c", published_at }), signals(), NOW);
    expect(at(daysAgo(0)).score).toBe(1.5);
    expect(at(daysAgo(15)).score).toBe(1);
    expect(at(daysAgo(10)).score).toBe(1.167);
    expect(at(daysAgo(30)).score).toBe(0.5);
    expect(at(daysAgo(90)).score).toBe(0.5);
    expect(at(null).score).toBe(0.5);
  });

  it("data de publicação no futuro conta como novidade máxima", () => {
    const result = scoreCandidate(candidate({ content_id: "c", published_at: daysAgo(-5) }), signals(), NOW);
    expect(result.score).toBe(1.5);
    expect(result.reason).toEqual({ key: "fresh" });
  });

  it("data de publicação inválida não gera NaN: score continua numérico e o ranking não quebra", () => {
    const bad = candidate({ content_id: "bad", published_at: "não-é-data" });
    expect(Number.isFinite(scoreCandidate(bad, signals(), NOW).score)).toBe(true);
    const ranked = rankDeterministic([bad, candidate({ content_id: "ok", published_at: daysAgo(1) }), candidate({ content_id: "old" })], signals(), 8, NOW);
    expect(ranked).toHaveLength(3);
    expect(ranked.every((r) => Number.isFinite(r.score))).toBe(true);
  });

  it("justifica por novidade a partir de metade da janela (15 dias) e não depois", () => {
    expect(scoreCandidate(candidate({ content_id: "a", published_at: daysAgo(15) }), signals(), NOW).reason).toEqual({ key: "fresh" });
    expect(scoreCandidate(candidate({ content_id: "b", published_at: daysAgo(16) }), signals(), NOW).reason).toEqual({ key: "generic" });
  });

  it("destaque soma 0,75 e tem prioridade sobre novidade na justificativa", () => {
    const result = scoreCandidate(candidate({ content_id: "c", is_featured: true, published_at: daysAgo(10) }), signals(), NOW);
    expect(result.score).toBe(1.917);
    expect(result.reason).toEqual({ key: "featured" });
  });

  it("app gratuito (0069): nenhuma penalidade por plano ou módulo", () => {
    expect(scoreCandidate(candidate({ content_id: "f", access_level: "free" }), signals(), NOW).score).toBe(0.5);
  });

  it("interesse tem prioridade sobre pilar na justificativa, mas os pontos se somam", () => {
    const result = scoreCandidate(
      candidate({ content_id: "t", pillar: "training", tags: ["forca"] }),
      signals({ interests: ["forca"], pillarAffinity: { training: 1 } }),
      NOW,
    );
    expect(result.score).toBe(5.5);
    expect(result.reason).toEqual({ key: "interest", params: { tag: "forca" } });
  });

  describe("justificativa = componente elegível que mais contribuiu (empate pela prioridade)", () => {
    it("regressão: destaque (0,75) não é a justificativa quando a dificuldade exata (1) contribui mais; pilar 1,4 fica abaixo do mínimo de 1,5 para ser afirmado", () => {
      const result = scoreCandidate(
        candidate({ content_id: "r", pillar: "routine", is_featured: true, difficulty: "beginner" }),
        signals({ pillarAffinity: { training: 5, routine: 3.5 } }),
        NOW,
      );
      expect(result.score).toBe(3.15); // pilar 1,4 + dificuldade 1 + destaque 0,75
      expect(result.reason).toEqual({ key: "difficulty" });
    });

    it("pilar elegível (≥ 1,5) vence destaque, novidade máxima e dificuldade exata porque contribui mais", () => {
      const result = scoreCandidate(
        candidate({ content_id: "r", pillar: "routine", is_featured: true, difficulty: "beginner", published_at: daysAgo(0) }),
        signals({ pillarAffinity: { training: 4, routine: 4 } }),
        NOW,
      );
      expect(result.score).toBe(4.75);
      expect(result.reason).toEqual({ key: "pillar", params: { pillar: "routine" } });
    });

    it.each([
      // [descrição, overrides do item, reason esperado]
      ["novidade 0,667 < destaque 0,75 → destaque", { is_featured: true, published_at: daysAgo(10) }, "featured"],
      ["novidade 1 > destaque 0,75 → novidade", { is_featured: true, published_at: daysAgo(0) }, "fresh"],
      ["novidade 0,9 > destaque 0,75 → novidade", { is_featured: true, published_at: daysAgo(3) }, "fresh"],
      ["dificuldade exata 1 > destaque 0,75 → dificuldade", { is_featured: true, difficulty: "beginner" }, "difficulty"],
      ["dificuldade exata 1 > novidade 0,9 → dificuldade", { difficulty: "beginner", published_at: daysAgo(3) }, "difficulty"],
      ["empate novidade 1 × dificuldade 1 → novidade (prioridade)", { difficulty: "beginner", published_at: daysAgo(0) }, "fresh"],
      ["dificuldade vizinha (0,5) nunca é afirmada → destaque", { is_featured: true, difficulty: "intermediate" }, "featured"],
      ["novidade abaixo de 0,5 nunca é afirmada → dificuldade", { difficulty: "beginner", published_at: daysAgo(20) }, "difficulty"],
    ] as const)("%s", (_label, overrides, key) => {
      const result = scoreCandidate(candidate({ content_id: "c", ...overrides }), signals(), NOW);
      expect(result.reason.key).toBe(key);
    });

    it("a justificativa nunca aponta um componente que contribuiu menos que outro componente afirmável", () => {
      // pontos de cada justificativa possível, recalculados de forma independente pelo teste
      const level = "beginner" as const;
      for (const is_featured of [false, true])
        for (const days of [null, 0, 3, 10, 15, 20])
          for (const difficulty of [null, "beginner", "intermediate"] as const)
            for (const routineAffinity of [0, 2, 2.8, 3, 4]) {
              const c = candidate({ content_id: "c", pillar: "routine", is_featured, difficulty, published_at: days === null ? null : daysAgo(days) });
              const result = scoreCandidate(c, signals({ difficultyLevel: level, pillarAffinity: { training: 4, routine: routineAffinity } }), NOW);
              const pillar = (routineAffinity / 4) * 2;
              const fresh = days === null ? 0 : Math.max(0, 1 - days / 30);
              const points: Partial<Record<Reason["key"], number>> = {};
              if (pillar >= 1.5) points.pillar = pillar;
              if (is_featured) points.featured = 0.75;
              if (fresh >= 0.5) points.fresh = fresh;
              if (difficulty === level) points.difficulty = 1;
              const max = Math.max(0, ...Object.values(points));
              if (max === 0) expect(result.reason.key).toBe("generic");
              else expect(points[result.reason.key]).toBe(max);
            }
    });
  });
});

describe("diversify", () => {
  const sorted = [
    scored("r1", "routine", 10),
    scored("r2", "routine", 9),
    scored("r3", "routine", 8),
    scored("r4", "routine", 7),
    scored("t1", "training", 6),
    scored("n1", "nutrition", 5),
    scored("r5", "routine", 4),
  ];
  const ids = (items: Scored[]) => items.map((item) => item.candidate.content_id);

  it(`limita a ${MAX_PER_PILLAR_TOP} itens por pilar no topo, abrindo espaço para outros pilares`, () => {
    expect(ids(diversify(sorted, 5))).toEqual(["r1", "r2", "r3", "t1", "n1"]);
  });

  it("completa com os itens pulados (em ordem) quando faltam outros pilares", () => {
    expect(ids(diversify(sorted, 7))).toEqual(["r1", "r2", "r3", "t1", "n1", "r4", "r5"]);
  });

  it("catálogo de um só pilar ainda preenche o limite", () => {
    const onlyRoutine = sorted.filter((item) => item.candidate.pillar === "routine");
    expect(ids(diversify(onlyRoutine, 4))).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("respeita maxPerPillar customizado", () => {
    const list = [scored("r1", "routine", 5), scored("r2", "routine", 4), scored("t1", "training", 3), scored("t2", "training", 2), scored("n1", "nutrition", 1)];
    expect(ids(diversify(list, 3, 1))).toEqual(["r1", "t1", "n1"]);
  });

  it("limite 0 devolve vazio e limite maior que a lista devolve tudo sem duplicar", () => {
    expect(diversify(sorted, 0)).toEqual([]);
    const all = ids(diversify(sorted, 100));
    expect(all).toHaveLength(sorted.length);
    expect(new Set(all).size).toBe(sorted.length);
  });
});

describe("rankDeterministic", () => {
  it("ordena por score decrescente e devolve só id, score e justificativa", () => {
    const s = signals({ interests: ["sono"], pillarAffinity: { training: 2 } });
    const result = rankDeterministic(
      [
        candidate({ content_id: "generic" }),
        candidate({ content_id: "pillar", pillar: "training" }),
        candidate({ content_id: "interest", tags: ["sono"] }),
      ],
      s,
      8,
      NOW,
    );
    expect(result).toEqual([
      { content_id: "interest", score: 3.5, reason: { key: "interest", params: { tag: "sono" } } },
      { content_id: "pillar", score: 2.5, reason: { key: "pillar", params: { pillar: "training" } } },
      { content_id: "generic", score: 0.5, reason: { key: "generic" } },
    ]);
  });

  it("em empate de score, prioriza o publicado mais recentemente (sem data por último)", () => {
    const result = rankDeterministic(
      [
        candidate({ content_id: "aaa", published_at: null }),
        candidate({ content_id: "bbb", published_at: daysAgo(60) }),
        candidate({ content_id: "ccc", published_at: daysAgo(40) }),
      ],
      signals(),
      8,
      NOW,
    );
    expect(result.map((r) => r.score)).toEqual([0.5, 0.5, 0.5]);
    expect(result.map((r) => r.content_id)).toEqual(["ccc", "bbb", "aaa"]);
  });

  it("em empate total, desempata pelo id (ordem estável e reprodutível)", () => {
    const list = [candidate({ content_id: "b" }), candidate({ content_id: "c" }), candidate({ content_id: "a" })];
    expect(rankDeterministic(list, signals(), 8, NOW).map((r) => r.content_id)).toEqual(["a", "b", "c"]);
    expect(rankDeterministic([...list].reverse(), signals(), 8, NOW).map((r) => r.content_id)).toEqual(["a", "b", "c"]);
  });

  it("aplica diversidade de pilar mesmo quando outro pilar pontua mais", () => {
    const s = signals({ interests: ["habito"] });
    const list = [
      ...["r1", "r2", "r3", "r4"].map((id) => candidate({ content_id: id, pillar: "routine", tags: ["habito"] })),
      candidate({ content_id: "t1", pillar: "training" }),
    ];
    expect(rankDeterministic(list, s, 4, NOW).map((r) => r.content_id)).toEqual(["r1", "r2", "r3", "t1"]);
  });

  it("respeita o limite, aceita catálogo vazio e não altera a lista de entrada", () => {
    const list = [candidate({ content_id: "z" }), candidate({ content_id: "y", tags: ["x"] }), candidate({ content_id: "x" })];
    const before = list.map((c) => c.content_id);
    expect(rankDeterministic(list, signals({ interests: ["x"] }), 2, NOW)).toHaveLength(2);
    expect(list.map((c) => c.content_id)).toEqual(before);
    expect(rankDeterministic([], signals(), 8, NOW)).toEqual([]);
  });
});

describe("deterministicEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const catalog = [
    candidate({ content_id: "a", tags: ["sono"], published_at: daysAgo(2) }),
    candidate({ content_id: "b", pillar: "training", is_featured: true }),
    candidate({ content_id: "c", pillar: "nutrition", published_at: daysAgo(100) }),
    candidate({ content_id: "d", pillar: "gastronomy", difficulty: "beginner" }),
  ];

  it("devolve o mesmo ranking de rankDeterministic no instante atual", async () => {
    const s = signals({ interests: ["sono"] });
    const output = await deterministicEngine.run({ candidates: catalog, signals: s, limit: 3 });
    expect(output.recommendations).toEqual(rankDeterministic(catalog, s, 3, NOW));
    expect(output.recommendations).toHaveLength(3);
  });

  it("é sempre identificado como fallback, sem custo nem tokens", async () => {
    expect(deterministicEngine.name).toBe("deterministic");
    const output = await deterministicEngine.run({ candidates: catalog, signals: signals(), limit: 3 });
    expect(output.metrics).toMatchObject({
      engine: "deterministic",
      provider_model: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_estimate_usd: 0,
      candidates: 4,
      returned: 3,
      valid_rate: 1,
      error: null,
      is_fallback: true,
    });
    expect(output.metrics.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("não faz nenhuma chamada externa", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await deterministicEngine.run({ candidates: catalog, signals: signals(), limit: 8 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("catálogo vazio devolve lista vazia com métricas coerentes", async () => {
    const output = await deterministicEngine.run({ candidates: [], signals: signals(), limit: 8 });
    expect(output.recommendations).toEqual([]);
    expect(output.metrics).toMatchObject({ candidates: 0, returned: 0, is_fallback: true });
  });
});

// ---------------------------------------------------------------------------
// Justificativas persistidas
// ---------------------------------------------------------------------------

describe("serializeReason / parseReason", () => {
  const reasons: Reason[] = [
    { key: "interest", params: { tag: "sono" } },
    { key: "pillar", params: { pillar: "nutrition" } },
    { key: "difficulty" },
    { key: "fresh" },
    { key: "featured" },
    { key: "generic" },
    { key: "text", params: { text: "Combina com seu interesse em receitas rápidas." } },
    { key: "interest", params: { tag: "foco", rank: 2 } },
  ];

  it.each(reasons)("ida e volta preserva a justificativa %o", (reason) => {
    expect(parseReason(serializeReason(reason))).toEqual(reason);
  });

  it("vazio, null ou undefined viram justificativa genérica", () => {
    expect(parseReason(null)).toEqual({ key: "generic" });
    expect(parseReason(undefined)).toEqual({ key: "generic" });
    expect(parseReason("")).toEqual({ key: "generic" });
  });

  it("texto livre legado vira justificativa de texto", () => {
    expect(parseReason("Porque você segue hábitos")).toEqual({ key: "text", params: { text: "Porque você segue hábitos" } });
  });

  it("texto livre longo é cortado em 140 caracteres", () => {
    const parsed = parseReason("x".repeat(300));
    expect(parsed.key).toBe("text");
    expect(String(parsed.params?.text)).toHaveLength(140);
  });

  it("chave desconhecida ou não textual nunca é aceita como chave de tradução", () => {
    for (const raw of ['{"key":"hack"}', '{"key":1}', '{"params":{"tag":"x"}}', "42", "null", '"interest"', "[]"]) {
      const parsed = parseReason(raw);
      expect(parsed.key).toBe("text");
      expect(parsed.params).toEqual({ text: raw });
    }
  });

  it("descarta parâmetros que não são texto nem número", () => {
    const raw = JSON.stringify({ key: "interest", params: { tag: "sono", n: 2, nested: { x: 1 }, flag: true, empty: null, list: ["a"] } });
    expect(parseReason(raw)).toEqual({ key: "interest", params: { tag: "sono", n: 2 } });
  });

  it("params que não é objeto é ignorado", () => {
    expect(parseReason('{"key":"fresh","params":"oops"}')).toEqual({ key: "fresh" });
  });
});

// ---------------------------------------------------------------------------
// Guardrails (sem Supabase real: clientes falsos mínimos)
// ---------------------------------------------------------------------------

type FakeOptions = {
  settings?: Record<string, unknown>;
  // payload bruto do rpc (sobrepõe `settings`), para simular formatos inesperados
  rpcData?: unknown;
  rpcThrows?: boolean;
  rpcError?: boolean;
  rateLimitValue?: unknown;
  recentRuns?: number | null;
  runsError?: boolean;
  runsThrows?: boolean;
};

type FakeCall = { table: string; ops: Array<[string, unknown[]]> };

function fakeDb(opts: FakeOptions) {
  const calls: FakeCall[] = [];
  const client = {
    rpc: async (fn: string) => {
      if (opts.rpcThrows) throw new Error("network down");
      // com rpcError + rpcData simula erro acompanhado de payload (não deve ser confiado)
      if (opts.rpcError || fn !== "public_settings") return { data: opts.rpcError && "rpcData" in opts ? opts.rpcData : null, error: { message: "rpc failed" } };
      if ("rpcData" in opts) return { data: opts.rpcData, error: null };
      return { data: opts.settings ?? {}, error: null };
    },
    from(table: string) {
      const call: FakeCall = { table, ops: [] };
      calls.push(call);
      const result = () =>
        table === "app_settings"
          ? { data: opts.rateLimitValue === undefined ? null : { value: opts.rateLimitValue }, error: null }
          : opts.runsError
            ? { data: null, count: null, error: { message: "permission denied for table recommendation_runs" } }
            : { data: null, count: opts.recentRuns === undefined ? 0 : opts.recentRuns, error: null };
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "gte"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => result();
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        (opts.runsThrows && table === "recommendation_runs" ? Promise.reject(new Error("network down")) : Promise.resolve(result())).then(resolve, reject);
      return builder;
    },
  };
  return { db: client as unknown as Db, calls };
}

describe("guardrails", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("DEFAULT_RATE_LIMIT_PER_HOUR", () => {
    it("é o mesmo valor semeado em ai.rate_limit_per_hour (12/h)", () => {
      expect(DEFAULT_RATE_LIMIT_PER_HOUR).toBe(12);
    });

    it("é usado quando não há service role", async () => {
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": false } }).db, admin: null, userId: "u1" });
      expect(decision.rateLimitPerHour).toBe(DEFAULT_RATE_LIMIT_PER_HOUR);
    });

    it.each([0, -3, "abc", null, Number.NaN])("é usado quando o valor configurado é inválido (%s)", async (value) => {
      const admin = fakeDb({ rateLimitValue: value }).db;
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": false } }).db, admin, userId: "u1" });
      expect(decision.rateLimitPerHour).toBe(DEFAULT_RATE_LIMIT_PER_HOUR);
    });

    it("valor configurado válido é arredondado para baixo", async () => {
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": false } }).db, admin: fakeDb({ rateLimitValue: "5.7" }).db, userId: "u1" });
      expect(decision.rateLimitPerHour).toBe(5);
    });
  });

  describe("providerHasKey", () => {
    it("motor determinístico nunca precisa de chave", () => {
      expect(providerHasKey("deterministic")).toBe(true);
    });

    it("OpenAI e Gemini dependem da própria variável de ambiente", () => {
      expect(providerHasKey("openai")).toBe(false);
      expect(providerHasKey("gemini")).toBe(false);
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      expect(providerHasKey("openai")).toBe(true);
      expect(providerHasKey("gemini")).toBe(false);
      vi.stubEnv("GEMINI_API_KEY", "g-test");
      expect(providerHasKey("gemini")).toBe(true);
    });
  });

  describe("decideEngine", () => {
    const ready = () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-test");
      vi.stubEnv("GEMINI_API_KEY", "g-test");
    };

    it("usa o LLM quando flag, provedor, chave, service role e limite permitem", async () => {
      ready();
      const decision = await decideEngine({
        db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "openai" } }).db,
        admin: fakeDb({ rateLimitValue: 12, recentRuns: 0 }).db,
        userId: "u1",
      });
      expect(decision).toEqual({ useLlm: true, engine: "openai", skippedBecause: null, rateLimitPerHour: 12 });
    });

    it("kill switch desligado força o determinístico mesmo com tudo configurado", async () => {
      ready();
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": false, "ai.provider": "openai" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, engine: "deterministic", skippedBecause: "ai_disabled" });
    });

    const killSwitchCases: Array<{ label: string; admin: FakeOptions | null; keys: boolean }> = [
      { label: "sem service role", admin: null, keys: true },
      { label: "usuário acima do limite", admin: { rateLimitValue: 3, recentRuns: 99 }, keys: true },
      { label: "sem chave de API", admin: {}, keys: false },
    ];

    it.each(killSwitchCases)("kill switch desligado tem precedência ($label): motivo é ai_disabled e o rate limit não é consultado", async ({ admin, keys }) => {
      if (keys) ready();
      const fakeAdmin = admin ? fakeDb(admin) : null;
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": false, "ai.provider": "openai" } }).db, admin: fakeAdmin?.db ?? null, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, engine: "deterministic", skippedBecause: "ai_disabled" });
      // recalculate grava metrics.error = "rate_limited" a partir desse motivo: com a IA desligada isso nunca pode acontecer
      expect(fakeAdmin?.calls.some((call) => call.table === "recommendation_runs") ?? false).toBe(false);
    });

    it("falha ao ler as configurações (exceção) desliga o LLM", async () => {
      ready();
      vi.stubEnv("AI_PROVIDER", "openai");
      const decision = await decideEngine({ db: fakeDb({ rpcThrows: true }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, skippedBecause: "ai_disabled" });
    });

    it("regressão: erro do rpc ({ data: null, error }, supabase-js não lança) desliga o LLM e não consulta o rate limit", async () => {
      ready();
      vi.stubEnv("AI_PROVIDER", "openai");
      const admin = fakeDb({ rateLimitValue: 12, recentRuns: 0 });
      const decision = await decideEngine({ db: fakeDb({ rpcError: true }).db, admin: admin.db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, engine: "deterministic", skippedBecause: "ai_disabled" });
      expect(admin.calls.some((call) => call.table === "recommendation_runs")).toBe(false);
      await expect(readPublicAiSettings(fakeDb({ rpcError: true }).db)).resolves.toEqual({ enabled: false, provider: null });
    });

    it("erro do rpc desliga o LLM mesmo que venha acompanhado de um payload que o ligaria", async () => {
      ready();
      const db = fakeDb({ rpcError: true, rpcData: { "ai.enabled": true, "ai.provider": "openai" } }).db;
      await expect(readPublicAiSettings(db)).resolves.toEqual({ enabled: false, provider: null });
      const decision = await decideEngine({ db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, skippedBecause: "ai_disabled" });
    });

    it("'ai.enabled' ausente desliga o LLM mesmo com provedor, chave e service role", async () => {
      ready();
      vi.stubEnv("AI_PROVIDER", "openai");
      const fromSettings = await decideEngine({ db: fakeDb({ settings: { "ai.provider": "openai" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(fromSettings).toMatchObject({ useLlm: false, skippedBecause: "ai_disabled" });
      const empty = await decideEngine({ db: fakeDb({ settings: {} }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(empty).toMatchObject({ useLlm: false, skippedBecause: "ai_disabled" });
    });

    it.each([["true"], [1], [null], ["yes"], [{}]])("'ai.enabled' não booleano (%j) é tratado como desligado", async (value) => {
      ready();
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": value, "ai.provider": "openai" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, skippedBecause: "ai_disabled" });
    });

    it.each([[null], ["ok"], [[{ "ai.enabled": true }]], [42]])("payload inesperado do rpc sem erro (%j) desliga o LLM", async (rpcData) => {
      ready();
      vi.stubEnv("AI_PROVIDER", "openai");
      const decision = await decideEngine({ db: fakeDb({ rpcData }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, skippedBecause: "ai_disabled" });
    });

    it("o valor semeado em 0008_seed.sql passa pelo kill switch (só não chama LLM porque o provedor semeado é o determinístico)", async () => {
      const seed = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0008_seed.sql"), "utf8");
      const seeded = (key: string): unknown => {
        const match = new RegExp(`\\('${key.replace(".", "\\.")}',\\s*'([^']*)'::jsonb`).exec(seed);
        if (!match) throw new Error(`chave ${key} não encontrada no seed`);
        return JSON.parse(match[1]) as unknown;
      };
      const settings = { "ai.enabled": seeded("ai.enabled"), "ai.provider": seeded("ai.provider") };
      expect(settings["ai.enabled"]).toBe(true);
      ready();
      await expect(readPublicAiSettings(fakeDb({ settings }).db)).resolves.toEqual({ enabled: true, provider: "deterministic" });
      const seededDecision = await decideEngine({ db: fakeDb({ settings }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(seededDecision).toMatchObject({ useLlm: false, skippedBecause: "provider_deterministic" });
      // trocar só o provedor (como o admin faz) libera o LLM: o 'ai.enabled' semeado continua habilitando
      const switched = await decideEngine({ db: fakeDb({ settings: { ...settings, "ai.provider": "openai" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(switched).toMatchObject({ useLlm: true, engine: "openai" });
    });

    it("provedor das configurações tem precedência sobre AI_PROVIDER", async () => {
      ready();
      vi.stubEnv("AI_PROVIDER", "openai");
      const deterministic = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "deterministic" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(deterministic).toMatchObject({ useLlm: false, skippedBecause: "provider_deterministic" });
      const gemini = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "gemini" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(gemini).toMatchObject({ useLlm: true, engine: "gemini" });
    });

    it("provedor inválido nas configurações cai para AI_PROVIDER", async () => {
      ready();
      vi.stubEnv("AI_PROVIDER", "gemini");
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "claude" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: true, engine: "gemini" });
    });

    it.each(["", "anthropic"])("sem provedor válido em lugar nenhum (AI_PROVIDER=%j) fica no determinístico", async (env) => {
      ready();
      vi.stubEnv("AI_PROVIDER", env);
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, engine: "deterministic", skippedBecause: "provider_deterministic" });
    });

    it("provedor sem chave de API não chama o LLM", async () => {
      vi.stubEnv("GEMINI_API_KEY", "g-test");
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "openai" } }).db, admin: fakeDb({}).db, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, skippedBecause: "missing_api_key" });
    });

    it("sem service role não usa o LLM (não teria como persistir nem limitar)", async () => {
      ready();
      const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "openai" } }).db, admin: null, userId: "u1" });
      expect(decision).toMatchObject({ useLlm: false, skippedBecause: "no_service_role", rateLimitPerHour: DEFAULT_RATE_LIMIT_PER_HOUR });
    });

    it("bloqueia ao atingir o limite de recálculos na última hora", async () => {
      ready();
      const db = fakeDb({ settings: { "ai.enabled": true, "ai.provider": "openai" } }).db;
      const atLimit = await decideEngine({ db, admin: fakeDb({ rateLimitValue: 3, recentRuns: 3 }).db, userId: "u1" });
      expect(atLimit).toEqual({ useLlm: false, engine: "deterministic", skippedBecause: "rate_limited", rateLimitPerHour: 3 });
      const below = await decideEngine({ db, admin: fakeDb({ rateLimitValue: 3, recentRuns: 2 }).db, userId: "u1" });
      expect(below).toMatchObject({ useLlm: true, engine: "openai" });
    });

    describe("rate limit falha fechado", () => {
      let warn: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      });
      afterEach(() => warn.mockRestore());

      it.each<[string, FakeOptions]>([
        ["erro da query ({ count: null, error })", { rateLimitValue: 12, runsError: true }],
        ["exceção na consulta", { rateLimitValue: 12, runsThrows: true }],
        ["count ausente sem erro", { rateLimitValue: 12, recentRuns: null }],
      ])("regressão: %s conta como limite atingido (nunca como 0 execuções)", async (_label, adminOpts) => {
        ready();
        const decision = await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "openai" } }).db, admin: fakeDb(adminOpts).db, userId: "u1" });
        expect(decision).toEqual({ useLlm: false, engine: "deterministic", skippedBecause: "rate_limited", rateLimitPerHour: 12 });
        await expect(countRecentRuns(fakeDb(adminOpts).db, "u1")).resolves.toBe(Number.POSITIVE_INFINITY);
        expect(warn).toHaveBeenCalled();
      });

      it("contagem válida é devolvida como está (inclusive 0) e não gera aviso", async () => {
        await expect(countRecentRuns(fakeDb({ recentRuns: 0 }).db, "u1")).resolves.toBe(0);
        await expect(countRecentRuns(fakeDb({ recentRuns: 5 }).db, "u1")).resolves.toBe(5);
        expect(warn).not.toHaveBeenCalled();
      });
    });

    it("conta só as execuções do próprio usuário na janela de 1 hora", async () => {
      ready();
      const admin = fakeDb({ rateLimitValue: 3, recentRuns: 0 });
      await decideEngine({ db: fakeDb({ settings: { "ai.enabled": true, "ai.provider": "openai" } }).db, admin: admin.db, userId: "u-42" });
      const runs = admin.calls.find((call) => call.table === "recommendation_runs");
      expect(runs?.ops).toContainEqual(["eq", ["user_id", "u-42"]]);
      expect(runs?.ops).toContainEqual(["gte", ["created_at", new Date(NOW - 60 * 60 * 1000).toISOString()]]);
    });
  });
});

// ---------------------------------------------------------------------------
// Provedores LLM: prompt, validação da saída e fallback
// ---------------------------------------------------------------------------

const CATALOG = [
  candidate({ content_id: "a", tags: ["sono"] }),
  candidate({ content_id: "b", pillar: "training" }),
  candidate({ content_id: "c", pillar: "nutrition" }),
  candidate({ content_id: "d", pillar: "gastronomy" }),
];
const OK_REASON = "Combina com seu interesse em sono.";
const llmOutput = (items: unknown[]) => JSON.stringify({ recommendations: items });

describe("validateOutput", () => {
  it("aceita só ids do catálogo e registra os descartados", () => {
    const result = validateOutput(
      llmOutput([
        { content_id: "a", reason: OK_REASON },
        { content_id: "ghost", reason: OK_REASON },
        { content_id: "b", reason: OK_REASON },
      ]),
      CATALOG,
      8,
    );
    expect(result.recommendations.map((r) => r.content_id)).toEqual(["a", "b"]);
    expect(result).toMatchObject({ returned: 3, valid: 2, discarded: ["id:ghost"] });
  });

  it("descarta ids repetidos", () => {
    const result = validateOutput(
      llmOutput([
        { content_id: "a", reason: OK_REASON },
        { content_id: "a", reason: "Outra justificativa." },
        { content_id: "b", reason: OK_REASON },
      ]),
      CATALOG,
      8,
    );
    expect(result.recommendations.map((r) => r.content_id)).toEqual(["a", "b"]);
    expect(result.recommendations[0].reason.params?.text).toBe(OK_REASON);
    expect(result.discarded).toEqual(["id:a"]);
  });

  it("score vem da posição (não do LLM) e a justificativa vira chave 'text'", () => {
    const result = validateOutput(
      llmOutput([
        { content_id: "a", reason: OK_REASON, score: 999 },
        { content_id: "b", reason: OK_REASON },
      ]),
      CATALOG,
      8,
    );
    expect(result.recommendations).toEqual([
      { content_id: "a", score: 8, reason: { key: "text", params: { text: OK_REASON } } },
      { content_id: "b", score: 7, reason: { key: "text", params: { text: OK_REASON } } },
    ]);
  });

  it("normaliza espaços da justificativa", () => {
    const result = validateOutput(llmOutput([{ content_id: "a", reason: "  Combina   com\n seu ritmo.  " }]), CATALOG, 8);
    expect(result.recommendations[0].reason).toEqual({ key: "text", params: { text: "Combina com seu ritmo." } });
  });

  it("descarta justificativa vazia", () => {
    const result = validateOutput(llmOutput([{ content_id: "a", reason: "   " }]), CATALOG, 8);
    expect(result.recommendations).toEqual([]);
    expect(result.discarded).toEqual(["reason:a"]);
  });

  it("aceita justificativa de até 140 caracteres e descarta acima disso", () => {
    expect(validateOutput(llmOutput([{ content_id: "a", reason: "x".repeat(140) }]), CATALOG, 8).valid).toBe(1);
    const tooLong = validateOutput(llmOutput([{ content_id: "a", reason: "x".repeat(141) }]), CATALOG, 8);
    expect(tooLong.valid).toBe(0);
    expect(tooLong.discarded).toEqual(["reason:a"]);
  });

  it.each([
    "Você deve assistir hoje.",
    "VOCÊ DEVE assistir hoje.",
    "You should try this today.",
    "You must train harder.",
    "Deberías cocinar esto.",
    "Ajuda a definir a dosagem ideal.",
    "Ideal para 1500 calorias por dia.",
    "Bom para tratamento de ansiedade.",
    "Receita para emagrecer rápido.",
    "Great way to lose weight.",
    "Útil antes do diagnóstico.",
    "Sin prescripción necesaria.",
    "Substitui o medicamento.",
    // cobertura de cada termo da lista de bloqueio nos três idiomas
    "Voce deve repetir isso amanhã.",
    "Ajusta a dose de cafeína.",
    "Bom para o tratamento da insônia.",
    "Defines the right dosage for you.",
    "Fits a 1500 calories per day plan.",
    "Pairs well with your medication.",
    "Useful as a treatment for back pain.",
    "Helps with the diagnosis of fatigue.",
    "Debes entrenar más.",
    "Ajusta la dosis de proteína.",
    "Ideal para 1500 calorías por día.",
    "Sustituye la medicación.",
    "Parte del tratamiento de la ansiedad.",
    "Receta para adelgazar rápido.",
  ])("descarta justificativa com termo de prescrição: %j", (reason) => {
    const result = validateOutput(llmOutput([{ content_id: "a", reason }]), CATALOG, 8);
    expect(result.recommendations).toEqual([]);
    expect(result.discarded).toEqual(["reason:a"]);
  });

  it("respeita o limite de itens", () => {
    const items = ["a", "b", "c", "d"].map((content_id) => ({ content_id, reason: OK_REASON }));
    const result = validateOutput(llmOutput(items), CATALOG, 2);
    expect(result.recommendations.map((r) => r.content_id)).toEqual(["a", "b"]);
    expect(result.returned).toBe(4);
  });

  it("lista vazia do provedor resulta em nenhuma recomendação", () => {
    expect(validateOutput(llmOutput([]), CATALOG, 8)).toEqual({ recommendations: [], returned: 0, valid: 0, discarded: [] });
  });

  it.each(["{recommendations: [", "```json\n{\"recommendations\":[]}\n```", "", "Aqui estão suas recomendações"])("rejeita JSON malformado: %j", (raw) => {
    expect(() => validateOutput(raw, CATALOG, 8)).toThrow(SyntaxError);
  });

  it.each([
    '{"items":[]}',
    '{"recommendations":"a,b"}',
    '{"recommendations":[{"content_id":1,"reason":"x"}]}',
    '{"recommendations":[{"content_id":"a"}]}',
    '[{"content_id":"a","reason":"x"}]',
    "null",
  ])("rejeita JSON fora do schema: %s", (raw) => {
    expect(() => validateOutput(raw, CATALOG, 8)).toThrow("invalid_schema");
  });

  it.each([
    "Substitui a medicação.",
    "SUBSTITUI A MEDICAÇÃO.",
    "Pode reduzir a medicacao.",
    "Funciona como um remédio natural.",
    "Melhor que remedio para dormir.",
    "Evita REMÉDIOS para o sono.",
    "Un remedio casero para dormir.",
  ])("regressão pt-BR: descarta 'medicação'/'remédio' com e sem acento: %j", (reason) => {
    const result = validateOutput(llmOutput([{ content_id: "a", reason }]), CATALOG, 8);
    expect(result.recommendations).toEqual([]);
    expect(result.discarded).toEqual(["reason:a"]);
  });

  it.each(["Deberias cocinar esto.", "Sustituye la medicacion.", "Ideal para 1500 calorias por dia.", "Util antes do diagnostico.", "Sin prescripcion necesaria.", "Voce DEVE treinar."])(
    "lista de bloqueio ignora acentos em todos os termos: %j",
    (reason) => {
      const result = validateOutput(llmOutput([{ content_id: "a", reason }]), CATALOG, 8);
      expect(result.discarded).toEqual(["reason:a"]);
    },
  );

  it.each(["Combina com seu interesse em nutrição e gastronomia.", "Ajuda a remediar uma rotina corrida com pausas curtas.", "Receita prática do módulo Chef."])(
    "justificativa educativa com acentos continua aceita: %j",
    (reason) => {
      const result = validateOutput(llmOutput([{ content_id: "a", reason }]), CATALOG, 8);
      expect(result.recommendations).toEqual([{ content_id: "a", score: 8, reason: { key: "text", params: { text: reason } } }]);
    },
  );

  it.each([0, -1, -10])("regressão: limit %i devolve nenhuma recomendação (como rankDeterministic)", (limit) => {
    const items = ["a", "b", "c"].map((content_id) => ({ content_id, reason: OK_REASON }));
    expect(validateOutput(llmOutput(items), CATALOG, limit)).toEqual({ recommendations: [], returned: 3, valid: 0, discarded: [] });
    expect(rankDeterministic(CATALOG, signals(), limit, NOW)).toEqual([]);
  });

  it("limit 0 ainda valida o schema", () => {
    expect(() => validateOutput('{"items":[]}', CATALOG, 0)).toThrow("invalid_schema");
  });

  it("limit 1 devolve exatamente 1 item com score 1", () => {
    const items = ["a", "b"].map((content_id) => ({ content_id, reason: OK_REASON }));
    const result = validateOutput(llmOutput(items), CATALOG, 1);
    expect(result.recommendations).toEqual([{ content_id: "a", score: 1, reason: { key: "text", params: { text: OK_REASON } } }]);
    expect(result).toMatchObject({ returned: 2, valid: 1, discarded: [] });
  });
});

describe("buildPrompt", () => {
  it("não envia o id do usuário nem campos fora do perfil agregado", () => {
    const prompt = buildPrompt(CATALOG, signals({ userId: "user-secret-uuid", interests: ["sono"] }), 8, NOW);
    expect(prompt.system).not.toContain("user-secret-uuid");
    expect(prompt.user).not.toContain("user-secret-uuid");
    const payload = JSON.parse(prompt.user) as { user: Record<string, unknown> };
    expect(Object.keys(payload.user).sort()).toEqual(["completed_count", "interests", "level", "pillar_affinity"]);
  });

  it(`envia só ids do catálogo e no máximo ${MAX_LLM_CANDIDATES} candidatos`, () => {
    const many = Array.from({ length: MAX_LLM_CANDIDATES + 15 }, (_, i) => candidate({ content_id: `c${i}` }));
    const payload = JSON.parse(buildPrompt(many, signals(), 8, NOW).user) as { candidates: Array<{ id: string }> };
    expect(payload.candidates).toHaveLength(MAX_LLM_CANDIDATES);
    expect(payload.candidates.map((c) => c.id)).toEqual(many.slice(0, MAX_LLM_CANDIDATES).map((c) => c.content_id));
  });

  it("não envia plano, módulo nem trava ao LLM e calcula dias desde a publicação", () => {
    const list = [candidate({ content_id: "a", published_at: daysAgo(3) }), candidate({ content_id: "b", published_at: daysAgo(-2) }), candidate({ content_id: "c" })];
    const prompt = buildPrompt(list, signals(), 8, NOW);
    const payload = JSON.parse(prompt.user) as { candidates: Array<Record<string, unknown>> };
    expect(payload.candidates.map(({ id, fresh_days }) => ({ id, fresh_days }))).toEqual([
      { id: "a", fresh_days: 3 },
      { id: "b", fresh_days: 0 },
      { id: "c", fresh_days: null },
    ]);
    for (const c of payload.candidates) {
      expect(c).not.toHaveProperty("locked");
      expect(c).not.toHaveProperty("module");
    }
    expect(prompt.system).not.toMatch(/locked|module/i);
  });

  it.each([
    ["pt-BR", "Brazilian Portuguese"],
    ["en", "English"],
    ["es", "Spanish"],
  ] as const)("pede a justificativa no idioma do usuário (%s)", (locale, language) => {
    const prompt = buildPrompt(CATALOG, signals({ locale }), 5, NOW);
    expect(prompt.system).toContain(`in ${language}`);
    expect(prompt.system).toContain("up to 5 items");
    expect((JSON.parse(prompt.user) as { return_up_to: number }).return_up_to).toBe(5);
  });
});

describe("estimateCost", () => {
  beforeEach(() => {
    for (const name of ["OPENAI_PRICE_IN_PER_1M", "OPENAI_PRICE_OUT_PER_1M", "GEMINI_PRICE_IN_PER_1M", "GEMINI_PRICE_OUT_PER_1M"]) vi.stubEnv(name, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("bate com a tabela do ADR-002 (3.000 entrada / 400 saída)", () => {
    expect(estimateCost("openai", "gpt-6-luna", 3000, 400)).toBeCloseTo(0.0005, 9);
    expect(estimateCost("gemini", "gemini-3.1-flash-lite", 3000, 400)).toBeCloseTo(0.00135, 9);
  });

  it("modelo desconhecido ou tokens ausentes resultam em custo nulo (não inventa)", () => {
    expect(estimateCost("openai", "modelo-inexistente", 3000, 400)).toBeNull();
    expect(estimateCost("openai", "gpt-6-luna", null, 400)).toBeNull();
    expect(estimateCost("gemini", "gemini-2.0-flash", 3000, null)).toBeNull();
  });

  it("preço por variável de ambiente sobrescreve a tabela do provedor certo", () => {
    vi.stubEnv("OPENAI_PRICE_IN_PER_1M", "1");
    vi.stubEnv("OPENAI_PRICE_OUT_PER_1M", "4");
    expect(estimateCost("openai", "modelo-inexistente", 1_000_000, 1_000_000)).toBe(5);
    expect(estimateCost("gemini", "modelo-inexistente", 1_000_000, 1_000_000)).toBeNull();
  });
});

describe("fetchJson / errorMessage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devolve o corpo JSON em caso de sucesso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hello: "mundo" }) })));
    await expect(fetchJson("https://example.test", {})).resolves.toEqual({ hello: "mundo" });
  });

  it("status HTTP de erro vira http_<status>", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(fetchJson("https://example.test", {})).rejects.toThrow("http_503");
  });

  it("estouro de tempo aborta a requisição e vira 'timeout'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    await expect(fetchJson("https://example.test", {}, 5)).rejects.toThrow("timeout");
  });

  it("errorMessage limita a 200 caracteres e aceita valores não-Error", () => {
    expect(errorMessage(new Error("x".repeat(500)))).toHaveLength(200);
    expect(errorMessage("falhou")).toBe("falhou");
  });
});

describe("provedores LLM: fallback e validação ponta a ponta", () => {
  type FetchArgs = [url: string, init: RequestInit];
  let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<unknown>>>;
  const respond = (payload: unknown, status = 200) => fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => payload });
  const s = signals({ userId: "user-secret-uuid", interests: ["sono"] });

  beforeEach(() => {
    for (const name of ["OPENAI_API_KEY", "GEMINI_API_KEY", "OPENAI_MODEL", "GEMINI_MODEL", "OPENAI_PRICE_IN_PER_1M", "OPENAI_PRICE_OUT_PER_1M", "GEMINI_PRICE_IN_PER_1M", "GEMINI_PRICE_OUT_PER_1M"]) {
      vi.stubEnv(name, "");
    }
    fetchMock = vi.fn<(...args: FetchArgs) => Promise<unknown>>();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const openAiText = (text: string) => ({ output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 3000, output_tokens: 400 } });
  const geminiText = (text: string, finishReason = "STOP") => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 400 },
  });

  it.each([
    ["openai", openAiEngine],
    ["gemini", geminiEngine],
  ] as const)("%s sem chave não faz chamada externa e devolve erro para o fallback", async (name, engine) => {
    const output = await engine.run({ candidates: CATALOG, signals: s, limit: 8 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.recommendations).toEqual([]);
    expect(output.metrics).toMatchObject({ engine: name, error: "missing_api_key", valid_rate: 0, is_fallback: false });
  });

  it("OpenAI: devolve só ids do catálogo e registra descartes nas métricas", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    respond(
      openAiText(
        llmOutput([
          { content_id: "a", reason: OK_REASON },
          { content_id: "inventado", reason: OK_REASON },
          { content_id: "b", reason: OK_REASON },
        ]),
      ),
    );
    const output = await openAiEngine.run({ candidates: CATALOG, signals: s, limit: 8 });
    expect(output.recommendations.map((r) => r.content_id)).toEqual(["a", "b"]);
    expect(output.metrics).toMatchObject({ engine: "openai", provider_model: "gpt-4o-mini", returned: 3, error: "discarded:1", is_fallback: false, input_tokens: 3000, output_tokens: 400 });
    expect(output.metrics.valid_rate).toBeCloseTo(2 / 3, 6);
    expect(output.metrics.cost_estimate_usd).toBeCloseTo(0.00069, 9);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(String(init.body)).not.toContain("user-secret-uuid");
  });

  it("OpenAI: JSON malformado vira lista vazia com erro (o chamador cai no determinístico)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    respond(openAiText('{"recommendations": [{"content_id": "a", "reason": "corta'));
    const output = await openAiEngine.run({ candidates: CATALOG, signals: s, limit: 8 });
    expect(output.recommendations).toEqual([]);
    expect(output.metrics.error).toEqual(expect.any(String));
    expect(output.metrics).toMatchObject({ returned: 0, valid_rate: 0, cost_estimate_usd: null });
  });

  it.each([
    ["recusa do modelo", () => ({ output: [{ type: "message", content: [{ type: "refusal", refusal: "não posso" }] }] }), 200, "refusal"],
    ["saída vazia", () => ({ output: [] }), 200, "empty_output"],
    ["erro do provedor", () => ({ error: { message: "quota" } }), 200, "provider_error: quota"],
    ["HTTP 429", () => ({}), 429, "http_429"],
  ])("OpenAI: %s vira erro nas métricas sem recomendações", async (_label, payload, status, error) => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    respond(payload(), status);
    const output = await openAiEngine.run({ candidates: CATALOG, signals: s, limit: 8 });
    expect(output.recommendations).toEqual([]);
    expect(output.metrics.error).toBe(error);
  });

  it("Gemini: chave vai no header (nunca na URL) e só ids do catálogo voltam", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-secret");
    respond(
      geminiText(
        llmOutput([
          { content_id: "c", reason: OK_REASON },
          { content_id: "zzz", reason: OK_REASON },
        ]),
      ),
    );
    const output = await geminiEngine.run({ candidates: CATALOG, signals: s, limit: 8 });
    expect(output.recommendations.map((r) => r.content_id)).toEqual(["c"]);
    expect(output.metrics).toMatchObject({ engine: "gemini", provider_model: "gemini-2.0-flash", returned: 2, valid_rate: 0.5, error: "discarded:1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("g-secret");
    expect(url).toContain("generativelanguage.googleapis.com");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-secret");
    expect(String(init.body)).not.toContain("user-secret-uuid");
  });

  it.each([
    ["corte por tokens", geminiText(llmOutput([{ content_id: "a", reason: OK_REASON }]), "MAX_TOKENS"), "finish_max_tokens"],
    ["bloqueio de segurança", geminiText("", "SAFETY"), "finish_safety"],
    ["schema inválido", geminiText('{"items":[]}'), "invalid_schema"],
    ["texto vazio", geminiText("   "), "empty_output"],
  ])("Gemini: %s vira erro nas métricas sem recomendações", async (_label, payload, error) => {
    vi.stubEnv("GEMINI_API_KEY", "g-secret");
    respond(payload);
    const output = await geminiEngine.run({ candidates: CATALOG, signals: s, limit: 8 });
    expect(output.recommendations).toEqual([]);
    expect(output.metrics).toMatchObject({ error, valid_rate: 0, is_fallback: false });
  });
});
