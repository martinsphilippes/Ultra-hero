import "server-only";
import { headers } from "next/headers";
import { parseNativeApp } from "@/lib/native-app/surface";

// Origem pública do app (respeita proxies/Vercel via x-forwarded-*).
export async function getOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// Mesma lógica a partir de um Request (route handlers).
// App das lojas: fica no domínio em que a casca abriu. Em outro domínio a casca abre o navegador (mobile/src/navigation.ts)
// e a pessoa sai do app (Sair e a volta do login caíam no site).
export function getOriginFromRequest(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv && !parseNativeApp(request.headers.get("user-agent"))) return fromEnv.replace(/\/$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
