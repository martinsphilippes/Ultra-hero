// Segmentos do Hero (reunião Groscove, 06/11/2026): os mesmos territórios coloridos do Calendário Groscove, sem
// "feriados" (Hero não é feriado) — 10 segmentos. O Hero marca até 4; mais que isso "a pessoa está viajando".
// O banco confere a mesma lista (public.hero_segments_valid, 0125). Módulo puro (testável).
import { TERRITORIES, type Territory } from "@/lib/platform-calendar/vocab";

export const HERO_SEGMENTS = TERRITORIES.filter((t) => t !== "feriados") as Exclude<Territory, "feriados">[];
export type HeroSegment = (typeof HERO_SEGMENTS)[number];
export const HERO_SEGMENTS_MAX = 4;

export function isHeroSegment(value: unknown): value is HeroSegment {
  return typeof value === "string" && (HERO_SEGMENTS as readonly string[]).includes(value);
}

/** Lista limpa: só segmentos válidos, sem repetir, na ordem do calendário, no máximo 4. */
export function normalizeSegments(values: readonly unknown[]): HeroSegment[] {
  const chosen = new Set(values.filter(isHeroSegment));
  return HERO_SEGMENTS.filter((s) => chosen.has(s)).slice(0, HERO_SEGMENTS_MAX);
}
