// Provedor OpenAI (Responses API) via fetch, saída estruturada por JSON Schema estrito.
// Só roda com OPENAI_API_KEY; qualquer falha vira erro nas métricas e o chamador usa o fallback.
import type { Engine, EngineInput, EngineOutput } from "../types";
import { LLM_TIMEOUT_MS } from "../types";
import { buildPrompt, errorMessage, estimateCost, fetchJson, OUTPUT_SCHEMA, validateOutput } from "./shared";

const DEFAULT_MODEL = "gpt-4o-mini";

type ResponsesPayload = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

function extractText(payload: ResponsesPayload): string {
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal") throw new Error("refusal");
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw new Error("empty_output");
}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const openAiEngine: Engine = {
  name: "openai",
  async run({ candidates, signals, limit, timeoutMs = LLM_TIMEOUT_MS }: EngineInput): Promise<EngineOutput> {
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const started = Date.now();
    const base = {
      engine: "openai" as const,
      provider_model: model,
      candidates: candidates.length,
      is_fallback: false,
    };
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { recommendations: [], metrics: { ...base, latency_ms: 0, input_tokens: null, output_tokens: null, cost_estimate_usd: null, returned: 0, valid_rate: 0, error: "missing_api_key" } };
    }
    const prompt = buildPrompt(candidates, signals, limit, started);
    try {
      const payload = (await fetchJson(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_output_tokens: 700,
            input: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            text: { format: { type: "json_schema", name: "recommendations", strict: true, schema: OUTPUT_SCHEMA } },
          }),
        },
        timeoutMs,
      )) as ResponsesPayload;
      if (payload.error?.message) throw new Error(`provider_error: ${payload.error.message}`);
      const text = extractText(payload);
      const result = validateOutput(text, candidates, limit);
      const inputTokens = payload.usage?.input_tokens ?? null;
      const outputTokens = payload.usage?.output_tokens ?? null;
      return {
        recommendations: result.recommendations,
        metrics: {
          ...base,
          latency_ms: Date.now() - started,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_estimate_usd: estimateCost("openai", model, inputTokens, outputTokens),
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
