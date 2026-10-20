// Harness de avaliação do motor de recomendações (ADR-002, seção 5).
// Roda os 10 cenários fixos contra o motor determinístico e, se houver chave, contra OpenAI/Gemini.
// Sem chaves funciona do mesmo jeito (só determinístico). Não precisa de banco: fixtures sintéticas.
// Uso: npx tsx scripts/eval-recommendations.ts [--runs=5] [--limit=8]
import { deterministicEngine } from "../src/lib/recommendations/deterministic";
import { geminiEngine, hasGeminiKey } from "../src/lib/recommendations/providers/gemini";
import { hasOpenAiKey, openAiEngine } from "../src/lib/recommendations/providers/openai";
import type { Candidate, Engine, EngineOutput, UserSignals } from "../src/lib/recommendations/types";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const RUNS = Math.max(1, Number(args.runs ?? 5));
const LIMIT = Math.max(1, Number(args.limit ?? 8));

// ---------------------------------------------------------------- fixtures (ids opacos, sem PII)
const MODULES = { base: "m-base", training_full: "m-training", nutrition_full: "m-nutrition", chef_full: "m-chef" } as const;
type Seed = [key: string, pillar: Candidate["pillar"], type: Candidate["type"], difficulty: Candidate["difficulty"], tags: string[], access: keyof typeof MODULES | "free", featured: boolean, ageDays: number];
const SEEDS: Seed[] = [
  ["r1", "routine", "video", "beginner", ["manha", "habitos", "sono"], "free", true, 40],
  ["r2", "routine", "guide", "beginner", ["sono", "habitos"], "free", false, 39],
  ["r3", "routine", "article", "beginner", ["foco", "produtividade"], "free", false, 38],
  ["r4", "routine", "video", "beginner", ["respiracao", "sono"], "free", false, 37],
  ["r5", "routine", "guide", "beginner", ["habitos", "autocuidado"], "base", false, 36],
  ["r6", "routine", "video", "beginner", ["sono", "mobilidade"], "base", false, 35],
  ["r7", "routine", "article", "beginner", ["habitos", "motivacao"], "free", false, 34],
  ["r8", "routine", "video", "beginner", ["planejamento", "produtividade"], "base", false, 33],
  ["r9", "routine", "guide", "beginner", ["sono"], "free", true, 32],
  ["r10", "routine", "video", "beginner", ["telas", "habitos"], "base", false, 31],
  ["t1", "training", "workout", "beginner", ["funcional", "forca", "iniciante"], "free", true, 30],
  ["t2", "training", "video", "beginner", ["mobilidade", "corrida"], "free", false, 29],
  ["t3", "training", "workout", "beginner", ["forca"], "base", false, 28],
  ["t4", "training", "workout", "beginner", ["corrida", "iniciante"], "free", false, 27],
  ["t5", "training", "video", "beginner", ["tecnica", "forca"], "free", false, 26],
  ["t6", "training", "workout", "beginner", ["core"], "base", false, 25],
  ["t7", "training", "workout", "intermediate", ["corrida", "hiit"], "training_full", false, 24],
  ["t8", "training", "guide", "beginner", ["corrida", "equipamento"], "free", false, 23],
  ["t9", "training", "workout", "intermediate", ["forca", "elastico"], "training_full", false, 22],
  ["t10", "training", "video", "beginner", ["corrida", "aquecimento"], "base", false, 21],
  ["n1", "nutrition", "guide", "beginner", ["basico", "porcoes"], "free", true, 20],
  ["n2", "nutrition", "article", "beginner", ["hidratacao"], "free", false, 19],
  ["n3", "nutrition", "guide", "beginner", ["rotulos"], "free", false, 18],
  ["n4", "nutrition", "video", "beginner", ["lanches", "praticidade"], "base", false, 17],
  ["n5", "nutrition", "guide", "beginner", ["planejamento"], "base", false, 16],
  ["n6", "nutrition", "article", "intermediate", ["proteina"], "nutrition_full", false, 15],
  ["n7", "nutrition", "video", "beginner", ["cafe", "praticidade"], "free", false, 14],
  ["n8", "nutrition", "guide", "beginner", ["fibras"], "base", false, 13],
  ["n9", "nutrition", "article", "intermediate", ["treino", "nutricao"], "nutrition_full", false, 12],
  ["n10", "nutrition", "video", "beginner", ["compras", "planejamento"], "free", false, 11],
  ["g1", "gastronomy", "recipe", "beginner", ["frango", "bowl"], "free", true, 10],
  ["g2", "gastronomy", "recipe", "beginner", ["ovos", "marmita"], "free", false, 9],
  ["g3", "gastronomy", "recipe", "beginner", ["molho", "basico"], "free", false, 8],
  ["g4", "gastronomy", "recipe", "beginner", ["arroz", "basico"], "free", false, 7],
  ["g5", "gastronomy", "recipe", "beginner", ["peixe", "forno"], "base", false, 6],
  ["g6", "gastronomy", "recipe", "beginner", ["sopa", "leguminosas"], "base", false, 5],
  ["g7", "gastronomy", "video", "beginner", ["tecnica", "facas"], "free", false, 4],
  ["g8", "gastronomy", "recipe", "beginner", ["marmita", "carne"], "chef_full", false, 3],
  ["g9", "gastronomy", "recipe", "beginner", ["cafe", "aveia"], "base", false, 2],
  ["g10", "gastronomy", "video", "advanced", ["tecnica", "organizacao"], "chef_full", false, 1],
];

