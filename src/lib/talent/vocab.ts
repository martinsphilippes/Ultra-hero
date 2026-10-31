// Listas fechadas do casting e do media kit (iguais aos checks da 0065; o banco confere de novo).

export const NETWORKS = ["instagram", "tiktok", "youtube", "x", "facebook", "kwai", "twitch", "linkedin", "pinterest", "threads", "other"] as const;
export type Network = (typeof NETWORKS)[number];

export const AGE_BANDS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GENDER_KEYS = ["female", "male", "other"] as const;
export type GenderKey = (typeof GENDER_KEYS)[number];

/** Campos que o talento ou a agência escolhem mostrar no kit (o nome é sempre visível). */
export const KIT_FIELDS = ["photo", "headline", "about", "location", "segments", "networks", "followers", "views", "reach", "engagement", "audience", "brands", "agency_contact"] as const;
export type KitField = (typeof KIT_FIELDS)[number];
export const DEFAULT_KIT_FIELDS: KitField[] = ["headline", "about", "segments", "networks", "followers"];

/** Campos que só fazem sentido com "networks" ligado (são colunas das redes). */
export const NETWORK_METRIC_FIELDS: KitField[] = ["followers", "views", "reach", "engagement", "audience"];

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export type Uf = (typeof UFS)[number];

export const COMMERCIAL_STATUSES = ["prospect", "active", "paused", "inactive"] as const;
export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number];

export const AVAILABILITIES = ["available", "limited", "unavailable"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

/** Versão do termo de uso comercial (LGPD) que o talento aceita no escritório. */
export const CONSENT_VERSION = "2026-10";

/** Validades oferecidas para o link público do kit (o banco aceita de 1 a 90 dias). */
export const KIT_LINK_DAYS = [7, 30, 90] as const;

/** Métrica "antiga" (só aviso visual; a busca da marca, na etapa C, deixa de pontuar). */
export const STALE_METRIC_DAYS = 365;

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value);
}
export function isKitField(value: unknown): value is KitField {
  return typeof value === "string" && (KIT_FIELDS as readonly string[]).includes(value);
}
