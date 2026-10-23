// Chave geral e prontidão de cada marca. Tudo DESLIGADO por padrão: só com WEARABLES_REAL_ENABLED=1
// E todas as variáveis daquela marca presentes a marca aparece como "Conectar"; senão o card segue
// com "Em breve" como hoje. Puro (recebe o ambiente), para testar sem process.env.

import { PROVIDERS } from "./providers";
import { HEALTH_PROVIDERS, type HealthProvider } from "./types";

export type Env = Record<string, string | undefined>;

/** Variáveis comuns a todas as marcas (banco de ingestão, cifra dos tokens, URL pública). */
export const COMMON_ENV = ["HEALTH_INGEST_DATABASE_URL", "WEARABLE_TOKEN_KEY_V1", "NEXT_PUBLIC_SITE_URL"] as const;

export function wearablesRealEnabled(env: Env = process.env): boolean {
  return env.WEARABLES_REAL_ENABLED === "1";
}

/** Token de caminho do webhook da Garmin: ≥ 128 bits (32+ caracteres base64url/hex). */
export function isStrongPathToken(token: string | undefined): boolean {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

/** Chave AES-256 em base64 (32 bytes). */
export function isTokenKey(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

/** O que falta para a marca funcionar (nomes das variáveis, nunca os valores). */
export function missingEnv(provider: HealthProvider, env: Env = process.env): string[] {
  const def = PROVIDERS[provider];
  const missing: string[] = [];
  for (const name of [...COMMON_ENV, def.envClientId, def.envClientSecret, ...def.envExtra]) {
    if (!env[name]) missing.push(name);
  }
  if (env.WEARABLE_TOKEN_KEY_V1 && !isTokenKey(env.WEARABLE_TOKEN_KEY_V1) && !missing.includes("WEARABLE_TOKEN_KEY_V1")) missing.push("WEARABLE_TOKEN_KEY_V1");
  if (provider === "garmin" && env.GARMIN_WEBHOOK_PATH_TOKEN && !isStrongPathToken(env.GARMIN_WEBHOOK_PATH_TOKEN)) missing.push("GARMIN_WEBHOOK_PATH_TOKEN");
  return missing;
}

export function providerReady(provider: HealthProvider, env: Env = process.env): boolean {
  return wearablesRealEnabled(env) && missingEnv(provider, env).length === 0;
}

/** Marcas que a conta real pode conectar neste ambiente (vazio com a chave desligada). */
export function availableProviders(env: Env = process.env): HealthProvider[] {
  if (!wearablesRealEnabled(env)) return [];
  return HEALTH_PROVIDERS.filter((p) => providerReady(p, env));
}

/** URL pública do site sem barra final (redirect_uri fixa por ambiente). */
export function siteUrl(env: Env = process.env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

export function callbackUrl(provider: HealthProvider, env: Env = process.env): string {
  return `${siteUrl(env)}/api/wearables/${provider}/callback`;
}