const now = Date.now();
const CATALOG: Candidate[] = SEEDS.map(([key, pillar, type, difficulty, tags, access, featured, ageDays]) => ({
  content_id: `00000000-0000-4000-8000-${key.padStart(12, "0")}`,
  pillar,
  type,
  difficulty,
  tags,
  access_level: access === "free" ? "free" : "premium",
  required_module_id: access === "free" ? null : MODULES[access],
  required_module_name: access === "free" ? null : access,
  is_featured: featured,
  published_at: new Date(now - ageDays * 86_400_000).toISOString(),
}));

function signals(partial: Partial<UserSignals>): UserSignals {
  return { userId: null, locale: "pt-BR", interests: [], pillarAffinity: {}, difficultyLevel: "beginner", entitledModules: [], completedCount: 0, ...partial };
}

type Scenario = { name: string; signals: UserSignals; candidates: Candidate[] };
const SCENARIOS: Scenario[] = [
  { name: "1 novo sem interações", signals: signals({}), candidates: CATALOG },
  { name: "2 só hábitos", signals: signals({ interests: ["habitos", "sono"] }), candidates: CATALOG },
  { name: "3 treino iniciante", signals: signals({ interests: ["forca", "iniciante"], pillarAffinity: { training: 3 }, completedCount: 3 }), candidates: CATALOG },
  { name: "4 nutrição + gastronomia", signals: signals({ interests: ["planejamento", "marmita", "basico"], pillarAffinity: { nutrition: 2, gastronomy: 2 } }), candidates: CATALOG },
  { name: "5 interesse rotina, histórico treino", signals: signals({ interests: ["sono"], pillarAffinity: { training: 6 }, completedCount: 6 }), candidates: CATALOG },
  { name: "6 avançado", signals: signals({ interests: ["tecnica", "forca"], pillarAffinity: { training: 8, gastronomy: 4 }, difficultyLevel: "advanced", completedCount: 25, entitledModules: Object.values(MODULES) }), candidates: CATALOG },
  { name: "7 itens bloqueados por plano", signals: signals({ interests: ["marmita", "proteina", "hiit"] }), candidates: CATALOG },
  { name: "8 tags conflitantes", signals: signals({ interests: ["sono", "forca", "proteina", "tecnica", "corrida", "cafe"] }), candidates: CATALOG },
  { name: "9 usuário en", signals: signals({ locale: "en", interests: ["corrida", "hidratacao"] }), candidates: CATALOG },
  { name: "10 usuário es", signals: signals({ locale: "es", interests: ["habitos", "basico"] }), candidates: CATALOG },
];

