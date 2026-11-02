// Direitos de uso e exclusividade estruturados dos termos (0079). Lógica pura (testada com vitest).
//
// Decisões:
//   • Canais fixos (o banco confere a mesma lista): redes sociais, site, mídia paga, PDV, e-mail, e-commerce,
//     mídia exterior, TV e outro.
//   • Prazo de uso em meses OU perpétuo. Perpétuo é permitido, mas a tela avisa que é desaconselhado.
//   • Exclusividade exige prazo em meses; sem exclusividade, segmentos, categoria e concorrentes ficam vazios.
//   • Concorrentes: nomes de marca digitados (vírgula ou linha), sem repetir (sem diferenciar maiúsculas), até 20.

export const USAGE_CHANNELS = ["social", "website", "paid_media", "pos", "email", "ecommerce", "ooh", "tv", "other"] as const;
export type UsageChannel = (typeof USAGE_CHANNELS)[number];

export const MAX_USAGE_MONTHS = 120;
export const MAX_EXCLUSIVITY_MONTHS = 60;
export const MAX_COMPETITORS = 20;
export const MAX_EXCLUSIVITY_SEGMENTS = 10;

export type Rights = {
  channels: UsageChannel[];
  usageMonths: number | null;
  perpetual: boolean;
  boost: boolean;
  exclusive: boolean;
  segmentIds: string[];
  /** nomes dos segmentos (o banco resolve; a marca não lê os segmentos da agência) */
  segments: string[];
  category: string;
  competitors: string[];
  exclusivityMonths: number | null;
};

export const EMPTY_RIGHTS: Rights = { channels: [], usageMonths: null, perpetual: false, boost: false, exclusive: false, segmentIds: [], segments: [], category: "", competitors: [], exclusivityMonths: null };

export function isUsageChannel(v: unknown): v is UsageChannel {
  return typeof v === "string" && (USAGE_CHANNELS as readonly string[]).includes(v);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/** JSON de deal_execution (terms[].rights) → Rights. Campos desconhecidos são ignorados. */
export function toRights(raw: unknown): Rights {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_RIGHTS };
  const r = raw as Record<string, unknown>;
  const order = (c: UsageChannel) => USAGE_CHANNELS.indexOf(c);
  return {
    channels: Array.from(new Set(strings(r.channels).filter(isUsageChannel))).sort((a, b) => order(a) - order(b)),
    usageMonths: intOrNull(r.usage_months),
    perpetual: r.perpetual === true,
    boost: r.boost === true,
    exclusive: r.exclusive === true,
    segmentIds: strings(r.segment_ids),
    segments: strings(r.segments),
    category: typeof r.category === "string" ? r.category : "",
    competitors: strings(r.competitors),
    exclusivityMonths: intOrNull(r.exclusivity_months),
  };
}

/** Algo foi definido (para mostrar o bloco ou "a definir"). */
export function rightsDefined(r: Rights): boolean {
  return r.channels.length > 0 || r.usageMonths !== null || r.perpetual || r.boost || r.exclusive;
}

/** "Marca A, marca a; Marca B" → ["Marca A", "Marca B"] (vírgula, ponto e vírgula ou linha). */
export function parseCompetitors(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const name = part.trim().replace(/\s+/g, " ");
    if (name.length < 2) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name.slice(0, 80));
    if (out.length >= MAX_COMPETITORS) break;
  }
  return out;
}

export type RightsIssue = "usage_months" | "exclusivity_months" | "too_many_segments" | "category_long";

/** Confere o que a tela vai mandar (o banco confere de novo). */
export function rightsIssue(r: Rights): RightsIssue | null {
  if (!r.perpetual && r.usageMonths !== null && (r.usageMonths < 1 || r.usageMonths > MAX_USAGE_MONTHS)) return "usage_months";
  if (r.exclusive) {
    if (r.exclusivityMonths === null || r.exclusivityMonths < 1 || r.exclusivityMonths > MAX_EXCLUSIVITY_MONTHS) return "exclusivity_months";
    if (r.segmentIds.length > MAX_EXCLUSIVITY_SEGMENTS) return "too_many_segments";
    if (r.category.trim().length > 120) return "category_long";
  }
  return null;
}

export type RpcPayload = { [key: string]: string | number | boolean | null | string[] };

/** Rights → p_data.rights da RPC agency_terms_save (sem exclusividade, os campos dela vão vazios). */
export function rightsPayload(r: Rights): RpcPayload {
  return {
    channels: r.channels.filter(isUsageChannel),
    usage_months: r.perpetual ? null : r.usageMonths,
    perpetual: r.perpetual,
    boost: r.boost,
    exclusive: r.exclusive,
    exclusivity_months: r.exclusive ? r.exclusivityMonths : null,
    category: r.exclusive ? r.category.trim() : "",
    segment_ids: r.exclusive ? Array.from(new Set(r.segmentIds)) : [],
    competitors: r.exclusive ? r.competitors : [],
  };
}
