// Projeção de campanhas (0139): tipos e regras puras da aba "Projeção" do Financeiro (agência e Hero).
// Valores em centavos. Cada bloco separa o que já fechou, o que está em negociação e o que está aberto para buscar.

export type ProjectionBucket = { won: number; open: number; available: number };
export type ProjectionSegment = ProjectionBucket & { name: string; mine: boolean };
export type CampaignProjection = {
  year: number | null;
  mine: ProjectionBucket;
  segment: ProjectionBucket;
  platform: ProjectionBucket;
  /** Total da agência: só o Adm recebe. */
  agency: ProjectionBucket | null;
  segments: ProjectionSegment[];
  mySegments: string[];
  /** Anos que têm algum valor (para o filtro). */
  years: number[];
};

export const BUCKET_KEYS = ["won", "open", "available"] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];

const EMPTY: ProjectionBucket = { won: 0, open: 0, available: 0 };
const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

function parseBucket(v: unknown): ProjectionBucket {
  if (!v || typeof v !== "object") return { ...EMPTY };
  const r = v as Record<string, unknown>;
  return { won: cents(r.won), open: cents(r.open), available: cents(r.available) };
}

/** JSON do banco → projeção (o que vier estranho vira zero). */
export function parseProjection(v: unknown): CampaignProjection | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  return {
    year: typeof r.year === "number" ? r.year : null,
    mine: parseBucket(r.mine),
    segment: parseBucket(r.segment),
    platform: parseBucket(r.platform),
    agency: r.agency && typeof r.agency === "object" ? parseBucket(r.agency) : null,
    segments: list(r.segments)
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object" && typeof (s as Record<string, unknown>).name === "string")
      .map((s) => ({ ...parseBucket(s), name: String(s.name), mine: s.mine === true })),
    mySegments: list(r.my_segments).filter((s): s is string => typeof s === "string"),
    years: list(r.years).filter((y): y is number => Number.isInteger(y)),
  };
}

export function bucketTotal(b: ProjectionBucket): number {
  return b.won + b.open + b.available;
}

/** Fatia de cada parte no total (0–100), para a barra; sem valor, tudo zero. */
export function bucketShares(b: ProjectionBucket): Record<BucketKey, number> {
  const total = bucketTotal(b);
  if (total === 0) return { won: 0, open: 0, available: 0 };
  return { won: (b.won / total) * 100, open: (b.open / total) * 100, available: (b.available / total) * 100 };
}

/** Anos do filtro: o atual, o próximo e os anos com valor por perto (até 3 para trás e para a frente). */
export function projectionYears(dataYears: readonly number[], current: number): number[] {
  const set = new Set<number>([current, current + 1]);
  for (const y of dataYears) if (y >= current - 3 && y <= current + 3) set.add(y);
  return [...set].sort((a, b) => a - b);
}

/** "?ano=" da URL → o ano (padrão: o atual) ou null para o total. */
export function parseYearParam(v: string | undefined, current: number): number | null {
  if (v === "total") return null;
  const n = Number(v);
  return v && Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : current;
}

/** Segmentos no cartão "no seu segmento": até `max` nomes e "+N" para o resto (gestor sem Hero vê os da agência toda). */
export function segmentHint(names: readonly string[], max = 3): string {
  if (names.length <= max) return names.join(" · ");
  return `${names.slice(0, max).join(" · ")} +${names.length - max}`;
}

/** Endereço do filtro mantendo a aba (basePath pode já ter "?"). */
export function yearHref(basePath: string, year: number | null): string {
  return `${basePath}${basePath.includes("?") ? "&" : "?"}ano=${year ?? "total"}`;
}
