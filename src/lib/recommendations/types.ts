// Contratos do motor de recomendações. Sem imports de runtime (serve no app e no script de eval).
import type { AccessLevel, ContentType, Pillar } from "@/lib/supabase/helpers";

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type EngineName = "deterministic" | "openai" | "gemini";
export type RecalcTrigger = "interests_changed" | "stale" | "onboarding" | "manual" | "eval";
export type UiLocale = "pt-BR" | "en" | "es";

// Item do catálogo elegível. Só ids opacos e metadados; nunca PII.
export type Candidate = {
  content_id: string;
  pillar: Pillar;
  type: ContentType;
  difficulty: Difficulty | null;
  tags: string[];
  access_level: AccessLevel;
  is_featured: boolean;
  published_at: string | null;
};

// Sinais do usuário (derivados no servidor). Nada de nome, e-mail ou texto livre.
export type UserSignals = {
  userId: string | null;
  locale: UiLocale;
  interests: string[];
  pillarAffinity: Partial<Record<Pillar, number>>;
  difficultyLevel: Difficulty;
  completedCount: number;
};

// Justificativa como chave de tradução + parâmetros (texto livre só vem do LLM).
export type ReasonKey = "interest" | "pillar" | "difficulty" | "fresh" | "featured" | "text" | "generic";
export type Reason = { key: ReasonKey; params?: Record<string, string | number> };

export type Recommendation = { content_id: string; score: number; reason: Reason };

export type RunMetrics = {
  engine: EngineName;
  provider_model: string | null;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate_usd: number | null;
  candidates: number;
  returned: number;
  valid_rate: number;
  error: string | null;
  is_fallback: boolean;
};

export type EngineInput = {
  candidates: Candidate[];
  signals: UserSignals;
  limit: number;
  timeoutMs?: number;
};

export type EngineOutput = { recommendations: Recommendation[]; metrics: RunMetrics };

export interface Engine {
  readonly name: EngineName;
  run(input: EngineInput): Promise<EngineOutput>;
}

export const RECOMMENDATION_LIMIT = 8;
export const MAX_CANDIDATES = 200;
export const MAX_LLM_CANDIDATES = 60;
export const MAX_PER_PILLAR_TOP = 3;
export const LLM_TIMEOUT_MS = 8_000;
export const MIN_VALID_LLM_ITEMS = 3;
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
