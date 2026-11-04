// Real-Time Culture (0101): lógica pura (sem servidor), testada em tests/unit/culture.test.ts.
// A Real-Time Culture NÃO tem calendário próprio: ela lê o Calendário Groscove (calendar_events scope='platform') e o
// recorta em faixas. Decisões:
//   • "Acontecendo agora" = começou e ainda não terminou (instante atual entre início e fim). Temporadas longas
//     (> LONG_EVENT_DAYS, como Brasileirão e Libertadores) ficam numa faixa própria ("Em temporada") para não lotar o agora.
//   • "Próximos 7 dias" / "Próximos 30 dias" contam por instante (agora + 7×24h / + 30×24h), igual em qualquer fuso; o dia
//     mostrado em cada cartão segue o fuso do evento.
//   • Destaques = eventos marcados como destaque (highlight) acontecendo agora ou começando nos próximos 30 dias.
//   • Cancelado não entra (aparece só na agenda, riscado); rascunho e programado futuro nem chegam aqui (RLS).
//   • Filtro por território vale para todas as faixas.

import { LONG_EVENT_DAYS, type PlatformStatus, type Territory } from "@/lib/platform-calendar/vocab";

export type CultureEventLike = {
  id: string;
  startsAt: string;
  endsAt: string;
  highlight: boolean;
  territory: Territory | null;
  effective: PlatformStatus;
};

export type CultureLanes<E> = { happening: E[]; seasons: E[]; featured: E[]; next7: E[]; next30: E[] };

export const CULTURE_LIMITS = { happening: 12, seasons: 8, featured: 8, next7: 20, next30: 30 } as const;

const DAY_MS = 86_400_000;

const ms = (iso: string) => new Date(iso).getTime();

/** Duração em dias (fração). */
export function durationDays(e: Pick<CultureEventLike, "startsAt" | "endsAt">): number {
  return (ms(e.endsAt) - ms(e.startsAt)) / DAY_MS;
}

export function isLongEvent(e: Pick<CultureEventLike, "startsAt" | "endsAt">): boolean {
  return durationDays(e) > LONG_EVENT_DAYS;
}

/** Começou e ainda não terminou (fim exclusivo). */
export function isHappening(e: Pick<CultureEventLike, "startsAt" | "endsAt">, now: Date): boolean {
  const t = now.getTime();
  return ms(e.startsAt) <= t && t < ms(e.endsAt);
}

/** Recorta os eventos já carregados nas faixas da Real-Time Culture. */
export function selectCulture<E extends CultureEventLike>(events: readonly E[], now: Date, opts: { territory?: Territory | null } = {}): CultureLanes<E> {
  const t = now.getTime();
  const in7 = t + 7 * DAY_MS;
  const in30 = t + 30 * DAY_MS;
  const live = events.filter((e) => e.effective === "published" && ms(e.endsAt) > t && (!opts.territory || e.territory === opts.territory));
  const byStart = (a: E, b: E) => ms(a.startsAt) - ms(b.startsAt) || a.id.localeCompare(b.id);
  const byEnd = (a: E, b: E) => ms(a.endsAt) - ms(b.endsAt) || a.id.localeCompare(b.id);
  const ongoing = live.filter((e) => isHappening(e, now));
  return {
    happening: ongoing.filter((e) => !isLongEvent(e)).sort(byEnd).slice(0, CULTURE_LIMITS.happening),
    seasons: ongoing.filter((e) => isLongEvent(e)).sort(byEnd).slice(0, CULTURE_LIMITS.seasons),
    featured: live.filter((e) => e.highlight && ms(e.startsAt) < in30).sort(byStart).slice(0, CULTURE_LIMITS.featured),
    next7: live.filter((e) => ms(e.startsAt) > t && ms(e.startsAt) <= in7).sort(byStart).slice(0, CULTURE_LIMITS.next7),
    next30: live.filter((e) => ms(e.startsAt) > in7 && ms(e.startsAt) <= in30).sort(byStart).slice(0, CULTURE_LIMITS.next30),
  };
}

