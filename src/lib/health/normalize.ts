// Validação do lote normalizado antes de gravar (§9.2 "validate"): catálogo, só métricas que se
// gravam (índices nossos são calculados na leitura), categoria consentida, plausibilidade (RN-12),
// sessões coerentes. O que cai vira um CÓDIGO enumerado (nunca o valor nem mensagem livre).
// O banco repete as mesmas regras nos gatilhos; aqui evitamos que um item ruim derrube o lote.

import { metricDef } from "@/lib/wearables/catalog";
import { isYmd } from "./adapters/common";
import type { HealthCategory, NormalizedBatch } from "./types";

export type ValidationResult = { batch: NormalizedBatch; dropped: string[] };

const MAX_ITEMS = 2000;

function validIso(value: string | undefined): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Métrica que se grava: do catálogo, medida pelo aparelho (A/T), não um agregado de treino. */
export function isStoredMetric(code: string): boolean {
  const def = metricDef(code);
  return def !== null && def.mode !== "C" && !code.startsWith("workout_");
}

export function validateBatch(input: NormalizedBatch, consented: readonly HealthCategory[]): ValidationResult {
  const dropped: string[] = [];
  const allow = new Set(consented);
  const out: NormalizedBatch = { ...input, daily: [], sleep: [], workouts: [], deletions: input.deletions.slice(0, MAX_ITEMS) };

  // um valor por (dia, métrica): o mais recente vence dentro do próprio lote (RN-10)
  const byKey = new Map<string, NormalizedBatch["daily"][number]>();
  for (const d of input.daily.slice(0, MAX_ITEMS)) {
    const def = metricDef(d.code);
    if (!def || !isStoredMetric(d.code)) {
      dropped.push(`not_stored:${d.code}`);
      continue;
    }
    if (!allow.has(def.category as HealthCategory)) {
      dropped.push(`category_not_consented:${def.category}`);
      continue;
    }
    if (!isYmd(d.date) || typeof d.value !== "number" || !Number.isFinite(d.value)) {
      dropped.push(`invalid:${d.code}`);
      continue;
    }
    const plaus = (def as { plaus?: readonly [number, number] }).plaus;
    if (plaus && (d.value < plaus[0] || d.value > plaus[1])) {
      dropped.push(`plaus_out_of_range:${d.code}`);
      continue;
    }
    if ((d.at && !validIso(d.at)) || (d.updated && !validIso(d.updated)) || (d.ref !== undefined && (d.ref.length < 1 || d.ref.length > 220))) {
      dropped.push(`invalid:${d.code}`);
      continue;
    }
    const key = `${d.date}|${d.code}`;
    const prev = byKey.get(key);
    if (!prev || (d.updated ?? "") >= (prev.updated ?? "")) byKey.set(key, d);
  }
  out.daily = [...byKey.values()];

  if (input.sleep.length > 0 && !allow.has("sleep")) dropped.push("category_not_consented:sleep");
  else
    for (const s of input.sleep.slice(0, MAX_ITEMS)) {
      const start = Date.parse(s.start);
      const end = Date.parse(s.end);
      if (!s.ext || !isYmd(s.date) || !(end > start) || end - start > 20 * 3600_000) {
        dropped.push("invalid:sleep_session");
        continue;
      }
      const mins = [s.asleep, s.deep, s.light, s.rem, s.awake, s.inBed, s.latency].filter((v): v is number => v !== undefined);
      if (mins.some((v) => !Number.isFinite(v) || v < 0 || v > 1200)) {
        dropped.push("plaus_out_of_range:sleep_session");
        continue;
      }
      out.sleep.push({ ...s, lowestHr: s.lowestHr !== undefined && s.lowestHr >= 25 && s.lowestHr <= 240 ? s.lowestHr : undefined });
    }

  if (input.workouts.length > 0 && !allow.has("workout")) dropped.push("category_not_consented:workout");
  else
    for (const w of input.workouts.slice(0, MAX_ITEMS)) {
      const start = Date.parse(w.start);
      const end = Date.parse(w.end);
      if (!w.ext || !isYmd(w.date) || !(end > start) || !(w.dur > 0) || w.dur > 172_800 || (w.origin !== "started_on_device" && w.origin !== "auto_detected") || !/^[a-z0-9_]{2,40}$/.test(w.sport)) {
        dropped.push("invalid:workout");
        continue;
      }
      const hr = (v: number | undefined) => (v !== undefined && v >= 25 && v <= 240 ? Math.round(v) : undefined);
      const nonNeg = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v >= 0 ? v : undefined);
      out.workouts.push({
        ...w,
        avgHr: hr(w.avgHr),
        maxHr: hr(w.maxHr),
        dist: nonNeg(w.dist),
        kcal: nonNeg(w.kcal),
        speed: nonNeg(w.speed),
        zones: w.zones && w.zones.every((z) => Number.isFinite(z) && z >= 0) ? w.zones : undefined,
      });
    }

  return { batch: out, dropped };
}

/** Lote → JSON que health.apply_batch espera (chaves curtas, sem undefined). */
export function batchToJson(batch: NormalizedBatch): Record<string, unknown> {
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return {
    device: batch.device ?? null,
    daily: batch.daily.map(clean),
    sleep: batch.sleep.map(clean),
    workouts: batch.workouts.map(clean),
    deletions: batch.deletions,
  };
}
