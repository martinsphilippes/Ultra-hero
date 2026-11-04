// Resolução do tema sazonal por data (módulo puro, testado). O banco calcula a mesma janela por gatilho (0100); aqui
// ela serve à tela do admin (prévia das datas, linha do tempo) e a escolha do vencedor roda a cada requisição.
import { zonedDayKey } from "@/lib/calendar/grid";
import { toZonedIso } from "@/lib/deals/schemas";
import type { SeasonArea } from "./vocab";

export type WindowRule = {
  startMode: "date" | "lead_days";
  startsAt: string | null;
  leadDays: number;
  endMode: "date" | "event_end";
  endsAt: string | null;
  timezone: string;
};
export type LinkedEvent = { startsAt: string; endsAt: string };
export type ThemeWindow = { start: string; end: string };

const DAY_MS = 86_400_000;

/** "2026-12-25" − n dias (aritmética de calendário, sem fuso). */
export function minusDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - n * DAY_MS);
  return t.toISOString().slice(0, 10);
}

/**
 * Janela efetiva [start, end) — a mesma regra do gatilho seasonal_themes_before_write: início por data ou "N dias antes"
 * (meia-noite, no fuso do tema, do dia de início do evento menos N); fim por data ou o fim do evento. Inválida → null.
 */
export function computeWindow(rule: WindowRule, event: LinkedEvent | null): ThemeWindow | null {
  let start: string | null = null;
  if (rule.startMode === "date") start = rule.startsAt;
  else if (event) start = toZonedIso(minusDays(zonedDayKey(event.startsAt, rule.timezone), rule.leadDays), "00:00", rule.timezone);
  const end = rule.endMode === "date" ? rule.endsAt : (event?.endsAt ?? null);
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 400 * DAY_MS) return null;
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

export type Candidate = { id: string; priority: number; areas: readonly SeasonArea[]; windowStart: string; windowEnd: string };

export function isActiveAt(c: Pick<Candidate, "windowStart" | "windowEnd">, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(c.windowStart) <= t && t < Date.parse(c.windowEnd);
}

/** Ordem de desempate: maior prioridade, depois início mais recente, depois id (estável). */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const sa = Date.parse(a.windowStart);
  const sb = Date.parse(b.windowStart);
  if (sa !== sb) return sb - sa;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** O tema que vale agora nesta área (ou null: identidade padrão). */
export function resolveActive<C extends Candidate>(candidates: readonly C[], now: Date, area: SeasonArea): C | null {
  const live = candidates.filter((c) => c.areas.includes(area) && isActiveAt(c, now));
  if (live.length === 0) return null;
  return [...live].sort(compareCandidates)[0];
}

export type TimelineDay = { day: string; winner: string | null; others: string[] };

/**
 * Linha do tempo simples para o admin: para cada dia (no fuso dado) a partir de `from`, quem está ativo ao meio-dia
 * (o vencedor, em qualquer área) e quem coincide no dia mas perde pela prioridade (conflito visível).
 */
export function buildTimeline<C extends Candidate>(candidates: readonly C[], from: Date, days: number, timeZone: string): TimelineDay[] {
  const first = zonedDayKey(from, timeZone);
  const out: TimelineDay[] = [];
  for (let i = 0; i < days; i++) {
    const day = minusDays(first, -i);
    const dayStart = Date.parse(toZonedIso(day, "00:00", timeZone) ?? "");
    const dayEnd = Date.parse(toZonedIso(minusDays(day, -1), "00:00", timeZone) ?? "");
    const noon = Date.parse(toZonedIso(day, "12:00", timeZone) ?? "");
    const touching = candidates.filter((c) => Date.parse(c.windowStart) < dayEnd && dayStart < Date.parse(c.windowEnd)).sort(compareCandidates);
    const atNoon = touching.filter((c) => isActiveAt(c, new Date(noon)));
    const winner = (atNoon[0] ?? touching[0])?.id ?? null;
    out.push({ day, winner, others: touching.map((c) => c.id).filter((id) => id !== winner) });
  }
  return out;
}

export type ThemePhase = "active" | "scheduled" | "draft" | "ended" | "incomplete";

/** Em que lista do admin o tema cai agora. */
export function themePhase(t: { status: "draft" | "published"; windowStart: string | null; windowEnd: string | null; eventCancelled?: boolean }, now: Date): ThemePhase {
  if (t.windowStart && t.windowEnd && Date.parse(t.windowEnd) <= now.getTime()) return "ended";
  if (t.status === "draft") return t.windowStart ? "draft" : "incomplete";
  if (!t.windowStart || !t.windowEnd || t.eventCancelled) return "incomplete";
  return Date.parse(t.windowStart) <= now.getTime() ? "active" : "scheduled";
}
