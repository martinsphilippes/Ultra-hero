// Verificação dos webhooks por marca (§9.4). Comparação em tempo constante, tolerância de 5 min
// no carimbo quando a marca o envia, corpo ≤ 1 MB. Assinatura inválida → a rota responde 401 sem
// gravar nada. Puro: recebe corpo cru, cabeçalhos, segredo e o "agora".

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_MAX_BYTES = 1_000_000;
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data, "utf8").digest();
}

/** Carimbo em segundos, milissegundos ou ISO → ms; null se ilegível. */
export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return n > 1e12 ? n : n * 1000;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function fresh(timestamp: string | null | undefined, now: number): boolean {
  const t = parseTimestamp(timestamp);
  return t !== null && Math.abs(now - t) <= WEBHOOK_TOLERANCE_MS;
}

/**
 * WHOOP v2: X-WHOOP-Signature = base64(HMAC-SHA256(client_secret, timestamp + corpo)) e
 * X-WHOOP-Signature-Timestamp em ms. https://developer.whoop.com/docs/developing/webhooks
 */
export function verifyWhoop(input: { body: string; signature: string | null; timestamp: string | null; secret: string; now?: number }): boolean {
  if (!input.signature || !input.timestamp || !fresh(input.timestamp, input.now ?? Date.now())) return false;
  return safeEqual(input.signature, hmac(input.secret, input.timestamp + input.body).toString("base64"));
}

/**
 * Oura v2: x-oura-signature = HMAC-SHA256(client_secret, timestamp + corpo) em hex e
 * x-oura-timestamp [NC: formato e caixa do hex — conferir na inscrição]. https://cloud.ouraring.com/v2/docs#tag/Webhook-Subscription-Routes
 */
export function verifyOura(input: { body: string; signature: string | null; timestamp: string | null; secret: string; now?: number }): boolean {
  if (!input.signature || !input.timestamp || !fresh(input.timestamp, input.now ?? Date.now())) return false;
  return safeEqual(input.signature.toLowerCase(), hmac(input.secret, input.timestamp + input.body).toString("hex"));
}

/**
 * Polar AccessLink: Polar-Webhook-Signature = HMAC-SHA256(signature_secret_key, corpo) em hex.
 * Sem carimbo assinado: o anti-replay é a idempotência do inbox. https://www.polar.com/accesslink-api/#webhooks
 */
export function verifyPolar(input: { body: string; signature: string | null; secret: string }): boolean {
  if (!input.signature) return false;
  return safeEqual(input.signature.toLowerCase(), hmac(input.secret, input.body).toString("hex"));
}

/**
 * Garmin: sem HMAC documentado publicamente (§9.4). Token de caminho ≥ 128 bits por ambiente,
 * comparado em tempo constante; durante a rotação o anterior continua válido.
 */
export function verifyGarminPathToken(token: string | undefined, current: string | undefined, previous?: string | undefined): boolean {
  if (!token || !current) return false;
  const okCurrent = safeEqual(token, current);
  const okPrevious = previous ? safeEqual(token, previous) : false;
  return okCurrent || okPrevious;
}
