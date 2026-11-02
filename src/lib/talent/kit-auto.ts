// Media kit automático e portfólio (0084), lógica pura testada em tests/unit/assinatura.test.ts. O banco calcula
// na hora (talent_kit_stats / talent_kit_portfolio); aqui só a forma, a taxa no prazo e os totais. Nunca valor.

export const KIT_METRIC_KEYS = ["views", "reach", "likes", "comments", "shares", "saves", "clicks"] as const;
export type KitMetricKey = (typeof KIT_METRIC_KEYS)[number];
export type KitMetrics = Partial<Record<KitMetricKey, number>>;

export type KitStats = {
  completed_campaigns: number;
  published_deliverables: number;
  on_time_base: number;
  on_time_count: number;
  rating_avg: number | null;
  rating_count: number;
  metrics: KitMetrics;
  app_followers: number | null;
  networks_updated_at: string | null;
  computed_at: string | null;
};

export type PortfolioDeliverable = { title: string; kind: string; network: string | null; url: string; published_at: string | null; metrics: KitMetrics };
export type PortfolioItem = { campaign: string; brand: string; brand_logo: string | null; last_published_at: string | null; deliverables: PortfolioDeliverable[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function toKitMetrics(raw: unknown): KitMetrics {
  const r = obj(raw);
  const out: KitMetrics = {};
  for (const k of KIT_METRIC_KEYS) {
    const v = num(r[k]);
    if (v !== null && v >= 0) out[k] = v;
  }
  return out;
}

export function toKitStats(raw: unknown): KitStats | null {
  const r = obj(raw);
  if (Object.keys(r).length === 0) return null;
  return {
    completed_campaigns: num(r.completed_campaigns) ?? 0,
    published_deliverables: num(r.published_deliverables) ?? 0,
    on_time_base: num(r.on_time_base) ?? 0,
    on_time_count: num(r.on_time_count) ?? 0,
    rating_avg: num(r.rating_avg),
    rating_count: num(r.rating_count) ?? 0,
    metrics: toKitMetrics(r.metrics),
    app_followers: num(r.app_followers),
    networks_updated_at: text(r.networks_updated_at),
    computed_at: text(r.computed_at),
  };
}

/** Só link https (o banco já exige; aqui é a última barreira antes do <a>). */
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function toPortfolio(raw: unknown): PortfolioItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const r = obj(x);
    const deliverables = (Array.isArray(r.deliverables) ? r.deliverables : [])
      .map((d) => {
        const v = obj(d);
        const url = httpsUrl(v.url);
        return url ? { title: String(v.title ?? ""), kind: String(v.kind ?? "other"), network: text(v.network), url, published_at: text(v.published_at), metrics: toKitMetrics(v.metrics) } : null;
      })
      .filter((d): d is PortfolioDeliverable => d !== null);
    return { campaign: String(r.campaign ?? ""), brand: String(r.brand ?? ""), brand_logo: httpsUrl(r.brand_logo), last_published_at: text(r.last_published_at), deliverables };
  }).filter((p) => p.deliverables.length > 0);
}

/** Entrega no prazo em % inteiro; null sem base (nenhuma entrega com prazo). */
export function onTimeRate(stats: Pick<KitStats, "on_time_base" | "on_time_count">): number | null {
  if (stats.on_time_base <= 0) return null;
  return Math.round((Math.min(stats.on_time_count, stats.on_time_base) / stats.on_time_base) * 100);
}

/** Métricas com algum número, na ordem fixa (para a tela não mostrar "0" do que ninguém informou). */
export function metricEntries(metrics: KitMetrics): { key: KitMetricKey; value: number }[] {
  return KIT_METRIC_KEYS.filter((k) => metrics[k] !== undefined).map((k) => ({ key: k, value: metrics[k] as number }));
}

/** Totais do portfólio (soma das métricas atuais dos entregáveis listados). */
export function portfolioTotals(items: readonly PortfolioItem[]): KitMetrics {
  const out: KitMetrics = {};
  for (const item of items)
    for (const d of item.deliverables)
      for (const k of KIT_METRIC_KEYS) {
        const v = d.metrics[k];
        if (v !== undefined) out[k] = (out[k] ?? 0) + v;
      }
  return out;
}
