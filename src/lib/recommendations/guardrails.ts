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
export async function readPublicAiSettings(db: Db): Promise<{ enabled: boolean; provider: EngineName | null }> {
  try {
    const { data } = await db.rpc("public_settings");
    const settings = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    return { enabled: settings["ai.enabled"] !== false, provider: asEngine(settings["ai.provider"]) };
  } catch {
    return { enabled: false, provider: null };
  }
}

// app_settings só é legível por admin/service role: sem admin, usa o padrão.
export async function readRateLimit(admin: Db | null): Promise<number> {
  if (!admin) return DEFAULT_RATE_LIMIT_PER_HOUR;
  const { data } = await admin.from("app_settings").select("value").eq("key", "ai.rate_limit_per_hour").maybeSingle();
  const value = Number(data?.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_RATE_LIMIT_PER_HOUR;
}

export async function countRecentRuns(admin: Db, userId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("recommendation_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  return count ?? 0;
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
