// Uma métrica, uma fonte por dia (RN-06, §9.6): nunca somamos fontes. Para cada (dia, métrica):
// prioridade da marca para o tipo de dado → maior cobertura → mais recente. Treinos: união com
// deduplicação (mesmo esporte e ≥ 70% de sobreposição → fica o da fonte de maior prioridade).

import { metricDef } from "@/lib/wearables/catalog";
import type { HealthProvider } from "./types";

export type RpcDaily = {
  d: string;
  c: string;
  v: number;
  s: string | null;
  l: string | null;
  m: string | null;
  n: number | null;
  at: string | null;
  cov: number | null;
  conn: string;
  p: HealthProvider;
  u: string;
};

export type RpcWorkout = {
  id: string;
  d: string;
  sport: string;
  origin: string;
  start: string;
  end: string;
  dur: number;
  dist: number | null;
  kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  zones: number[] | null;
  conn: string;
  p: HealthProvider;
};

/** Anel e pulseira primeiro para a noite; relógio de pulso primeiro para o dia. */
export const SOURCE_PRIORITY = {
  night: ["oura", "whoop", "garmin", "polar"],
  activity: ["garmin", "polar", "oura", "whoop"],
  other: ["garmin", "oura", "whoop", "polar"],
} as const satisfies Record<string, readonly HealthProvider[]>;

const NIGHT_HEART = new Set(["hr_resting", "hrv_night", "sleep_hr_lowest"]);

export function priorityGroup(code: string): keyof typeof SOURCE_PRIORITY {
  const def = metricDef(code);
  if (!def) return "other";
  if (def.category === "sleep" || def.category === "temperature" || def.category === "breathing" || NIGHT_HEART.has(code)) return "night";
  if (def.category === "activity" || def.category === "workout") return "activity";
  return "other";
}

function rank(provider: HealthProvider, code: string): number {
  const list = SOURCE_PRIORITY[priorityGroup(code)] as readonly HealthProvider[];
  const i = list.indexOf(provider);
  return i < 0 ? list.length : i;
}

/** Melhor linha por (dia, métrica). Resultado: dia → métrica → linha escolhida. */
export function resolveDaily(rows: readonly RpcDaily[]): Map<string, Map<string, RpcDaily>> {
  const out = new Map<string, Map<string, RpcDaily>>();
  for (const row of rows) {
    if (typeof row.v !== "number" || !Number.isFinite(row.v)) continue;
    let day = out.get(row.d);
    if (!day) out.set(row.d, (day = new Map()));
    const cur = day.get(row.c);
    if (!cur || better(row, cur)) day.set(row.c, row);
  }
  return out;
}

function better(a: RpcDaily, b: RpcDaily): boolean {
  const ra = rank(a.p, a.c);
  const rb = rank(b.p, b.c);
  if (ra !== rb) return ra < rb;
  const ca = a.cov ?? -1;
  const cb = b.cov ?? -1;
  if (ca !== cb) return ca > cb;
  return a.u > b.u;
}

const WORKOUT_PRIORITY: readonly HealthProvider[] = ["garmin", "polar", "whoop", "oura"];

/** Sobreposição relativa à sessão mais curta (0–1). */
export function overlapRatio(a: { start: string; end: string }, b: { start: string; end: string }): number {
  const as = Date.parse(a.start);
  const ae = Date.parse(a.end);
  const bs = Date.parse(b.start);
  const be = Date.parse(b.end);
  const inter = Math.max(0, Math.min(ae, be) - Math.max(as, bs));
  const shorter = Math.min(ae - as, be - bs);
  return shorter > 0 ? inter / shorter : 0;
}

export function dedupWorkouts<T extends Pick<RpcWorkout, "start" | "end" | "sport" | "p">>(workouts: readonly T[]): T[] {
  const sorted = [...workouts].sort((a, b) => WORKOUT_PRIORITY.indexOf(a.p) - WORKOUT_PRIORITY.indexOf(b.p) || Date.parse(a.start) - Date.parse(b.start));
  const kept: T[] = [];
  for (const w of sorted) {
    if (kept.some((k) => k.p !== w.p && k.sport === w.sport && overlapRatio(k, w) >= 0.7)) continue;
    kept.push(w);
  }
  return kept.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