// ---------------------------------------------------------------- métricas
const LANG_HINTS: Record<UserSignals["locale"], RegExp> = {
  "pt-BR": /\b(você|voce|para|porque|seu|sua|com|que|não|nao)\b/i,
  en: /\b(you|your|the|with|because|for|and)\b/i,
  es: /\b(tú|tu|para|porque|con|que|los|las|y)\b/i,
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

type Row = {
  cenário: string;
  motor: string;
  "p50 ms": number;
  "p95 ms": number;
  "JSON ok %": number;
  "conformidade %": number;
  "idioma ok %": string;
  itens: string;
  "tokens in/out": string;
  "US$/chamada": string;
  erro: string;
};

async function evaluate(engine: Engine, scenario: Scenario): Promise<Row> {
  const latencies: number[] = [];
  let jsonOk = 0;
  let conformity: number[] = [];
  let langOk = 0;
  let langTotal = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let tokenRuns = 0;
  let cost = 0;
  let costRuns = 0;
  let items = 0;
  let lastError = "";
  const validityErrors = /^(invalid_schema|empty_output|refusal|timeout|http_|provider_error|missing_api_key|finish_)/;

  for (let i = 0; i < RUNS; i++) {
    const output: EngineOutput = await engine.run({ candidates: scenario.candidates, signals: scenario.signals, limit: LIMIT });
    latencies.push(output.metrics.latency_ms);
    const failed = output.metrics.error !== null && validityErrors.test(output.metrics.error);
    if (!failed) jsonOk += 1;
    if (!failed) conformity.push(output.metrics.returned > 0 ? output.metrics.valid_rate : 0);
    if (output.metrics.error) lastError = output.metrics.error;
    items += output.recommendations.length;
    if (typeof output.metrics.input_tokens === "number" && typeof output.metrics.output_tokens === "number") {
      tokensIn += output.metrics.input_tokens;
      tokensOut += output.metrics.output_tokens;
      tokenRuns += 1;
    }
    if (typeof output.metrics.cost_estimate_usd === "number") {
      cost += output.metrics.cost_estimate_usd;
      costRuns += 1;
    }
    if (engine.name !== "deterministic") {
      for (const rec of output.recommendations) {
        const text = String(rec.reason.params?.text ?? "");
        langTotal += 1;
        if (LANG_HINTS[scenario.signals.locale].test(text)) langOk += 1;
      }
    }
  }
  if (engine.name === "deterministic") conformity = conformity.length ? conformity : [1];
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  return {
    cenário: scenario.name,
    motor: engine.name === "deterministic" ? "determinístico" : `${engine.name} (${process.env[engine.name === "openai" ? "OPENAI_MODEL" : "GEMINI_MODEL"] ?? "padrão"})`,
    "p50 ms": percentile(latencies, 50),
    "p95 ms": percentile(latencies, 95),
    "JSON ok %": Math.round((jsonOk / RUNS) * 100),
    "conformidade %": Math.round(avg(conformity) * 1000) / 10,
    "idioma ok %": engine.name === "deterministic" ? "n/a (chaves i18n)" : langTotal ? `${Math.round((langOk / langTotal) * 100)}` : "-",
    itens: `${(items / RUNS).toFixed(1)}/${LIMIT}`,
    "tokens in/out": tokenRuns ? `${Math.round(tokensIn / tokenRuns)}/${Math.round(tokensOut / tokenRuns)}` : "-",
    "US$/chamada": costRuns ? (cost / costRuns).toFixed(6) : "-",
    erro: lastError,
  };
}

// Verificações estruturais do determinístico (diversidade e exclusão de ids fora do catálogo).
function assertDeterministicInvariants(output: EngineOutput, scenario: Scenario): string[] {
  const problems: string[] = [];
  const allowed = new Set(scenario.candidates.map((c) => c.content_id));
  const perPillar = new Map<string, number>();
  const byId = new Map(scenario.candidates.map((c) => [c.content_id, c]));
  for (const rec of output.recommendations.slice(0, 8)) {
    if (!allowed.has(rec.content_id)) problems.push(`id fora do catálogo: ${rec.content_id}`);
    const pillar = byId.get(rec.content_id)?.pillar ?? "?";
    perPillar.set(pillar, (perPillar.get(pillar) ?? 0) + 1);
  }
  const pillars = new Set(scenario.candidates.map((c) => c.pillar)).size;
  for (const [pillar, n] of perPillar) {
    if (n > 3 && pillars >= 3) problems.push(`mais de 3 itens do pilar ${pillar} no top 8`);
  }
  if (new Set(output.recommendations.map((r) => r.content_id)).size !== output.recommendations.length) problems.push("ids duplicados");
  return problems;
}

async function main() {
  const engines: Engine[] = [deterministicEngine];
  if (hasOpenAiKey()) engines.push(openAiEngine);
  if (hasGeminiKey()) engines.push(geminiEngine);

  console.log(`Ultra Hero · eval de recomendações · ${SCENARIOS.length} cenários × ${RUNS} execuções · limite ${LIMIT}`);
  console.log(`Motores: ${engines.map((e) => e.name).join(", ")}${engines.length === 1 ? " (sem OPENAI_API_KEY/GEMINI_API_KEY: só o fallback)" : ""}`);

  const rows: Row[] = [];
  const invariantProblems: string[] = [];
  for (const scenario of SCENARIOS) {
    for (const engine of engines) {
      rows.push(await evaluate(engine, scenario));
    }
    const sample = await deterministicEngine.run({ candidates: scenario.candidates, signals: scenario.signals, limit: LIMIT });
    for (const problem of assertDeterministicInvariants(sample, scenario)) invariantProblems.push(`[${scenario.name}] ${problem}`);
  }
  console.table(rows);

  // Amostra legível do determinístico (top 3 do cenário 2) para inspeção manual das justificativas.
  const sample = await deterministicEngine.run({ candidates: CATALOG, signals: SCENARIOS[1].signals, limit: 3 });
  console.log("Amostra determinística (cenário 2):", sample.recommendations.map((r) => `${r.content_id.slice(-3)} score=${r.score} ${JSON.stringify(r.reason)}`).join(" | "));

  if (invariantProblems.length > 0) {
    console.error(`✗ ${invariantProblems.length} violação(ões) de invariantes:`);
    for (const p of invariantProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("✓ Invariantes do determinístico ok (ids do catálogo, sem duplicatas, ≤3 por pilar no top 8).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
