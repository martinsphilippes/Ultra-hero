import { createHash, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { availableProviders, isStrongPathToken, missingEnv, providerReady, wearablesRealEnabled, type Env } from "@/lib/health/config";
import { decryptToken, encryptToken, stateKey } from "@/lib/health/crypto";
import { authorizeUrl, createOAuthState, OAUTH_TTL_MS, pkceChallenge, pkcePair, recentlyAuthenticated, verifyOAuthState } from "@/lib/health/oauth";
import { providerCategories, providerScopes, PROVIDERS } from "@/lib/health/providers";
import { isAllowedProviderUrl } from "@/lib/health/ssrf";
import { parseTimestamp, verifyGarminPathToken, verifyOura, verifyPolar, verifyWhoop } from "@/lib/health/webhooks";

// Segurança da integração (§9.4, §15): chave geral desligada por padrão, assinatura dos webhooks,
// OAuth com state + PKCE amarrado à pessoa, cifra dos tokens com AAD, anti-SSRF.

const KEY = randomBytes(32).toString("base64");
const fullEnv = (extra: Env = {}): Env => ({
  WEARABLES_REAL_ENABLED: "1",
  HEALTH_INGEST_DATABASE_URL: "postgres://health_ingest:x@localhost:5432/db",
  WEARABLE_TOKEN_KEY_V1: KEY,
  NEXT_PUBLIC_SITE_URL: "https://app.example",
  GARMIN_CLIENT_ID: "g",
  GARMIN_CLIENT_SECRET: "gs",
  GARMIN_WEBHOOK_PATH_TOKEN: "a".repeat(43),
  OURA_CLIENT_ID: "o",
  OURA_CLIENT_SECRET: "os",
  OURA_WEBHOOK_VERIFICATION_TOKEN: "ov",
  WHOOP_CLIENT_ID: "w",
  WHOOP_CLIENT_SECRET: "ws",
  POLAR_CLIENT_ID: "p",
  POLAR_CLIENT_SECRET: "ps",
  POLAR_WEBHOOK_SECRET: "pw",
  ...extra,
});

describe("chave WEARABLES_REAL_ENABLED e credenciais por marca", () => {
  it("desligada por padrão: nenhuma marca, mesmo com todas as credenciais", () => {
    expect(wearablesRealEnabled({})).toBe(false);
    expect(availableProviders({ ...fullEnv(), WEARABLES_REAL_ENABLED: undefined })).toEqual([]);
    expect(availableProviders({ ...fullEnv(), WEARABLES_REAL_ENABLED: "true" })).toEqual([]);
  });

  it("ligada: só as marcas com TODAS as variáveis (falta de uma = 'em breve')", () => {
    expect(availableProviders(fullEnv())).toEqual(["garmin", "oura", "whoop", "polar"]);
    expect(availableProviders(fullEnv({ POLAR_WEBHOOK_SECRET: undefined }))).toEqual(["garmin", "oura", "whoop"]);
    expect(availableProviders(fullEnv({ HEALTH_INGEST_DATABASE_URL: undefined }))).toEqual([]);
    expect(missingEnv("whoop", fullEnv({ WHOOP_CLIENT_SECRET: "" }))).toEqual(["WHOOP_CLIENT_SECRET"]);
  });

  it("Garmin exige token de caminho de 128+ bits e chave AES de 32 bytes", () => {
    expect(isStrongPathToken("a".repeat(31))).toBe(false);
    expect(isStrongPathToken(randomBytes(24).toString("base64url"))).toBe(true);
    expect(providerReady("garmin", fullEnv({ GARMIN_WEBHOOK_PATH_TOKEN: "curto" }))).toBe(false);
    expect(providerReady("oura", fullEnv({ WEARABLE_TOKEN_KEY_V1: Buffer.from("curta").toString("base64") }))).toBe(false);
  });

  it("escopos só das categorias consentidas; nunca peso/medidas nem tags", () => {
    expect(providerScopes("whoop", ["sleep"])).toEqual(["offline", "read:profile", "read:sleep"]);
    expect(providerScopes("whoop", ["readiness", "workout"])).toEqual(["offline", "read:profile", "read:recovery", "read:cycles", "read:workout"]);
    expect(providerScopes("oura", ["workout"])).toEqual(["personal", "workout"]);
    const all = (["garmin", "oura", "whoop", "polar"] as const).flatMap((p) => providerScopes(p, ["readiness", "sleep", "heart", "activity", "workout", "breathing", "temperature", "stress"]));
    expect(all.join(" ")).not.toMatch(/body_measurement|tag|email/);
  });

  it("categorias que cada marca pode entregar (matriz §13.3)", () => {
    expect(providerCategories("garmin")).toEqual(["readiness", "sleep", "heart", "activity", "workout", "breathing", "temperature", "stress"]);
    expect(providerCategories("whoop")).not.toContain("stress");
    expect(providerCategories("polar")).not.toContain("stress");
    for (const p of ["garmin", "oura", "whoop", "polar"] as const) {
      expect(providerCategories(p)).not.toContain("environment");
      expect(providerCategories(p)).not.toContain("safety");
    }
  });
});

describe("assinatura dos webhooks (inválida → 401 sem gravar)", () => {
  const body = JSON.stringify({ user_id: 1, id: "x", type: "sleep.updated" });
  const now = Date.parse("2026-10-22T12:00:00Z");

  it("WHOOP: base64(HMAC(segredo, carimbo + corpo)), carimbo de até 5 min", () => {
    const ts = String(now);
    const sig = createHmac("sha256", "ws").update(ts + body).digest("base64");
    expect(verifyWhoop({ body, signature: sig, timestamp: ts, secret: "ws", now })).toBe(true);
    expect(verifyWhoop({ body: body + " ", signature: sig, timestamp: ts, secret: "ws", now })).toBe(false);
    expect(verifyWhoop({ body, signature: sig, timestamp: ts, secret: "outro", now })).toBe(false);
    expect(verifyWhoop({ body, signature: sig, timestamp: ts, secret: "ws", now: now + 6 * 60_000 })).toBe(false);
    expect(verifyWhoop({ body, signature: null, timestamp: ts, secret: "ws", now })).toBe(false);
  });

  it("Oura: hex(HMAC(segredo, carimbo + corpo)), sem diferenciar caixa", () => {
    const ts = "2026-10-22T11:59:00Z";
    const sig = createHmac("sha256", "os").update(ts + body).digest("hex").toUpperCase();
    expect(verifyOura({ body, signature: sig, timestamp: ts, secret: "os", now })).toBe(true);
    expect(verifyOura({ body, signature: sig, timestamp: "2026-10-22T11:00:00Z", secret: "os", now })).toBe(false);
    expect(verifyOura({ body, signature: "00", timestamp: ts, secret: "os", now })).toBe(false);
  });

  it("Polar: hex(HMAC(signature_secret_key, corpo))", () => {
    const sig = createHmac("sha256", "pw").update(body).digest("hex");
    expect(verifyPolar({ body, signature: sig, secret: "pw" })).toBe(true);
    expect(verifyPolar({ body: body.replace("1", "2"), signature: sig, secret: "pw" })).toBe(false);
    expect(verifyPolar({ body, signature: null, secret: "pw" })).toBe(false);
  });

  it("Garmin: token de caminho em tempo constante; o anterior vale durante a rotação", () => {
    const cur = "c".repeat(43);
    const prev = "p".repeat(43);
    expect(verifyGarminPathToken(cur, cur, prev)).toBe(true);
    expect(verifyGarminPathToken(prev, cur, prev)).toBe(true);
    expect(verifyGarminPathToken("x".repeat(43), cur, prev)).toBe(false);
    expect(verifyGarminPathToken(undefined, cur)).toBe(false);
    expect(verifyGarminPathToken(cur, undefined)).toBe(false);
  });

  it("carimbos em segundos, milissegundos e ISO", () => {
    expect(parseTimestamp("1792670400")).toBe(1792670400000);
    expect(parseTimestamp("1792670400000")).toBe(1792670400000);
    expect(parseTimestamp("2026-10-22T12:00:00Z")).toBe(now);
    expect(parseTimestamp("ontem")).toBeNull();
  });
});

describe("OAuth: state + PKCE", () => {
  const key = randomBytes(32);

  it("PKCE S256 (RFC 7636): desafio = base64url(SHA-256(verificador)), verificador de 43 caracteres", () => {
    const v = "verificador-de-teste-com-43-caracteres-xyzw";
    expect(pkceChallenge(v)).toBe(createHash("sha256").update(v).digest("base64url"));
    expect(pkceChallenge(v)).not.toMatch(/[+/=]/);
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(pkceChallenge(verifier));
  });

  it("state confere marca, pessoa, valor e validade; cookie adulterado falha", () => {
    const now = 1_000_000;
    const s = createOAuthState({ provider: "garmin", userId: "u1", pkce: true, key, now });
    expect(s.challenge).toBe(pkceChallenge(s.verifier!));
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, provider: "garmin", userId: "u1", key, now: now + 1000 })).toEqual({ ok: true, verifier: s.verifier });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, provider: "oura", userId: "u1", key, now })).toMatchObject({ ok: false, reason: "provider_mismatch" });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, provider: "garmin", userId: "u2", key, now })).toMatchObject({ ok: false, reason: "user_mismatch" });
    expect(verifyOAuthState({ cookie: s.cookie, state: "outro", provider: "garmin", userId: "u1", key, now })).toMatchObject({ ok: false, reason: "state_mismatch" });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, provider: "garmin", userId: "u1", key, now: now + OAUTH_TTL_MS + 1 })).toMatchObject({ ok: false, reason: "expired" });
    const [body, mac] = s.cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), u: "u2" })).toString("base64url");
    expect(verifyOAuthState({ cookie: `${forged}.${mac}`, state: s.state, provider: "garmin", userId: "u2", key, now })).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyOAuthState({ cookie: s.cookie, state: s.state, provider: "garmin", userId: "u1", key: randomBytes(32), now })).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyOAuthState({ cookie: undefined, state: s.state, provider: "garmin", userId: "u1", key, now })).toMatchObject({ ok: false, reason: "missing" });
  });

  it("marcas sem PKCE não guardam verificador", () => {
    expect(createOAuthState({ provider: "whoop", userId: "u1", pkce: false, key }).verifier).toBeNull();
  });

  it("URL de autorização com redirect fixo, escopos e PKCE", () => {
    const url = new URL(authorizeUrl({ base: PROVIDERS.garmin.authorizeUrl, clientId: "cid", redirectUri: "https://app.example/api/wearables/garmin/callback", scopes: [], state: "st", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://connect.garmin.com/oauth2Confirm");
    expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: "code", client_id: "cid", redirect_uri: "https://app.example/api/wearables/garmin/callback", state: "st", code_challenge: "ch", code_challenge_method: "S256" });
    const w = new URL(authorizeUrl({ base: PROVIDERS.whoop.authorizeUrl, clientId: "c", redirectUri: "r", scopes: ["offline", "read:sleep"], state: "s", challenge: null }));
    expect(w.searchParams.get("scope")).toBe("offline read:sleep");
    expect(w.searchParams.has("code_challenge")).toBe(false);
  });

  it("login recente (≤ 5 min) para conceder ou ampliar o consentimento", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(recentlyAuthenticated("2026-10-22T11:56:00Z", now)).toBe(true);
    expect(recentlyAuthenticated("2026-10-22T11:54:00Z", now)).toBe(false);
    expect(recentlyAuthenticated(null, now)).toBe(false);
    expect(recentlyAuthenticated("lixo", now)).toBe(false);
  });
});

