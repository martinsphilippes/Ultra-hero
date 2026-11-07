// Onda Digital (0132): números no formato da apresentação ("26M", "892K", "9,5M", "+35M", "13,67%"), a ordem dos
// cases (os da área da marca primeiro) e o atalho do WhatsApp da Groscove.

export const ONDA_PURPOSES = ["launch", "realtime", "events", "influencers", "conversion", "opportunity", "awareness"] as const;
export type OndaPurpose = (typeof ONDA_PURPOSES)[number];

export const ONDA_STATUSES = ["received", "talking", "proposal", "live", "closed"] as const;
export type OndaStatus = (typeof ONDA_STATUSES)[number];
/** Andamento que a marca vê (o "Encerrado" fica fora da linha). */
export const ONDA_STEPS = ["received", "talking", "proposal", "live"] as const satisfies readonly OndaStatus[];

export const ONDA_AREAS = ["noticias", "negocios", "moda", "entretenimento", "musica", "tecnologia", "financas", "cultura_afro"] as const;
export type OndaArea = (typeof ONDA_AREAS)[number];

export const ONDA_WHEN = ["tbd", "now", "date"] as const;
export type OndaWhen = (typeof ONDA_WHEN)[number];

export const GROSCOVE_WHATSAPP = "5511944971429";
export const GROSCOVE_WHATSAPP_LABEL = "+55 11 94497-1429";
export const GROSCOVE_EMAIL = "contato@groscovegroup.com";

export type OndaMetric = { k: "reach" | "impressions" | "impacts" | "feed_reach"; v: number; plus?: boolean };

function decimals(value: number, max: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(value);
}

/** "26M", "9,5M", "892K", "85K" — como na apresentação (separador decimal do idioma). */
export function formatCompact(value: number, locale: string): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value >= 1_000_000) return `${decimals(Math.round(value / 100_000) / 10, 1, locale)}M`;
  if (value >= 1_000) return `${decimals(Math.round(value / 1_000), 0, locale)}K`;
  return decimals(Math.round(value), 0, locale);
}

/** Valor de um indicador de case: "55,9M", "+35M" ou "13,67%". */
export function formatMetric(metric: OndaMetric, locale: string): string {
  if (metric.k === "feed_reach") return `${decimals(metric.v, 2, locale)}%`;
  return `${metric.plus ? "+" : ""}${formatCompact(metric.v, locale)}`;
}

/** Os cases da área da marca primeiro; o resto na ordem da apresentação. */
export function orderCasesForCategory<T extends { category: string | null }>(cases: readonly T[], category: string | null | undefined): T[] {
  if (!category) return [...cases];
  return [...cases.filter((c) => c.category === category), ...cases.filter((c) => c.category !== category)];
}

/** Link do WhatsApp da Groscove com a mensagem pronta. */
export function whatsappHref(text: string, phone: string = GROSCOVE_WHATSAPP): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Posição do pedido na linha Recebido → Em conversa → Proposta → Na onda! (−1 = encerrado). */
export function ondaStepIndex(status: string): number {
  return (ONDA_STEPS as readonly string[]).indexOf(status);
}

export function isOndaPurpose(v: unknown): v is OndaPurpose {
  return typeof v === "string" && (ONDA_PURPOSES as readonly string[]).includes(v);
}
export function isOndaStatus(v: unknown): v is OndaStatus {
  return typeof v === "string" && (ONDA_STATUSES as readonly string[]).includes(v);
}
