import "server-only";
import { cookies } from "next/headers";

// Cookies de conveniência do carrinho de teste (nunca são fonte de verdade: o banco é).
export const DESTINATION_COOKIE = "uh-dest";
export const EXPECTED_PRICES_COOKIE = "uh-cart-exp";
const MAX_AGE = 60 * 60 * 24 * 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readDestinationCookie(): Promise<string | null> {
  const value = (await cookies()).get(DESTINATION_COOKIE)?.value ?? null;
  return value && UUID_RE.test(value) ? value : null;
}

export async function writeDestinationCookie(id: string | null) {
  const jar = await cookies();
  if (!id) jar.delete(DESTINATION_COOKIE);
  else jar.set(DESTINATION_COOKIE, id, { path: "/", maxAge: MAX_AGE, sameSite: "lax", httpOnly: true });
}

export type ExpectedPrices = Record<string, number>;

// Preços ilustrativos vistos pelo usuário ao adicionar (para detectar price_changed).
export async function readExpectedPrices(): Promise<ExpectedPrices> {
  const raw = (await cookies()).get(EXPECTED_PRICES_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ExpectedPrices = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (UUID_RE.test(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeExpectedPrices(prices: ExpectedPrices) {
  const jar = await cookies();
  const entries = Object.entries(prices).slice(0, 40);
  if (entries.length === 0) {
    jar.delete(EXPECTED_PRICES_COOKIE);
    return;
  }
  jar.set(EXPECTED_PRICES_COOKIE, JSON.stringify(Object.fromEntries(entries)), { path: "/", maxAge: MAX_AGE, sameSite: "lax", httpOnly: true });
}

export function expectedToRpcArg(prices: ExpectedPrices): { product_id: string; price_cents: number }[] {
  return Object.entries(prices).map(([product_id, price_cents]) => ({ product_id, price_cents }));
}
