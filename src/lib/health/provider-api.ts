import "server-only";
import { pickAllowed } from "./adapters/common";
import { WHOOP_ALLOWED } from "./adapters/whoop";
import { callbackUrl } from "./config";
import { PROVIDERS } from "./providers";
import { isAllowedProviderUrl } from "./ssrf";
import type { HealthProvider } from "./types";

// Chamadas às APIs das marcas (troca de código, renovação, id da pessoa, busca do recurso,
// revogação). Só para os hosts da marca (anti-SSRF), sem seguir redirecionamento, com tempo
// máximo. Erros viram códigos enumerados (nunca a resposta da marca nos logs).

export class ProviderError extends Error {
  constructor(public code: string, public status = 0) {
    super(code);
    this.name = "ProviderError";
  }
}

const TIMEOUT_MS = 10_000;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new ProviderError("provider_not_configured");
  return v;
}

async function call(provider: HealthProvider, url: string, init: RequestInit = {}): Promise<Response> {
  if (!isAllowedProviderUrl(url, [...PROVIDERS[provider].apiHosts, new URL(PROVIDERS[provider].tokenUrl).hostname])) {
    throw new ProviderError("ssrf_blocked");
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ProviderError("provider_unreachable");
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("provider_unauthorized", res.status);
  if (res.status === 404) throw new ProviderError("provider_not_found", 404);
  if (res.status === 429) throw new ProviderError("provider_rate_limited", 429);
  if (!res.ok) throw new ProviderError(`provider_http_${res.status}`, res.status);
  return res;
}

async function json(provider: HealthProvider, url: string, accessToken: string): Promise<unknown> {
  const res = await call(provider, url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (res.status === 204) return null;
  return res.json();
}

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date | null; providerUserId: string | null };

async function tokenRequest(provider: HealthProvider, params: Record<string, string>): Promise<TokenSet> {
  const def = PROVIDERS[provider];
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (def.tokenAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${env(def.envClientId)}:${env(def.envClientSecret)}`).toString("base64")}`;
  } else {
    body.set("client_id", env(def.envClientId));
    body.set("client_secret", env(def.envClientSecret));
  }
  const res = await call(provider, def.tokenUrl, { method: "POST", headers, body });
  const data = (await res.json()) as Record<string, unknown>;
  const access = typeof data.access_token === "string" ? data.access_token : null;
  if (!access) throw new ProviderError("token_missing");
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;
  // Polar devolve o id da pessoa no próprio token (x_user_id)
  const xUser = data.x_user_id;
  return {
    accessToken: access,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    providerUserId: typeof xUser === "number" || typeof xUser === "string" ? String(xUser) : null,
  };
}

export function exchangeCode(provider: HealthProvider, code: string, verifier: string | null): Promise<TokenSet> {
  const params: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: callbackUrl(provider) };
  if (verifier) params.code_verifier = verifier;
  return tokenRequest(provider, params);
}

export function refreshTokens(provider: HealthProvider, refreshToken: string): Promise<TokenSet> {
  return tokenRequest(provider, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Id da pessoa na marca: só o id é lido (lista permitida); nome, e-mail, peso e altura não. */
export async function fetchProviderUserId(provider: HealthProvider, accessToken: string, fromToken: string | null): Promise<string> {
  if (provider === "polar") {
    if (!fromToken) throw new ProviderError("provider_user_missing");
    return fromToken;
  }
  const url = {
    garmin: "https://apis.garmin.com/wellness-api/rest/user/id",
    oura: "https://api.ouraring.com/v2/usercollection/personal_info",
    whoop: "https://api.prod.whoop.com/developer/v2/user/profile/basic",
  }[provider];
  const data = (await json(provider, url, accessToken)) as Record<string, unknown> | null;
  const picked = pickAllowed(data, provider === "whoop" ? WHOOP_ALLOWED.profile : provider === "garmin" ? ["userId"] : ["id"]);
  const id = picked.userId ?? picked.user_id ?? picked.id;
  if (typeof id !== "string" && typeof id !== "number") throw new ProviderError("provider_user_missing");
  return String(id);
}

/** Polar exige registrar a pessoa no AccessLink depois do OAuth (409 = já registrada). */
export async function registerPolarUser(accessToken: string, memberId: string): Promise<void> {
  try {
    await call("polar", "https://www.polaraccesslink.com/v3/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ "member-id": memberId }),
    });
  } catch (error) {
    if (error instanceof ProviderError && error.status === 409) return;
    throw error;
  }
}

/** Busca um documento da marca com o token da pessoa (URL montada aqui, nunca vinda de terceiros). */
export function fetchJson(provider: HealthProvider, url: string, accessToken: string): Promise<unknown> {
  return json(provider, url, accessToken);
}

/** Revogação na marca (§8.3): desconectar e excluir conta nunca esperam por ela. */
export async function revokeAtProvider(provider: HealthProvider, accessToken: string, providerUserId: string | null): Promise<void> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  switch (provider) {
    case "garmin":
      await call("garmin", "https://apis.garmin.com/wellness-api/rest/user/registration", { method: "DELETE", headers: auth });
      return;
    case "oura":
      await call("oura", `https://api.ouraring.com/oauth/revoke?access_token=${encodeURIComponent(accessToken)}`, { method: "GET" });
      return;
    case "whoop":
      await call("whoop", "https://api.prod.whoop.com/developer/v2/user/access", { method: "DELETE", headers: auth });
      return;
    case "polar":
      if (!providerUserId) throw new ProviderError("provider_user_missing");
      await call("polar", `https://www.polaraccesslink.com/v3/users/${encodeURIComponent(providerUserId)}`, { method: "DELETE", headers: auth });
      return;
  }
}
