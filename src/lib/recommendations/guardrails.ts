// Guardrails do LLM: kill switch (app_settings 'ai.enabled' + env AI_PROVIDER), chave presente,
// rate limit por usuário (recommendation_runs na última hora vs 'ai.rate_limit_per_hour') e teto de candidatos.
import type { Db } from "./candidates";
import { hasGeminiKey } from "./providers/gemini";
import { hasOpenAiKey } from "./providers/openai";
import type { EngineName } from "./types";

export const DEFAULT_RATE_LIMIT_PER_HOUR = 12;

export type AiDecision = {
  useLlm: boolean;
  engine: EngineName;
  // motivo de NÃO usar o LLM (informativo; vira erro só quando é rate limit)
  skippedBecause: "ai_disabled" | "provider_deterministic" | "missing_api_key" | "no_service_role" | "rate_limited" | null;
  rateLimitPerHour: number;
};

function asEngine(value: unknown): EngineName | null {
  return value === "openai" || value === "gemini" || value === "deterministic" ? value : null;
}

// Configurações públicas (rpc public_settings expõe só chaves não sensíveis).
// Kill switch falha FECHADO: o LLM só é permitido com 'ai.enabled' === true (o seed grava 'true'::jsonb e o
// admin grava boolean). Erro do rpc (supabase-js devolve { data: null, error } em vez de lançar), exceção,
// payload inesperado ou chave ausente/não booleana → IA desligada.
export async function readPublicAiSettings(db: Db): Promise<{ enabled: boolean; provider: EngineName | null }> {
  const disabled = { enabled: false, provider: null };
  try {
    const { data, error } = await db.rpc("public_settings");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return disabled;
    const settings = data as Record<string, unknown>;
    return { enabled: settings["ai.enabled"] === true, provider: asEngine(settings["ai.provider"]) };
  } catch {
    return disabled;
  }
}

// app_settings só é legível por admin/service role: sem admin, usa o padrão.
export async function readRateLimit(admin: Db | null): Promise<number> {
  if (!admin) return DEFAULT_RATE_LIMIT_PER_HOUR;
  const { data } = await admin.from("app_settings").select("value").eq("key", "ai.rate_limit_per_hour").maybeSingle();
  const value = Number(data?.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_RATE_LIMIT_PER_HOUR;
}

// Execuções do usuário na última hora. Rate limit falha FECHADO: se a contagem não puder ser lida
// (erro da query, exceção ou count ausente), devolve Infinity para que qualquer `runs >= limite` bloqueie o LLM.
export async function countRecentRuns(admin: Db, userId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const { count, error } = await admin.from("recommendation_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if (!error && typeof count === "number" && Number.isFinite(count)) return count;
    console.warn(`[recommendations] não foi possível contar recommendation_runs (${error?.message ?? "count ausente"}); tratando como acima do limite.`);
  } catch (error) {
    console.warn("[recommendations] falha ao contar recommendation_runs; tratando como acima do limite:", error instanceof Error ? error.message : error);
  }
  return Number.POSITIVE_INFINITY;
}

export function providerHasKey(engine: EngineName): boolean {
  if (engine === "openai") return hasOpenAiKey();
  if (engine === "gemini") return hasGeminiKey();
  return true;
}

// Decide o motor. O LLM só roda com: flag ligada, provedor configurado, chave presente,
// service role disponível (para persistir e aplicar rate limit) e usuário dentro do limite.
export async function decideEngine(params: { db: Db; admin: Db | null; userId: string | null }): Promise<AiDecision> {
  const settings = await readPublicAiSettings(params.db);
  const envProvider = asEngine(process.env.AI_PROVIDER);
  const provider: EngineName = settings.provider ?? envProvider ?? "deterministic";
  const rateLimitPerHour = await readRateLimit(params.admin);
  const deterministic = (skippedBecause: AiDecision["skippedBecause"]): AiDecision => ({ useLlm: false, engine: "deterministic", skippedBecause, rateLimitPerHour });

  if (!settings.enabled) return deterministic("ai_disabled");
  if (provider === "deterministic") return deterministic("provider_deterministic");
  if (!providerHasKey(provider)) return deterministic("missing_api_key");
  if (!params.admin) return deterministic("no_service_role");
  if (params.userId) {
    const runs = await countRecentRuns(params.admin, params.userId);
    if (runs >= rateLimitPerHour) return deterministic("rate_limited");
  }
  return { useLlm: true, engine: provider, skippedBecause: null, rateLimitPerHour };
}
