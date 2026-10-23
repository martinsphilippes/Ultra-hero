// OAuth das marcas: state + PKCE (S256) guardados num cookie httpOnly assinado (HMAC), amarrado à
// marca e à pessoa logada, com validade de 10 minutos (§6.1 A, §15.4). Puro e testável.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { HealthProvider } from "./types";

export const OAUTH_COOKIE = "uh_wearable_oauth";
export const OAUTH_TTL_MS = 10 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32)); // 43 caracteres (RFC 7636: 43–128)
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier, "ascii").digest());
}

type StatePayload = { p: HealthProvider; u: string; s: string; v: string | null; e: number };

function sign(body: string, key: Buffer): string {
  return b64url(createHmac("sha256", key).update(body).digest());
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Cria o state (vai na URL da marca) e o valor do cookie que o confere na volta. */
export function createOAuthState(input: { provider: HealthProvider; userId: string; pkce: boolean; key: Buffer; now?: number }): {
  state: string;
  verifier: string | null;
  challenge: string | null;
  cookie: string;
} {
  const state = b64url(randomBytes(24));
  const pair = input.pkce ? pkcePair() : null;
  const payload: StatePayload = { p: input.provider, u: input.userId, s: state, v: pair?.verifier ?? null, e: (input.now ?? Date.now()) + OAUTH_TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return { state, verifier: pair?.verifier ?? null, challenge: pair?.challenge ?? null, cookie: `${body}.${sign(body, input.key)}` };
}

export type StateCheck = { ok: true; verifier: string | null } | { ok: false; reason: "missing" | "bad_signature" | "expired" | "provider_mismatch" | "user_mismatch" | "state_mismatch" };

/** Confere o cookie contra o state devolvido pela marca, a marca da rota e a pessoa logada. */
export function verifyOAuthState(input: { cookie: string | undefined; state: string | null; provider: HealthProvider; userId: string; key: Buffer; now?: number }): StateCheck {
  if (!input.cookie || !input.state) return { ok: false, reason: "missing" };
  const [body, mac] = input.cookie.split(".");
  if (!body || !mac || !safeEqual(mac, sign(body, input.key))) return { ok: false, reason: "bad_signature" };
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (payload.e < (input.now ?? Date.now())) return { ok: false, reason: "expired" };
  if (payload.p !== input.provider) return { ok: false, reason: "provider_mismatch" };
  if (payload.u !== input.userId) return { ok: false, reason: "user_mismatch" };
  if (!safeEqual(payload.s, input.state)) return { ok: false, reason: "state_mismatch" };
  return { ok: true, verifier: payload.v };
}

/** URL de autorização da marca (redirect_uri fixa por ambiente). */
export function authorizeUrl(input: { base: string; clientId: string; redirectUri: string; scopes: readonly string[]; state: string; challenge: string | null }): string {
  const url = new URL(input.base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  if (input.scopes.length > 0) url.searchParams.set("scope", input.scopes.join(" "));
  if (input.challenge) {
    url.searchParams.set("code_challenge", input.challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/** Login recente (≤ 5 min) para conceder ou ampliar o consentimento (§15.9). */
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;
export function recentlyAuthenticated(lastSignInAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  return Number.isFinite(t) && now - t <= REAUTH_WINDOW_MS && t <= now + 60_000;
}