describe("cifra dos tokens (AES-256-GCM, AAD = conexão + versão da chave)", () => {
  const env = { WEARABLE_TOKEN_KEY_V1: KEY, WEARABLE_TOKEN_KEY_V2: randomBytes(32).toString("base64") };

  it("ida e volta; nonce novo a cada cifra; o texto claro não aparece", () => {
    const a = encryptToken("token-secreto", "conn-1", env);
    const b = encryptToken("token-secreto", "conn-1", env);
    expect(a.keyVersion).toBe(1);
    expect(a.data.equals(b.data)).toBe(false);
    expect(a.data.toString("latin1")).not.toContain("token-secreto");
    expect(decryptToken(a.data, "conn-1", 1, env)).toBe("token-secreto");
  });

  it("outra conexão, versão errada ou byte trocado não decifram", () => {
    const a = encryptToken("token-secreto", "conn-1", env);
    expect(() => decryptToken(a.data, "conn-2", 1, env)).toThrow();
    expect(() => decryptToken(a.data, "conn-1", 2, env)).toThrow();
    const tampered = Buffer.from(a.data);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptToken(tampered, "conn-1", 1, env)).toThrow();
  });

  it("rotação: grava com a versão nova e ainda lê a antiga", () => {
    const old = encryptToken("t", "c", env);
    const rotated = encryptToken("t", "c", { ...env, WEARABLE_TOKEN_KEY_VERSION: "2" });
    expect(rotated.keyVersion).toBe(2);
    expect(decryptToken(old.data, "c", 1, env)).toBe("t");
    expect(decryptToken(rotated.data, "c", 2, env)).toBe("t");
  });

  it("sem chave, falha fechado; a chave do cookie do OAuth é derivada (não é a própria chave)", () => {
    expect(() => encryptToken("t", "c", {})).toThrow("wearable_token_key_missing");
    expect(stateKey(env).equals(Buffer.from(KEY, "base64"))).toBe(false);
    expect(stateKey(env)).toHaveLength(32);
  });
});

