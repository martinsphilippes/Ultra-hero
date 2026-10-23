// Definição estática das marcas web (Garmin, Oura, WHOOP e Polar): endpoints OAuth, escopos por
// categoria consentida, variáveis de ambiente exigidas e a coluna da matriz (§13.3) que cada uma
// representa. Puro: não lê process.env (config.ts decide se a marca está ligada).
// Endpoints conferidos na documentação pública de cada marca; os marcados [NC] devem ser
// reconferidos no portal de desenvolvedor no cadastro (roteiro de ligar).

import { metricDef, type MetricCode, type WatchBrand, type WatchModelId } from "@/lib/wearables/catalog";
import { GARMIN_INGESTED_CODES } from "./adapters/garmin";
import { OURA_INGESTED_CODES } from "./adapters/oura";
import { POLAR_INGESTED_CODES } from "./adapters/polar";
import { WHOOP_INGESTED_CODES } from "./adapters/whoop";
import type { HealthCategory, HealthProvider } from "./types";

export type ProviderDef = {
  id: HealthProvider;
  brand: WatchBrand;
  /** Coluna da matriz §13.3 usada para "o que este aparelho pode medir". */
  model: WatchModelId;
  authorizeUrl: string;
  tokenUrl: string;
  /** PKCE (S256) além do state. */
  pkce: boolean;
  /** Como o client_secret vai na troca do código: no corpo ou em Basic auth. */
  tokenAuth: "body" | "basic";
  envClientId: string;
  envClientSecret: string;
  /** Outras variáveis obrigatórias (segredo de webhook, token de caminho). */
  envExtra: readonly string[];
  /** Hosts da API da marca: o único destino de fetch com o token da pessoa (anti-SSRF). */
  apiHosts: readonly string[];
};

export const PROVIDERS: Record<HealthProvider, ProviderDef> = {
  // Garmin Connect Developer Program — Health API com OAuth 2.0 + PKCE [NC: confirmar no portal].
  garmin: {
    id: "garmin",
    brand: "garmin",
    model: "garmin_fenix",
    authorizeUrl: "https://connect.garmin.com/oauth2Confirm",
    tokenUrl: "https://diauth.garmin.com/di-oauth2-service/oauth/token",
    pkce: true,
    tokenAuth: "body",
    envClientId: "GARMIN_CLIENT_ID",
    envClientSecret: "GARMIN_CLIENT_SECRET",
    // token de caminho do webhook (≥ 128 bits), rotacionável com GARMIN_WEBHOOK_PATH_TOKEN_PREVIOUS
    envExtra: ["GARMIN_WEBHOOK_PATH_TOKEN"],
    apiHosts: ["apis.garmin.com"],
  },
  // Oura API v2 — https://cloud.ouraring.com/v2/docs
  oura: {
    id: "oura",
    brand: "oura",
    model: "oura",
    authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    pkce: false,
    tokenAuth: "body",
    envClientId: "OURA_CLIENT_ID",
    envClientSecret: "OURA_CLIENT_SECRET",
    // token de verificação da inscrição do webhook (desafio GET)
    envExtra: ["OURA_WEBHOOK_VERIFICATION_TOKEN"],
    apiHosts: ["api.ouraring.com"],
  },
  // WHOOP Developer Platform v2 — https://developer.whoop.com/api
  whoop: {
    id: "whoop",
    brand: "whoop",
    model: "whoop",
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    pkce: false,
    tokenAuth: "body",
    envClientId: "WHOOP_CLIENT_ID",
    envClientSecret: "WHOOP_CLIENT_SECRET",
    envExtra: [],
    apiHosts: ["api.prod.whoop.com"],
  },
  // Polar AccessLink v3 — https://www.polar.com/accesslink-api/
  polar: {
    id: "polar",
    brand: "polar",
    model: "polar",
    authorizeUrl: "https://flow.polar.com/oauth2/authorization",
    tokenUrl: "https://polarremote.com/v2/oauth2/token",
    pkce: false,
    tokenAuth: "basic",
    envClientId: "POLAR_CLIENT_ID",
    envClientSecret: "POLAR_CLIENT_SECRET",
    // signature_secret_key devolvida ao criar o webhook (POST /v3/webhooks)
    envExtra: ["POLAR_WEBHOOK_SECRET"],
    apiHosts: ["www.polaraccesslink.com"],
  },
};