/** Ano e mês (1–12) do instante no fuso dado: base das hashtags do mês e do trimestre. */
export function culturePeriod(now: Date, timeZone: string): { year: number; month: number; quarter: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month, quarter: Math.floor((month - 1) / 3) + 1 };
}

export type CultureMeta = {
  month: { label: string; hashtags: string[] } | null;
  quarter: { quarter: string; trendingTopics: string[]; territories: string[]; summary: string } | null;
};

const strings = (v: unknown, max = 30): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 80)).slice(0, max) : [];

/** Lê o json de platform_culture_meta com tolerância (campo ruim some; nunca quebra a tela). */
export function parseCultureMeta(raw: unknown): CultureMeta {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const m = obj.month && typeof obj.month === "object" ? (obj.month as Record<string, unknown>) : null;
  const q = obj.quarter && typeof obj.quarter === "object" ? (obj.quarter as Record<string, unknown>) : null;
  const month = m ? { label: typeof m.label === "string" ? m.label.slice(0, 80) : "", hashtags: strings(m.hashtags) } : null;
  const quarter = q
    ? {
        quarter: typeof q.quarter === "string" ? q.quarter.slice(0, 4) : "",
        trendingTopics: strings(q.trending_topics),
        territories: strings(q.territories, 12),
        summary: typeof q.summary === "string" ? q.summary.slice(0, 1200) : "",
      }
    : null;
  return {
    month: month && (month.hashtags.length > 0 || month.label) ? month : null,
    quarter: quarter && (quarter.trendingTopics.length > 0 || quarter.summary) ? quarter : null,
  };
}

export type EventOpportunities = { sponsorships: number; calls: number };

/** json de calendar_event_opportunities → mapa evento → contagens (só números). */
export function parseOpportunities(raw: unknown): Map<string, EventOpportunities> {
  const out = new Map<string, EventOpportunities>();
  if (!Array.isArray(raw)) return out;
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.event_id !== "string") continue;
    const sponsorships = Math.max(0, Math.floor(Number(r.sponsorships) || 0));
    const calls = Math.max(0, Math.floor(Number(r.calls) || 0));
    if (sponsorships + calls > 0) out.set(r.event_id, { sponsorships, calls });
  }
  return out;
}

/** Hashtag para exibir: sempre com um único "#". */
export function displayTag(tag: string): string {
  return `#${tag.trim().replace(/^#+/, "")}`;
}

// ---------------------------------------------------------------- histórico comercial do evento (calendar_event_commercial)

export type CommercialItem = {
  kind: "campaign" | "brand_call" | "sponsorship";
  id: string;
  title: string;
  status: string;
  startsOn: string | null;
  side: "brand" | "agency" | "staff" | "hero" | "admin";
  dealId: string | null;
  dealStage: string | null;
};

const KINDS = ["campaign", "brand_call", "sponsorship"] as const;
const SIDES = ["brand", "agency", "staff", "hero", "admin"] as const;

export function parseCommercial(raw: unknown): CommercialItem[] {
  const items = raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? ((raw as { items: unknown[] }).items as Record<string, unknown>[]) : [];
  const out: CommercialItem[] = [];
  for (const r of items) {
    if (!r || typeof r.id !== "string") continue;
    const kind = (KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as CommercialItem["kind"]) : null;
    const side = (SIDES as readonly string[]).includes(String(r.side)) ? (r.side as CommercialItem["side"]) : null;
    if (!kind || !side) continue;
    out.push({
      kind,
      id: r.id,
      title: typeof r.title === "string" ? r.title : "",
      status: typeof r.status === "string" ? r.status : "",
      startsOn: typeof r.starts_on === "string" ? r.starts_on : null,
      side,
      dealId: typeof r.deal_id === "string" ? r.deal_id : null,
      dealStage: typeof r.deal_stage === "string" ? r.deal_stage : null,
    });
  }
  return out;
}

