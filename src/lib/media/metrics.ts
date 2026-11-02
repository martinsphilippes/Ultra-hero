// Métricas, direitos de uso, link rastreável e vendas (0083). Lógica pura (testada com vitest).
//
// Decisões:
//   • Cada leitura (deliverable_metrics) traz só o que foi medido. O valor atual de uma métrica é o da leitura
//     mais recente (data da medição; empate: a mais nova) que a traz — uma leitura do YouTube só com
//     visualizações não apaga o alcance informado à mão.
//   • Totais da campanha = soma dos valores atuais de cada entregável (métrica ausente em todos fica null, e não 0,
//     para a tela mostrar "—" em vez de um zero falso).
//   • Vencimento do direito: faixas iguais às do aviso do banco (15, 7, 0 dias).

export const METRIC_KEYS = ["reach", "views", "likes", "comments", "shares", "saves", "clicks"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type MetricValues = Record<MetricKey, number | null>;

export type MetricReading = {
  id: string;
  deliverableId: string;
  source: "manual" | "youtube";
  measuredOn: string;
  createdAt: string;
  enteredSide: "talent" | "agency" | "system";
} & MetricValues;

export const EMPTY_METRICS: MetricValues = { reach: null, views: null, likes: null, comments: null, shares: null, saves: null, clicks: null };

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

export function toMetricReading(raw: Record<string, unknown>): MetricReading {
  const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, numOrNull(raw[k])])) as MetricValues;
  return {
    id: String(raw.id),
    deliverableId: String(raw.deliverable_id),
    source: raw.source === "youtube" ? "youtube" : "manual",
    measuredOn: String(raw.measured_on),
    createdAt: String(raw.created_at ?? ""),
    enteredSide: raw.entered_side === "agency" ? "agency" : raw.entered_side === "system" ? "system" : "talent",
    ...values,
  };
}

const newer = (a: MetricReading, b: MetricReading) => (a.measuredOn !== b.measuredOn ? b.measuredOn.localeCompare(a.measuredOn) : b.createdAt.localeCompare(a.createdAt));

/** Valor atual de cada métrica de UM entregável + a data da leitura mais recente. */
export function currentMetrics(readings: MetricReading[]): { values: MetricValues; lastOn: string | null; youtube: boolean } {
  const sorted = [...readings].sort(newer);
  const values = { ...EMPTY_METRICS };
  for (const key of METRIC_KEYS) {
    const hit = sorted.find((r) => r[key] !== null);
    values[key] = hit ? hit[key] : null;
  }
  return { values, lastOn: sorted[0]?.measuredOn ?? null, youtube: sorted.some((r) => r.source === "youtube") };
}

/** Agrupa as leituras por entregável. */
export function metricsByDeliverable(readings: MetricReading[]): Map<string, MetricReading[]> {
  const out = new Map<string, MetricReading[]>();
  for (const r of readings) out.set(r.deliverableId, [...(out.get(r.deliverableId) ?? []), r]);
  return out;
}