/** O que cada adaptador grava de fato (as quatro marcas também gravam treinos). */
export const PROVIDER_INGESTED_CODES: Record<HealthProvider, readonly MetricCode[]> = {
  garmin: GARMIN_INGESTED_CODES,
  oura: OURA_INGESTED_CODES,
  whoop: WHOOP_INGESTED_CODES,
  polar: POLAR_INGESTED_CODES,
};

/**
 * Códigos que aparecem desta marca: o gravado pelo adaptador e o que o Hoje real monta a partir disso
 * (agregados e zonas dos treinos, semana de intensidade, desvio da temperatura absoluta).
 */
export function providerMeasures(provider: HealthProvider): Set<string> {
  const codes = new Set<string>(PROVIDER_INGESTED_CODES[provider]);
  for (const c of ["workout_count", "workout_min", "workout_kcal", "workout_distance_m", "workout_pace_s_per_km", "hr_zone1_min", "hr_zone2_min", "hr_zone3_min", "hr_zone4_min", "hr_zone5_min"]) codes.add(c);
  if (codes.has("intensity_min_moderate")) codes.add("intensity_min_week");
  if (codes.has("skin_temp_c")) codes.add("skin_temp_delta_c");
  return codes;
}

/**
 * Categorias que a marca entrega DE FATO (códigos que o adaptador grava + treinos), na ordem do
 * enum. A tela de consentimento só oferece estas: nada de autorizar dado que nunca vem (ex.: WHOOP
 * não manda passos; Polar não manda temperatura). Índices calculados por nós não contam.
 */
export function providerCategories(provider: HealthProvider): HealthCategory[] {
  const set = new Set<HealthCategory>(["workout"]);
  for (const code of PROVIDER_INGESTED_CODES[provider]) {
    const def = metricDef(code);
    if (def) set.add(def.category as HealthCategory);
  }
  const order: HealthCategory[] = ["readiness", "sleep", "heart", "activity", "workout", "breathing", "temperature", "stress", "environment", "safety"];
  return order.filter((c) => set.has(c));
}

/**
 * Escopos pedidos à marca: só os das categorias consentidas (§15.4). Nada de escopo de peso,
 * tags/anotações ou outros dados digitados. Garmin e Polar não têm escopo por tipo de dado: as
 * permissões são da aplicação (Garmin: escolhidas pela pessoa na tela da Garmin) e o filtro por
 * categoria acontece na ingestão (normalizador + gatilho do banco).
 */
export function providerScopes(provider: HealthProvider, categories: readonly HealthCategory[]): string[] {
  const has = (...cs: HealthCategory[]) => cs.some((c) => categories.includes(c));
  switch (provider) {
    case "oura": {
      // personal só para o id da pessoa (lista permitida lê apenas `id`; peso/altura são ignorados) [NC]
      const scopes = ["personal"];
      if (has("readiness", "sleep", "activity", "temperature", "stress", "heart")) scopes.push("daily");
      if (has("workout")) scopes.push("workout");
      if (has("breathing")) scopes.push("spo2Daily");
      return scopes;
    }
    case "whoop": {
      // read:profile só para o user_id; read:body_measurement (peso/altura) NUNCA é pedido
      const scopes = ["offline", "read:profile"];
      if (has("readiness", "heart", "breathing", "temperature")) scopes.push("read:recovery");
      if (has("readiness", "heart", "activity")) scopes.push("read:cycles");
      if (has("sleep", "breathing")) scopes.push("read:sleep");
      if (has("workout")) scopes.push("read:workout");
      return scopes;
    }
    case "polar":
      return ["accesslink.read_all"];
    case "garmin":
      return [];
  }
}
