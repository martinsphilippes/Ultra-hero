// Cifra dos tokens da marca (§8.3, §15.2): AES-256-GCM na aplicação, nonce aleatório de 96 bits
// por cifragem, AAD = connection_id || key_version. A chave WEARABLE_TOKEN_KEY_V{n} fica só na
// Vercel — nunca no banco, para não morar ao lado do dado cifrado (o que aconteceria com o Vault).
// Formato gravado (bytea): nonce(12) | tag(16) | texto cifrado.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { Env } from "./config";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function tokenKey(version: number, env: Env = process.env): Buffer {
  const raw = env[`WEARABLE_TOKEN_KEY_V${version}`];
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) throw new Error("wearable_token_key_missing");
  return key;
}

/** Versão atual da chave (rotação: grava com a nova, lê qualquer uma ainda configurada). */
export function currentKeyVersion(env: Env = process.env): number {
  const v = Number(env.WEARABLE_TOKEN_KEY_VERSION ?? "1");
  return Number.isInteger(v) && v >= 1 && v <= 99 ? v : 1;
}

function aad(connectionId: string, keyVersion: number): Buffer {
  return Buffer.from(`${connectionId}|${keyVersion}`, "utf8");
}

export function encryptToken(plain: string, connectionId: string, env: Env = process.env): { data: Buffer; keyVersion: number } {
  const keyVersion = currentKeyVersion(env);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(keyVersion, env), nonce);
  cipher.setAAD(aad(connectionId, keyVersion));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { data: Buffer.concat([nonce, cipher.getAuthTag(), body]), keyVersion };
}

export function decryptToken(data: Buffer, connectionId: string, keyVersion: number, env: Env = process.env): string {
  if (data.length < NONCE_BYTES + TAG_BYTES) throw new Error("wearable_token_corrupt");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(keyVersion, env), data.subarray(0, NONCE_BYTES));
  decipher.setAAD(aad(connectionId, keyVersion));
  decipher.setAuthTag(data.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}

/** Chave derivada para assinar o cookie do OAuth (sem mais um segredo para configurar). */
export function stateKey(env: Env = process.env): Buffer {
  return createHmac("sha256", tokenKey(currentKeyVersion(env), env)).update("ultra-hero:wearables:oauth-state:v1").digest();
}
