// Partes comuns aos provedores LLM: prompt sem PII, schema JSON, validação da saída e custo estimado.
import { z } from "zod";
import type { Candidate, EngineName, Recommendation, UserSignals } from "../types";
import { LLM_TIMEOUT_MS, MAX_LLM_CANDIDATES } from "../types";

const LANGUAGE_NAMES: Record<UserSignals["locale"], string> = { "pt-BR": "Brazilian Portuguese", en: "English", es: "Spanish" };
const MAX_REASON_CHARS = 140;

// Termos que sugerem prescrição individual: a justificativa é descartada (e o item com ela).
// Escritos SEM acento: o texto é comparado depois de remover diacríticos (ver hasBlockedTerm),
// então "medicação"/"medicacao", "remédio"/"remedio", "deberías"/"deberias" etc. caem igualmente.
const BLOCKLIST =
  /(voce deve|you must|you should|debes|deberias|dose|dosagem|dosage|dosis|calorias por dia|calories per day|prescri|diagnos|medicamento|medicacao|medication|medicacion|remedio|tratamento|treatment|tratamiento|emagre|lose weight|adelgaz)/i;

function hasBlockedTerm(text: string): boolean {
  return BLOCKLIST.test(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content_id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["content_id", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

const outputZod = z.object({
  recommendations: z.array(z.object({ content_id: z.string(), reason: z.string() })),
});

export type PromptPayload = { system: string; user: string };

// Só ids opacos, tags, pilares, dificuldade e sinais agregados. Nunca nome, e-mail ou texto livre do usuário.
export function buildPrompt(candidates: Candidate[], signals: UserSignals, limit: number, now = Date.now()): PromptPayload {
  const language = LANGUAGE_NAMES[signals.locale] ?? LANGUAGE_NAMES["pt-BR"];
  const system = [
    "You rank items from a fixed catalog of short educational wellness content (routine, training, nutrition, gastronomy).",
    `Return exactly the JSON schema requested: up to ${limit} items, best first, ONLY ids that appear in the candidate list.`,
    `Each "reason" is ONE short sentence (max ${MAX_REASON_CHARS} characters) in ${language}, explaining why the item fits the user's declared interests or recent activity.`,
    "Never give health, diet, medical or training prescriptions; never use imperative advice; never mention the user by name.",
    "Prefer items the user can open now (locked=false); if you include locked=true items, say they belong to a module.",
    "Favor variety across pillars (at most 3 per pillar in the top 8).",
  ].join(" ");

  const trimmed = candidates.slice(0, MAX_LLM_CANDIDATES).map((c) => ({
    id: c.content_id,
    pillar: c.pillar,
    type: c.type,
    difficulty: c.difficulty,
    tags: c.tags,
    locked: c.access_level === "premium" && c.required_module_id !== null && !signals.entitledModules.includes(c.required_module_id),
    module: c.required_module_name,
    featured: c.is_featured,
    fresh_days: c.published_at ? Math.max(0, Math.round((now - new Date(c.published_at).getTime()) / 86_400_000)) : null,
  }));

  const user = JSON.stringify({
    user: {
      interests: signals.interests,
      pillar_affinity: signals.pillarAffinity,
      level: signals.difficultyLevel,
      completed_count: signals.completedCount,
    },
    candidates: trimmed,
    return_up_to: limit,
  });
  return { system, user };
}

export type ValidationResult = { recommendations: Recommendation[]; returned: number; valid: number; discarded: string[] };

// Valida o JSON do provedor: schema, ids no catálogo, sem duplicatas, justificativa curta e sem termos bloqueados.
export function validateOutput(raw: string, candidates: Candidate[], limit: number): ValidationResult {
  const parsed = outputZod.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("invalid_schema");
  const allowed = new Set(candidates.map((c) => c.content_id));
  const seen = new Set<string>();
  const discarded: string[] = [];
  const recommendations: Recommendation[] = [];
  const total = parsed.data.recommendations.length;
  for (const item of parsed.data.recommendations) {
    // limite checado antes de aceitar: limit <= 0 devolve [] (como rankDeterministic)
    if (recommendations.length >= limit) break;
    if (!allowed.has(item.content_id) || seen.has(item.content_id)) {
      discarded.push(`id:${item.content_id}`);
      continue;
    }
    const reason = item.reason.trim().replace(/\s+/g, " ");
    if (reason.length === 0 || reason.length > MAX_REASON_CHARS || hasBlockedTerm(reason)) {
      discarded.push(`reason:${item.content_id}`);
      continue;
    }
    seen.add(item.content_id);
    recommendations.push({ content_id: item.content_id, score: Math.max(0, limit - recommendations.length), reason: { key: "text", params: { text: reason } } });
  }
  return { recommendations, returned: total, valid: recommendations.length, discarded };
}

// Tabela de preços (US$ por 1M tokens). Env sobrescreve; modelo desconhecido → custo nulo (não inventa).
const PRICE_TABLE: Record<string, [number, number]> = {
  "gpt-6-luna": [0.1, 0.5],
  "gpt-6.1-sol": [2, 10],
  "gpt-5-nano": [0.05, 0.4],
  "gpt-4o-mini": [0.15, 0.6],
  "gemini-3.1-flash-lite": [0.25, 1.5],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gemini-3.8-flash": [0.75, 3.75],
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gemini-2.0-flash": [0.1, 0.4],
};

export function estimateCost(provider: Exclude<EngineName, "deterministic">, model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const prefix = provider === "openai" ? "OPENAI" : "GEMINI";
  const envIn = Number(process.env[`${prefix}_PRICE_IN_PER_1M`]);
  const envOut = Number(process.env[`${prefix}_PRICE_OUT_PER_1M`]);
  const [priceIn, priceOut] = Number.isFinite(envIn) && Number.isFinite(envOut) && envIn > 0 ? [envIn, envOut] : (PRICE_TABLE[model] ?? [NaN, NaN]);
  if (!Number.isFinite(priceIn) || inputTokens === null || outputTokens === null) return null;
  return Math.round(((inputTokens * priceIn + outputTokens * priceOut) / 1_000_000) * 1_000_000) / 1_000_000;
}

// fetch com timeout (AbortController). Lança "timeout" ou "http_<status>".
export async function fetchJson(url: string, init: RequestInit, timeoutMs = LLM_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return String(error).slice(0, 200);
}