describe("anti-SSRF nas buscas com o token da pessoa", () => {
  const hosts = ["apis.garmin.com"];
  it("só https, host exato, sem credenciais nem porta, no caminho da API", () => {
    expect(isAllowedProviderUrl("https://apis.garmin.com/wellness-api/rest/dailies?x=1", hosts, "/wellness-api/rest/")).toBe(true);
    expect(isAllowedProviderUrl("http://apis.garmin.com/wellness-api/rest/dailies", hosts)).toBe(false);
    expect(isAllowedProviderUrl("https://apis.garmin.com.evil.example/wellness-api/rest/", hosts)).toBe(false);
    expect(isAllowedProviderUrl("https://evil.example/?u=https://apis.garmin.com", hosts)).toBe(false);
    expect(isAllowedProviderUrl("https://user:pw@apis.garmin.com/wellness-api/rest/", hosts)).toBe(false);
    expect(isAllowedProviderUrl("https://apis.garmin.com:8443/wellness-api/rest/", hosts)).toBe(false);
    expect(isAllowedProviderUrl("https://apis.garmin.com/wellness-api/rest/../../admin", hosts, "/wellness-api/rest/")).toBe(false);
    expect(isAllowedProviderUrl("https://169.254.169.254/latest/meta-data", hosts)).toBe(false);
    expect(isAllowedProviderUrl("não é url", hosts)).toBe(false);
  });
});
