// Provedor Google Gemini (Gemini API) via fetch, com responseSchema JSON.
// Só roda com GEMINI_API_KEY (tier pago: o gratuito treina com os dados — ver ADR-002).
import type { Engine, EngineInput, EngineOutput } from "../types";
import { LLM_TIMEOUT_MS } from "../types";
import { buildPrompt, errorMessage, estimateCost, fetchJson, validateOutput } from "./shared";

const DEFAULT_MODEL = "gemini-2.0-flash";

// Subconjunto de schema aceito pelo Gemini (sem additionalProperties).
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: { content_id: { type: "string" }, reason: { type: "string" } },
        required: ["content_id", "reason"],
      },
    },
  },
  required: ["recommendations"],
};

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
};

function extractText(payload: GeminiPayload): string {
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error(`finish_${candidate.finishReason.toLowerCase()}`);
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("empty_output");
  return text;
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export const geminiEngine: Engine = {
  name: "gemini",
  async run({ candidates, signals, limit, timeoutMs = LLM_TIMEOUT_MS }: EngineInput): Promise<EngineOutput> {
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const started = Date.now();
    const base = { engine: "gemini" as const, provider_model: model, candidates: candidates.length, is_fallback: false };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { recommendations: [], metrics: { ...base, latency_ms: 0, input_tokens: null, output_tokens: null, cost_estimate_usd: null, returned: 0, valid_rate: 0, error: "missing_api_key" } };
    }
    const prompt = buildPrompt(candidates, signals, limit, started);
    try {
      const payload = (await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          // chave no header (não na URL) para não vazar em logs de proxy
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: prompt.system }] },
            contents: [{ role: "user", parts: [{ text: prompt.user }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 700, responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA },
          }),
        },
        timeoutMs,
      )) as GeminiPayload;
      if (payload.error?.message) throw new Error(`provider_error: ${payload.error.message}`);
      const text = extractText(payload);
      const result = validateOutput(text, candidates, limit);
      const inputTokens = payload.usageMetadata?.promptTokenCount ?? null;
      const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? null;
      return {
        recommendations: result.recommendations,
        metrics: {
          ...base,
          latency_ms: Date.now() - started,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_estimate_usd: estimateCost("gemini", model, inputTokens, outputTokens),
          returned: result.returned,
          valid_rate: result.returned > 0 ? result.valid / result.returned : 0,
          error: result.discarded.length > 0 ? `discarded:${result.discarded.length}` : null,
        },
      };
    } catch (error) {
      return {
        recommendations: [],
        metrics: { ...base, latency_ms: Date.now() - started, input_tokens: null, output_tokens: null, cost_estimate_usd: null, returned: 0, valid_rate: 0, error: errorMessage(error) },
      };
    }
  },
};
