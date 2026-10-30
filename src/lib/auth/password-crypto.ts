import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cofre da senha gerada (mesmo desenho dos tokens dos relógios em lib/health/crypto.ts, com chave
// própria): AES-256-GCM na aplicação, nonce aleatório de 96 bits, AAD = "account-password|user|versão".
// A chave ACCOUNT_PASSWORD_KEY_V{n} (32 bytes em base64) fica só na Vercel, nunca no banco.
// ACCOUNT_PASSWORD_KEY (sem versão) vale como V1. Gravado: base64(nonce(12) | tag(16) | cifrado).

export type Env = Record<string, string | undefined>;

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function passwordKey(version: number, env: Env = process.env): Buffer | null {
  const raw = env[`ACCOUNT_PASSWORD_KEY_V${version}`] ?? (version === 1 ? env.ACCOUNT_PASSWORD_KEY : undefined);
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** Versão atual da chave (rotação: grava com a nova, lê qualquer uma ainda configurada). */
export function currentPasswordKeyVersion(env: Env = process.env): number {
  const v = Number(env.ACCOUNT_PASSWORD_KEY_VERSION ?? "1");
  return Number.isInteger(v) && v >= 1 && v <= 99 ? v : 1;
}

/** Cofre ligado = a chave da versão atual existe e tem 32 bytes. */
export function isPasswordVaultConfigured(env: Env = process.env): boolean {
  return passwordKey(currentPasswordKeyVersion(env), env) !== null;
}

function aad(userId: string, keyVersion: number): Buffer {
  return Buffer.from(`account-password|${userId}|${keyVersion}`, "utf8");
}

export function sealPassword(plain: string, userId: string, env: Env = process.env): { ciphertext: string; keyVersion: number } {
  const keyVersion = currentPasswordKeyVersion(env);
  const key = passwordKey(keyVersion, env);
  if (!key) throw new Error("account_password_key_missing");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(userId, keyVersion));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), body]).toString("base64"), keyVersion };
}

export function openPassword(ciphertext: string, userId: string, keyVersion: number, env: Env = process.env): string {
  const key = passwordKey(keyVersion, env);
  if (!key) throw new Error("account_password_key_missing");
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < NONCE_BYTES + TAG_BYTES + 1) throw new Error("account_password_corrupt");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, NONCE_BYTES));
  decipher.setAAD(aad(userId, keyVersion));
  decipher.setAuthTag(data.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}
