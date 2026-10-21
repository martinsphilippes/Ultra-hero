import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { normalizeDemoCode } from "./accounts";

// O painel só existe quando as duas variáveis estão configuradas. O cookie de liberação guarda um
// HMAC (nunca o código), assinado com a senha das contas: trocar qualquer um invalida as liberações.
export const DEMO_UNLOCK_COOKIE = "uh-demo-access";

function secrets() {
  const code = normalizeDemoCode(process.env.DEMO_ACCESS_CODE);
  const password = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
  return code && password ? { code, password } : null;
}

export function isDemoAccessEnabled(): boolean {
  return secrets() !== null;
}

export function demoPassword(): string | null {
  return secrets()?.password ?? null;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function checkDemoCode(input: unknown): boolean {
  const s = secrets();
  return Boolean(s) && sameText(normalizeDemoCode(input), s!.code);
}

export function demoUnlockToken(): string | null {
  const s = secrets();
  return s ? createHmac("sha256", s.password).update(`demo-access:${s.code}`).digest("hex") : null;
}

export async function isDemoUnlocked(): Promise<boolean> {
  const expected = demoUnlockToken();
  if (!expected) return false;
  const value = (await cookies()).get(DEMO_UNLOCK_COOKIE)?.value ?? "";
  return sameText(value, expected);
}
