import type { Audience } from "./schemas";
import { AGE_BANDS, GENDER_KEYS, isKitField, STALE_METRIC_DAYS, type KitField, type Network } from "./vocab";

// Media kit (lógica pura, testada): a prévia do editor e a página pública /kit usam o mesmo formato,
// o de public.media_kit_resolve (0065). Nunca há valor (cachê, preço) aqui.

export type DeclaredSide = "talent" | "agency" | "integration";

/** Rede como o kit a devolve: só as métricas marcadas aparecem (chave ausente = não marcada). */
export type KitNetwork = {
  network: Network;
  handle: string;
  url?: string | null;
  source: "declared" | "integration";
  as_of: string;
  declared_side: DeclaredSide;
  declared_at?: string | null;
  followers?: number | null;
  avg_views?: number | null;
  avg_reach?: number | null;
  engagement_bp?: number | null;
  audience?: Audience | null;
};

export type ResolvedKit = {
  name: string;
  fields: KitField[];
  expires_at?: string | null;
  photo_url?: string | null;
  headline?: string;
  about?: string;
  city?: string | null;
  state?: string | null;
  segments?: string[];
  networks?: KitNetwork[];
  brands?: { name: string; logo_url: string | null }[];
  agency?: string;
  agency_email?: string | null;
};

/** Rede completa (como o banco guarda), antes do filtro de campos. */
export type SocialRow = {
  network: Network;
  handle: string;
  url: string | null;
  followers: number | null;
  avg_views: number | null;
  avg_reach: number | null;
  engagement_bp: number | null;
  audience: unknown;
  source: "declared" | "integration";
  as_of: string;
  declared_side: DeclaredSide;
  updated_at: string;
};

export type KitSource = {
  name: string;
  photoUrl: string | null;
  city: string | null;
  state: string | null;
  segments: string[];
  networks: SocialRow[];
  headline: string;
  about: string;
  visibleFields: readonly string[];
  brands: { name: string; logo_url: string | null }[];
  agencyName: string;
  agencyEmail: string | null;
};

function nonEmptyAudience(value: unknown): Audience | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.keys(value).length > 0 ? (value as Audience) : null;
}

/** Mesmo filtro de public.media_kit_resolve: nome sempre; o resto só se o campo está marcado. */
export function buildKit(source: KitSource, expiresAt: string | null = null): ResolvedKit {
  const fields = source.visibleFields.filter(isKitField);
  const has = (f: KitField) => fields.includes(f);
  const kit: ResolvedKit = { name: source.name, fields, expires_at: expiresAt };
  if (has("photo")) kit.photo_url = source.photoUrl;
  if (has("headline")) kit.headline = source.headline;
  if (has("about")) kit.about = source.about;
  if (has("location")) {
    kit.city = source.city;
    kit.state = source.state;
  }
  if (has("segments")) kit.segments = source.segments;
  if (has("networks")) {
    kit.networks = [...source.networks]
      .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))
      .map((n) => {
        const row: KitNetwork = {
          network: n.network,
          handle: n.handle,
          source: n.source,
          as_of: n.as_of,
          declared_side: n.declared_side,
          declared_at: n.updated_at.slice(0, 10),
        };
        if (n.url) row.url = n.url;
        if (has("followers") && n.followers !== null) row.followers = n.followers;
        if (has("views") && n.avg_views !== null) row.avg_views = n.avg_views;
        if (has("reach") && n.avg_reach !== null) row.avg_reach = n.avg_reach;
        if (has("engagement") && n.engagement_bp !== null) row.engagement_bp = n.engagement_bp;
        const audience = nonEmptyAudience(n.audience);
        if (has("audience") && audience) row.audience = audience;
        return row;
      });
  }
  if (has("brands") && source.brands.length > 0) kit.brands = source.brands;
  if (has("agency_contact")) {
    kit.agency = source.agencyName;
    kit.agency_email = source.agencyEmail;
  }
  return kit;
}

/** Audiência dos gráficos: a da rede com a maior base de seguidores que declarou audiência. */
export function pickAudience(networks: readonly KitNetwork[]): (KitNetwork & { audience: Audience }) | null {
  const withAudience = networks.filter((n): n is KitNetwork & { audience: Audience } => nonEmptyAudience(n.audience) !== null);
  if (withAudience.length === 0) return null;
  return [...withAudience].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0];
}

export type Bar = { key: string; bp: number };

/** Barras de gênero e faixa etária na ordem fixa; grupo vazio → null ("não informado"). */
export function audienceBars(audience: Audience | null | undefined): { gender: Bar[] | null; age: Bar[] | null } {
  const gender = GENDER_KEYS.filter((k) => audience?.gender?.[k] !== undefined).map((k) => ({ key: k, bp: audience?.gender?.[k] ?? 0 }));
  const age = AGE_BANDS.filter((k) => audience?.age?.[k] !== undefined).map((k) => ({ key: k, bp: audience?.age?.[k] ?? 0 }));
  return { gender: gender.length > 0 ? gender : null, age: age.length > 0 ? age : null };
}

/** Pontos-base → "2,35%" (o idioma decide a vírgula). */
export function formatBp(bp: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100)}%`;
}

/** Número compacto ("48,2 mil", "1,2 mi") ou null (o chamador escreve "não informado", nunca zero). */
export function formatCount(value: number | null | undefined, locale: string): string | null {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat(locale, { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

/** Métrica com mais de um ano: a tela avisa "desatualizado". */
export function isStale(asOf: string, today = new Date()): boolean {
  const day = new Date(`${asOf}T00:00:00Z`).getTime();
  if (Number.isNaN(day)) return false;
  return (today.getTime() - day) / 86_400_000 > STALE_METRIC_DAYS;
}

/** Algum campo de rede (métrica) marcado sem "networks"? (a prévia avisa que ele não aparece) */
export function orphanMetricFields(fields: readonly string[]): string[] {
  if (fields.includes("networks")) return [];
  return fields.filter((f) => ["followers", "views", "reach", "engagement", "audience"].includes(f));
}

/** Chaves que nunca podem existir num kit (teste de regressão: nenhum valor sai pelo /kit). */
export const FORBIDDEN_KIT_KEYS = /(cents|amount|fee|price|budget|commission|internal_notes|commercial_status|contact_phone|contact_email|manager)/i;
