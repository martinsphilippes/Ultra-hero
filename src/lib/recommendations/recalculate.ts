import "server-only";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadCandidates, type Db } from "./candidates";
import { deterministicEngine } from "./deterministic";
import { decideEngine } from "./guardrails";
import { geminiEngine } from "./providers/gemini";
import { openAiEngine } from "./providers/openai";
import { serializeReason } from "./reasons";
import { loadSignals } from "./signals";
import type { EngineName, EngineOutput, RecalcTrigger, Recommendation, RunMetrics } from "./types";
import { MIN_VALID_LLM_ITEMS, RECOMMENDATION_LIMIT } from "./types";

export type RecalcResult = {
  recommendations: Recommendation[];
  engine: EngineName;
  is_fallback: boolean;
  metrics: RunMetrics;
  runs: RunMetrics[];
  persisted: boolean;
  generated_at: string;
};

// Recalcula e persiste as recomendações de um usuário. Escrita em user_recommendations exige service role;
// sem ela, devolve o resultado sem persistir e avisa no log (nunca finge que gravou).
export async function recalculateRecommendations(userId: string, trigger: RecalcTrigger): Promise<RecalcResult> {
  const admin: Db | null = hasAdminClient() ? (createAdminClient() as unknown as Db) : null;
  const db: Db = admin ?? ((await createClient()) as unknown as Db);

  const [candidates, signals] = await Promise.all([loadCandidates(db, userId), loadSignals(db, userId)]);
  const decision = await decideEngine({ db, admin, userId });

  const runs: RunMetrics[] = [];
  let output: EngineOutput | null = null;

  if (decision.useLlm) {
    const engine = decision.engine === "openai" ? openAiEngine : geminiEngine;
    const attempt = await engine.run({ candidates, signals, limit: RECOMMENDATION_LIMIT });
    runs.push(attempt.metrics);
    if (attempt.recommendations.length >= MIN_VALID_LLM_ITEMS) {
      output = attempt;
    } else {
      console.warn(`[recommendations] ${engine.name} falhou ou devolveu poucos itens válidos (${attempt.recommendations.length}); usando fallback determinístico. erro=${attempt.metrics.error ?? "n/a"}`);
    }
  }

  if (!output) {
    const fallback = await deterministicEngine.run({ candidates, signals, limit: RECOMMENDATION_LIMIT });
    if (decision.skippedBecause === "rate_limited") fallback.metrics.error = "rate_limited";
    else if (decision.useLlm) fallback.metrics.error = `llm_fallback:${decision.engine}`;
    runs.push(fallback.metrics);
    output = fallback;
  }

  const generatedAt = new Date().toISOString();
  let persisted = false;

  if (admin) {
    const rows = output.recommendations.map((rec, index) => ({
      user_id: userId,
      content_id: rec.content_id,
      rank: index + 1,
      score: rec.score,
      reason: serializeReason(rec.reason),
      engine: output!.metrics.engine,
      is_fallback: output!.metrics.is_fallback,
      generated_at: generatedAt,
    }));
    const { error: deleteError } = await admin.from("user_recommendations").delete().eq("user_id", userId);
    if (deleteError) console.error("[recommendations] falha ao limpar user_recommendations:", deleteError.message);
    if (rows.length > 0) {
      const { error: insertError } = await admin.from("user_recommendations").insert(rows);
      if (insertError) console.error("[recommendations] falha ao gravar user_recommendations:", insertError.message);
      else persisted = true;
    } else {
      persisted = !deleteError;
    }
    const { error: runError } = await admin.from("recommendation_runs").insert(
      runs.map((m) => ({
        user_id: userId,
        trigger,
        engine: m.engine,
        provider_model: m.provider_model,
        latency_ms: m.latency_ms,
        input_tokens: m.input_tokens,
        output_tokens: m.output_tokens,
        cost_estimate_usd: m.cost_estimate_usd,
        candidates: m.candidates,
        returned: m.returned,
        valid_rate: Math.round(m.valid_rate * 10_000) / 10_000,
        error: m.error,
      })),
    );
    if (runError) console.error("[recommendations] falha ao gravar recommendation_runs:", runError.message);
  } else {
    console.warn("[recommendations] SUPABASE_SERVICE_ROLE_KEY ausente: recomendações calculadas, mas NÃO persistidas.");
  }

  return {
    recommendations: output.recommendations,
    engine: output.metrics.engine,
    is_fallback: output.metrics.is_fallback,
    metrics: output.metrics,
    runs,
    persisted,
    generated_at: generatedAt,
  };
}
