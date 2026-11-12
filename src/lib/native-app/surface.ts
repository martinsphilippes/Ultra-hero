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

/**
 * Cookie que lembra o canal do app nesta WebView (0141). No Android o service worker refaz as navegações com o user agent
 * padrão da WebView, sem a marca; o cookie (gravado pelo servidor quando a marca aparece) mantém o canal. Mesmo nível de
 * confiança do user agent (os dois podem ser imitados); a garantia exige atestação do aparelho.
 */
export const NATIVE_CHANNEL_COOKIE = "uh-app";

/** App pela marca do user agent ou, na falta dela, pelo cookie do canal. */
export function nativeAppFrom(userAgent: string | null | undefined, channelCookie: string | null | undefined): NativeApp | null {
  const fromUa = parseNativeApp(userAgent);
  if (fromUa) return fromUa;
  return channelCookie === "ios" || channelCookie === "android" ? { platform: channelCookie, version: "0" } : null;
}

export function parseNativeApp(userAgent: string | null | undefined): NativeApp | null {
  if (!userAgent) return null;
  const match = NATIVE_UA.exec(userAgent);
  if (!match) return null;
  return { platform: match[2] as NativePlatform, version: match[1] };
}

// Compras são simuladas: nas lojas viram "demo" (Apple 2.2). No app nativo essas rotas não existem.
// O app é gratuito (0069): não há plano nem assinatura; /profile/plan só redireciona ao Perfil.
// /profissional: caixa de pedidos de serviços contratados com pagamento simulado (0058). A lista e o
// perfil público dos profissionais (/profissionais) seguem no app, sem "Contratar".
// /agencia e /marca abrem no app como na web (decisão do responsável, 05/11/2026): acordos financeiros só registrados,
// sem transação nem checkout. O que levar a uma transação no app entra nesta lista.
// /conheca: o teaser (etapa 7) é só da web, e "Pular e explorar" (/conheca/explorar) não existe no app, que só entra
// com login. /sobre abre no app, como na web (decisão do responsável, 05/11/2026).
const BLOCKED_PREFIXES = ["/shop", "/cart", "/checkout", "/orders", "/profissional", "/conheca"];
const BLOCKED_HERO_LIBRARY = /^\/personalities\/[^/]+\/produtos\/?$/;

// O app das lojas só entra com login (decisão do responsável, 05/11/2026). Sem sessão, ficam abertas só a apresentação,
// as telas de entrada e recuperação, os textos legais (a loja exige acesso) e o que não é tela (/api, /auth, /r).
const NATIVE_VISITOR_PREFIXES = ["/sobre", "/login", "/signup", "/forgot-password", "/reset-password", "/legal", "/offline", "/auth", "/api", "/r"];

export function isOpenToNativeVisitor(pathname: string): boolean {
  return NATIVE_VISITOR_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

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
