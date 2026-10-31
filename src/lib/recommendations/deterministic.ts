// Motor determinístico (fallback obrigatório): regras simples, sempre disponível, sem chamadas externas.
// score = interesses×3 + afinidade de pilar×2 + ajuste de dificuldade + novidade + destaque.
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
  const score = interestScore + pillarScore + fit + fresh + featured;

  return { candidate, score: Math.round(score * 1000) / 1000, reason: pickReason({ candidate, matchedTags, interestScore, pillarScore, featured, fresh, fit }) };
}

// Mínimos para um componente virar justificativa: abaixo disso a frase exibida seria fraca ou falsa
// ("que você tem explorado" para um pilar secundário, "novidade" para item de quase um mês, "no seu nível" sem nível exato).
const PILLAR_REASON_MIN = 1.5; // ≥ 75% da afinidade do pilar mais explorado
const FRESH_REASON_MIN = 0.5; // publicado há no máximo metade da janela (15 dias)

// Justificativa = componente que MAIS contribuiu para o score, entre os que passam do mínimo para ser
// afirmado ao usuário; empate exato segue a ordem de prioridade interesse > pilar > destaque > novidade > dificuldade.
// Nenhum elegível → genérica. Assim o "por que recomendamos" é verdadeiro e aponta o fator dominante.
function pickReason(parts: { candidate: Candidate; matchedTags: string[]; interestScore: number; pillarScore: number; featured: number; fresh: number; fit: number }): Reason {
  const { candidate, matchedTags, interestScore, pillarScore, featured, fresh, fit } = parts;
  const options: Array<{ points: number; reason: Reason } | null> = [
    matchedTags.length > 0 ? { points: interestScore, reason: { key: "interest", params: { tag: matchedTags[0] } } } : null,
    pillarScore >= PILLAR_REASON_MIN ? { points: pillarScore, reason: { key: "pillar", params: { pillar: candidate.pillar } } } : null,
    featured > 0 ? { points: featured, reason: { key: "featured" } } : null,
    fresh >= FRESH_REASON_MIN ? { points: fresh, reason: { key: "fresh" } } : null,
    fit === 1 && candidate.difficulty ? { points: fit, reason: { key: "difficulty" } } : null,
  ];
  let best: { points: number; reason: Reason } | null = null;
  // `>` estrito: em empate fica o primeiro da lista (maior prioridade)
  for (const option of options) if (option && (!best || option.points > best.points)) best = option;
  return best?.reason ?? { key: "generic" };
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
