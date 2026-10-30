// App das lojas (casca Expo em mobile/): a mesma web, carregada numa WebView que se identifica no
// user agent. Módulo puro: usado pelo middleware, pelos server components e pelos testes.
// Por que existe: docs/decisions/app-nas-lojas.md.
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";

export type NativePlatform = "ios" | "android";
export type NativeApp = { platform: NativePlatform; version: string };

/** Marcador que a casca acrescenta ao user agent: `GCHeroApp/<versão> (<ios|android>)`. */
export const NATIVE_UA_MARKER = "GCHeroApp";
const NATIVE_UA = /\bGCHeroApp\/([0-9A-Za-z.\-]+) \((ios|android)\)/;

/** Esquema próprio do app; a volta do login pelo navegador do sistema chega por ele. */
export const NATIVE_SCHEME = "gchero";

export function parseNativeApp(userAgent: string | null | undefined): NativeApp | null {
  if (!userAgent) return null;
  const match = NATIVE_UA.exec(userAgent);
  if (!match) return null;
  return { platform: match[2] as NativePlatform, version: match[1] };
}

// Assinaturas e compras são simuladas: nas lojas viram "demo" (Apple 2.2) e desbloqueio de conteúdo
// digital fora da compra no app (Apple 3.1.1). No app nativo essas rotas não existem.
// /profissional: caixa de pedidos de serviços contratados com pagamento simulado (0058). A lista e o
// perfil público dos profissionais (/profissionais) seguem no app, sem "Contratar".
const BLOCKED_PREFIXES = ["/shop", "/cart", "/checkout", "/orders", "/profile/plan", "/profissional"];
const BLOCKED_HERO_LIBRARY = /^\/personalities\/[^/]+\/produtos\/?$/;

export function isBlockedInNativeApp(pathname: string, search?: URLSearchParams): boolean {
  if (BLOCKED_HERO_LIBRARY.test(pathname)) return true;
  // aba Produtos do Explorar (as páginas fazem streaming: redirect lá dentro chegaria com 200)
  if (pathname === "/explore" && search?.get("tab") === "produtos") return true;
  // relógio simulado de exemplo (Hoje)
  if ((pathname === "/profile/today" || pathname.startsWith("/profile/today/")) && search?.get("exemplo") === "1") return true;
  // Colecionáveis: só lances, sem pagamento (decisão do responsável) — liberados no app para o aviso
  // de lance superado levar direto ao item
  if (pathname === "/shop/colecionaveis" || pathname.startsWith("/shop/colecionaveis/")) return false;
  return BLOCKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Player simulado (conteúdo sem vídeo real) não aparece no app; vídeo real (embed, Stream) aparece
 * em qualquer lugar. Decisão do responsável (30/10/2026): quando houver vídeo real, volta sozinho.
 */
export function hidesVideoPlayer(sourceType: string | null | undefined, nativeApp: boolean): boolean {
  return nativeApp && sourceType === "demo";
}

/** Para onde o app nativo vai quando abre uma rota bloqueada. */
export const NATIVE_BLOCKED_FALLBACK = LOGIN_HOME;

// O Google recusa OAuth dentro de WebView: a casca abre o login no navegador do sistema, o Supabase
// volta para /auth/native (no navegador) e esta URL devolve o código ao app. A troca do código
// acontece depois dentro da WebView, que guarda o verificador PKCE; o código sozinho não vale nada.
const FORWARDED_PARAMS = ["code", "error", "error_code", "error_description"] as const;

export function nativeAuthRedirect(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = params.get(key);
    if (value !== null) out.set(key, value);
  }
  if (params.has("next")) out.set("next", safeNext(params.get("next"), LOGIN_HOME));
  return `${NATIVE_SCHEME}://auth/callback?${out.toString()}`;
}
