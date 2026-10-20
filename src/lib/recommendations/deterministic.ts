// Motor determinístico (fallback obrigatório): regras simples, sempre disponível, sem chamadas externas.
// score = interesses×3 + afinidade de pilar×2 + ajuste de dificuldade + novidade + destaque − trava premium.
import type { Pillar } from "@/lib/supabase/helpers";
import type { Candidate, Difficulty, Engine, EngineInput, EngineOutput, Reason, Recommendation, UserSignals } from "./types";
import { MAX_PER_PILLAR_TOP } from "./types";

const DIFFICULTY_INDEX: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const FRESH_WINDOW_DAYS = 30;

type Scored = { candidate: Candidate; score: number; reason: Reason };

function freshness(publishedAt: string | null, now: number): number {
  if (!publishedAt) return 0;
  const ageDays = (now - new Date(publishedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  return Math.max(0, 1 - ageDays / FRESH_WINDOW_DAYS);
}

function difficultyFit(candidate: Difficulty | null, level: Difficulty): number {
  if (!candidate) return 0.5;
  const distance = Math.abs(DIFFICULTY_INDEX[candidate] - DIFFICULTY_INDEX[level]);
  return distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
}

export function scoreCandidate(candidate: Candidate, signals: UserSignals, now = Date.now()): Scored {
  const interestSet = new Set(signals.interests);
  const matchedTags = candidate.tags.filter((tag) => interestSet.has(tag));
  const interestScore = matchedTags.length * 3;

  const affinityValues = Object.values(signals.pillarAffinity).filter((v): v is number => typeof v === "number");
  const maxAffinity = affinityValues.length > 0 ? Math.max(...affinityValues) : 0;
  const affinity = signals.pillarAffinity[candidate.pillar as Pillar] ?? 0;
  const pillarScore = maxAffinity > 0 ? (affinity / maxAffinity) * 2 : 0;

  const fit = difficultyFit(candidate.difficulty, signals.difficultyLevel);
  const fresh = freshness(candidate.published_at, now);
  const featured = candidate.is_featured ? 0.75 : 0;
  const locked = candidate.access_level === "premium" && candidate.required_module_id !== null && !signals.entitledModules.includes(candidate.required_module_id);
  const lockPenalty = locked ? 0.5 : 0;

  const score = interestScore + pillarScore + fit + fresh + featured - lockPenalty;

  // Justificativa = componente que mais contribuiu (ordem de prioridade em empates).
  let reason: Reason = { key: "generic" };
  if (matchedTags.length > 0) reason = { key: "interest", params: { tag: matchedTags[0] } };
  else if (pillarScore >= 1.5) reason = { key: "pillar", params: { pillar: candidate.pillar } };
  else if (featured > 0) reason = { key: "featured" };
  else if (fresh >= 0.5) reason = { key: "fresh" };
  else if (fit === 1 && candidate.difficulty) reason = { key: "difficulty" };

  return { candidate, score: Math.round(score * 1000) / 1000, reason };
}

// Diversidade: no topo (até `limit`) no máximo N itens por pilar; completa com o restante se faltar.
export function diversify(sorted: Scored[], limit: number, maxPerPillar = MAX_PER_PILLAR_TOP): Scored[] {
  const picked: Scored[] = [];
  const perPillar = new Map<string, number>();
  const skipped: Scored[] = [];
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const count = perPillar.get(item.candidate.pillar) ?? 0;
    if (count >= maxPerPillar) {
      skipped.push(item);
      continue;
    }
    perPillar.set(item.candidate.pillar, count + 1);
    picked.push(item);
  }
  for (const item of skipped) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked;
}

export function rankDeterministic(candidates: Candidate[], signals: UserSignals, limit: number, now = Date.now()): Recommendation[] {
  const scored = candidates.map((candidate) => scoreCandidate(candidate, signals, now));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = a.candidate.published_at ? new Date(a.candidate.published_at).getTime() : 0;
    const tb = b.candidate.published_at ? new Date(b.candidate.published_at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.candidate.content_id.localeCompare(b.candidate.content_id);
  });
  return diversify(scored, limit).map((item) => ({ content_id: item.candidate.content_id, score: item.score, reason: item.reason }));
}

export const deterministicEngine: Engine = {
  name: "deterministic",
  async run({ candidates, signals, limit }: EngineInput): Promise<EngineOutput> {
    const started = Date.now();
    const recommendations = rankDeterministic(candidates, signals, limit, started);
    return {
      recommendations,
      metrics: {
        engine: "deterministic",
        provider_model: null,
        latency_ms: Date.now() - started,
        input_tokens: 0,
        output_tokens: 0,
        cost_estimate_usd: 0,
        candidates: candidates.length,
        returned: recommendations.length,
        valid_rate: 1,
        error: null,
        is_fallback: true,
      },
    };
  },
};