/** Soma dos valores atuais de vários entregáveis (null onde nenhum tem a métrica). */
export function sumMetrics(list: MetricValues[]): MetricValues {
  const out = { ...EMPTY_METRICS };
  for (const key of METRIC_KEYS) {
    const present = list.map((v) => v[key]).filter((n): n is number => n !== null);
    out[key] = present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

/** Totais da campanha a partir de todas as leituras. */
export function campaignTotals(readings: MetricReading[]): MetricValues {
  return sumMetrics([...metricsByDeliverable(readings).values()].map((r) => currentMetrics(r).values));
}

/** Texto do formulário → número inteiro ≥ 0 (aceita "1.234" e "1,234" como milhar), vazio = null, inválido = undefined. */
export function parseMetricInput(text: string): number | null | undefined {
  const v = text.trim().replace(/[.\s,]/g, "");
  if (!v) return null;
  if (!/^\d{1,13}$/.test(v)) return undefined;
  const n = Number(v);
  return n <= 1_000_000_000_000 ? n : undefined;
}

/** Taxa de engajamento (curtidas + comentários + compartilhamentos + salvamentos) / base (alcance ou views), em %. */
export function engagementRate(v: MetricValues): number | null {
  const base = v.reach ?? v.views;
  if (!base) return null;
  const interactions = (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0) + (v.saves ?? 0);
  if (interactions === 0 && v.likes === null && v.comments === null && v.shares === null && v.saves === null) return null;
  return Math.round((interactions / base) * 10000) / 100;
}

// ---------------------------------------------------------------- direitos de uso
export type RightsBand = "none" | "pending" | "ok" | "soon15" | "soon7" | "today" | "expired";

/** Faixa do vencimento: sem prazo (perpétuo/indefinido), não começou (não publicado), ok, 15, 7, hoje, vencido. */
export function rightsBand(input: { published: boolean; expiresOn: string | null; daysLeft: number | null; perpetual: boolean }): RightsBand {
  if (!input.published) return input.perpetual ? "none" : "pending";
  if (input.expiresOn === null || input.daysLeft === null) return "none";
  if (input.daysLeft < 0) return "expired";
  if (input.daysLeft === 0) return "today";
  if (input.daysLeft <= 7) return "soon7";
  if (input.daysLeft <= 15) return "soon15";
  return "ok";
}

// ---------------------------------------------------------------- link rastreável
export const TRACKING_CODE = /^[a-z0-9]{6,16}$/;

export function trackingCodeOk(code: string | null | undefined): boolean {
  return typeof code === "string" && TRACKING_CODE.test(code.toLowerCase());
}

/** Destino do redirecionamento: só https, sem credenciais embutidas; devolve a URL normalizada ou null. */
export function safeHttpsDestination(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Cupom digitado → forma gravada (maiúsculas, sem espaços nas pontas); null se tiver caractere inválido. */
export function normalizeCoupon(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  return /^[A-Z0-9_-]{0,40}$/.test(v) ? v : null;
}

// Robôs de pré-visualização de link (mensageiros e redes): o redirecionamento acontece, mas o clique não conta.
const PREVIEW_BOTS = /(facebookexternalhit|facebot|whatsapp|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|pinterestbot|embedly|vkshare|redditbot|bot\b|crawler|spider|preview)/i;

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return PREVIEW_BOTS.test(userAgent);
}

export function trackingUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/r/${code}`;
}

// ---------------------------------------------------------------- vendas
export type SaleRow = { id: string; linkId: string; dealTalentId: string; coupon: string; quantity: number; revenueCents: number; reportedOn: string; note: string; createdBy: string | null };

export function salesTotals(rows: SaleRow[]): { quantity: number; revenueCents: number; byLink: Map<string, { quantity: number; revenueCents: number }> } {
  const byLink = new Map<string, { quantity: number; revenueCents: number }>();
  let quantity = 0;
  let revenueCents = 0;
  for (const r of rows) {
    quantity += r.quantity;
    revenueCents += r.revenueCents;
    const cur = byLink.get(r.linkId) ?? { quantity: 0, revenueCents: 0 };
    byLink.set(r.linkId, { quantity: cur.quantity + r.quantity, revenueCents: cur.revenueCents + r.revenueCents });
  }
  return { quantity, revenueCents, byLink };
}

/** Taxa de conversão cliques → vendas, em % (null sem cliques). */
export function conversionRate(clicks: number, quantity: number): number | null {
  if (clicks <= 0) return null;
  return Math.round((quantity / clicks) * 10000) / 100;
}

// ---------------------------------------------------------------- YouTube Data API (videos.list, part=statistics)
export type YouTubeStats = { views: number | null; likes: number | null; comments: number | null };

/** item da resposta → métricas (a API manda números como texto; curtidas podem vir ocultas). */
export function youTubeStats(item: unknown): { id: string; stats: YouTubeStats } | null {
  if (!item || typeof item !== "object") return null;
  const it = item as { id?: unknown; statistics?: Record<string, unknown> };
  if (typeof it.id !== "string" || !it.statistics) return null;
  const s = it.statistics;
  const stats = { views: numOrNull(s.viewCount), likes: numOrNull(s.likeCount), comments: numOrNull(s.commentCount) };
  if (stats.views === null && stats.likes === null && stats.comments === null) return null;
  return { id: it.id, stats };
}

/** Lotes de até `size` ids (a API aceita 50 por chamada). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
