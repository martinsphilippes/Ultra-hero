// Ajudantes de apresentação do Hoje com relógio (sem React): o que mostrar em cada card,
// comparação com a faixa habitual e rótulos de fonte. Testáveis em node.

import { metricDef, MODEL_INFO, metricsForSection, modelMeasures, type DetailSectionId, type MetricCode } from "@/lib/wearables/catalog";
import type { MetricPoint, WatchSnapshot } from "@/lib/wearables/demo";
import { compare, type Comparison } from "@/lib/wearables/derived";

export function point(snapshot: WatchSnapshot, code: MetricCode): MetricPoint | null {
  return snapshot.values[code] ?? null;
}

export function value(snapshot: WatchSnapshot, code: MetricCode): number | null {
  const p = snapshot.values[code];
  return p ? p.value : null;
}

export function comparisonOf(snapshot: WatchSnapshot, code: MetricCode): Comparison {
  return compare(value(snapshot, code), snapshot.baselines[code] ?? null);
}

/**
 * "Faixa habitual" do detalhe: só para o que é medido (não para metas fixas do relógio, horários
 * nem cálculos nossos) e com largura de verdade; limitada à escala plausível da métrica
 * (ex.: Body Battery nunca abaixo de 5).
 */
export function usualRange(snapshot: WatchSnapshot, code: MetricCode): { low: number; high: number } | null {
  const base = snapshot.baselines[code];
  const def = metricDef(code);
  if (!base || !def || def.goal || def.unit === "clock" || def.mode === "C") return null;
  const [min, max] = def.plaus ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  const low = Math.min(max, Math.max(min, base.low));
  const high = Math.min(max, Math.max(min, base.high));
  if (!(high > low) || high <= 0) return null;
  return { low, high };
}

/** Faixas de estresse da Garmin (0–25 repouso, 26–50 baixo, 51–75 médio, 76–100 alto). */
export function stressLevel(score: number): "rest" | "low" | "medium" | "high" {
  if (score <= 25) return "rest";
  if (score <= 50) return "low";
  if (score <= 75) return "medium";
  return "high";
}

export type IndexCardKind = "body_battery" | "readiness_vendor" | "disposition" | null;

/**
 * Precedência do card do índice (RN-08b): índice da marca quando sai por API; senão a
 * Disposição Ultra Hero, se houver VFC ou FC de repouso; senão o card não aparece.
 */
export function indexCardKind(snapshot: WatchSnapshot): IndexCardKind {
  const info = MODEL_INFO[snapshot.model];
  if (info.vendorIndex === "body_battery" && value(snapshot, "body_battery_now") !== null) return "body_battery";
  if (info.vendorIndex === "readiness_vendor" && value(snapshot, "readiness_vendor") !== null) return "readiness_vendor";
  if (snapshot.disposition) return "disposition";
  return null;
}

/** Métricas do detalhe da seção, na ordem do catálogo, só as que o modelo mede e têm valor. */
export function sectionPoints(snapshot: WatchSnapshot, section: DetailSectionId): MetricPoint[] {
  const out: MetricPoint[] = [];
  for (const def of metricsForSection(section)) {
    const p = snapshot.values[def.code as MetricCode];
    if (p && modelMeasures(snapshot.model, def.code)) out.push(p);
  }
  return out;
}

const TRENDS: Record<DetailSectionId, MetricCode[]> = {
  readiness: ["body_battery_high", "disposition_uh"],
  sleep: ["sleep_asleep_min"],
  vitals: ["hr_resting", "hrv_night", "spo2_night_avg"],
  activity: ["steps"],
  workouts: ["cardio_load_day_uh"],
  stress: ["stress_avg"],
  environment: ["env_noise_db_avg", "daylight_min"],
};

/** Até duas séries de tendência por seção (um eixo por gráfico: nunca dois eixos no mesmo). */
export function trendCodes(snapshot: WatchSnapshot, section: DetailSectionId): MetricCode[] {
  return TRENDS[section].filter((code) => snapshot.history.some((d) => typeof d.values[code] === "number")).slice(0, 2);
}

/** A seção tem algo para mostrar com este modelo? (senão o detalhe responde 404). */
export function sectionAvailable(snapshot: WatchSnapshot, section: DetailSectionId): boolean {
  if (section === "readiness") return indexCardKind(snapshot) !== null;
  if (section === "stress") return value(snapshot, "stress_avg") !== null || value(snapshot, "stress_high_min") !== null;
  return sectionPoints(snapshot, section).length > 0;
}
