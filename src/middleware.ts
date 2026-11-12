import { NextResponse, type NextRequest } from "next/server";
import { isLibraryKey, legacyLibraryTarget } from "@/lib/catalog/creator-libraries";
import { legacyHeroPortalTarget } from "@/lib/hero-portal/routes";
import { LOGIN_HOME } from "@/lib/auth/safe-next";
import { EXPLORE_COOKIE, NATIVE_VISITOR_ENTRY, rootDestination } from "@/lib/institutional/root";
import { APP_ONLY_PATH, CHANGE_PASSWORD_PATH, decideAccess, isAndroidWebView, isApiPath, isCreatorAppOnlyEnabled, PENDING_PATH, readAccessClaims } from "@/lib/access/gate";
import { QUICK_SIGNUP_PENDING_COOKIE } from "@/lib/auth/quick-signup";
import { isMarketingHost, marketingDecision, parseMarketingHosts, requestHost } from "@/lib/marketing-host";
import { isBlockedInNativeApp, isOpenToNativeVisitor, NATIVE_BLOCKED_FALLBACK, NATIVE_CHANNEL_COOKIE, nativeAppFrom, parseNativeApp } from "@/lib/native-app/surface";
import { updateSession, type SessionState } from "@/lib/supabase/middleware";

// Rotas que exigem sessão. Papéis NÃO são checados aqui (os layouts fazem isso no servidor).
// /profissional = portal do profissional (0058); /profissionais (lista pública) não entra.
const PROTECTED_PREFIXES = ["/admin", "/heroi", "/seller", "/profissional", "/agencia", "/marca", "/profile", "/recipes", "/cart", "/checkout", "/orders", "/shop/compras", "/onboarding", "/configuracoes", "/projetos", "/portais"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Hub do Hero: /personalities/[slug] e as bibliotecas /personalities/[slug]/[library].
const HERO_ROUTE = /^\/personalities\/([^/]+)(?:\/([^/]+))?$/;

// As páginas ficam dentro de loading.tsx (streaming), então redirect() e notFound() chegariam ao
// navegador com status 200. Aqui, antes do streaming, as abas antigas (?tab=) viram 308 para a
// biblioteca, os segmentos antigos (rotina, receitas; 0050) viram 308 para os novos (dia-a-dia,
// alimentacao) mantendo a query, e um segmento fora de LIBRARY_KEYS vira o 404 global de verdade.
function heroHubResponse(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  const match = HERO_ROUTE.exec(pathname);
  if (!match) return null;
  const [, slug, library] = match;
  if (library !== undefined) {
    if (isLibraryKey(library)) return null;
    const legacy = legacyLibraryTarget(library);
    if (legacy) {
      const target = request.nextUrl.clone();
      target.pathname = `/personalities/${slug}/${legacy}`;
      return NextResponse.redirect(target, 308);
    }
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }
  const tab = searchParams.get("tab");
  if (tab === null) return null;
  const target = request.nextUrl.clone();
  target.search = "";
  target.pathname = tab === "produtos" || tab === "programas" ? `/personalities/${slug}/${tab}` : `/personalities/${slug}`;
  return NextResponse.redirect(target, 308);
}

// A Evolução virou seção do Perfil. A rota antiga pode estar em favoritos, atalhos ou e-mails,
// então vira 308 permanente (preservando a query) antes da checagem de sessão.
const LEGACY_EVOLUTION = /^\/evolution(?:\/.*)?$/;

function legacyEvolutionResponse(request: NextRequest): NextResponse | null {
  if (!LEGACY_EVOLUTION.test(request.nextUrl.pathname)) return null;
  const target = request.nextUrl.clone();
  target.pathname = "/profile/evolution";
  return NextResponse.redirect(target, 308);
}

// Portal do Hero (0097): /creator/** (portal do Hero e escritório), /marca/creators, /agencia/negocios/<id>/creators
// e /admin/creators mudaram de endereço. 308 permanente com a query, antes da sessão (e-mails, avisos e push antigos).
function legacyHeroPortalResponse(request: NextRequest): NextResponse | null {
  const next = legacyHeroPortalTarget(request.nextUrl.pathname);
  if (!next) return null;
  const target = request.nextUrl.clone();
  target.pathname = next;
  return NextResponse.redirect(target, 308);
}

// App das lojas: comércio simulado não existe lá (docs/decisions/app-nas-lojas.md).
// A trava é aqui, e não só no botão escondido: link antigo, histórico ou digitação não abrem a rota.
function nativeAppResponse(request: NextRequest): NextResponse | null {
  const app = parseNativeApp(request.headers.get("user-agent"));
  if (!app) return null;
  if (!isBlockedInNativeApp(request.nextUrl.pathname, request.nextUrl.searchParams)) return null;
  const target = request.nextUrl.clone();
  target.pathname = NATIVE_BLOCKED_FALLBACK;
  target.search = "";
  return NextResponse.redirect(target, 307);
}

// Endereço principal "/" (etapa 7, antes um redirect fixo do next.config para /personalities): com sessão ou "Pular e
// explorar" (só na web) → aba Hero; visitante sem sessão → apresentação. 307 com a query.
async function rootResponse(request: NextRequest, signedIn: boolean): Promise<NextResponse> {
  const nativeApp = parseNativeApp(request.headers.get("user-agent")) !== null;
  const explored = request.cookies.get(EXPLORE_COOKIE)?.value === "1";
  const target = request.nextUrl.clone();
  target.pathname = rootDestination({ signedIn, nativeApp, explored });
  return NextResponse.redirect(target, 307);
}

// Domínio próprio do teaser (MARKETING_HOSTS; docs/dominio-teaser.md): nesses hosts "/" mostra o teaser (rewrite, o
// endereço fica "/") e o resto do app volta para "/". Sem a variável, null (nada muda). Não renova sessão: o domínio
// do teaser não tem login.
function marketingResponse(request: NextRequest): NextResponse | null {
  const hosts = parseMarketingHosts();
  if (!isMarketingHost(requestHost(request.headers, request.nextUrl.host), hosts)) return null;
  const decision = marketingDecision(request.nextUrl.pathname);
  if (decision.action === "next") return NextResponse.next();
  const target = request.nextUrl.clone();
  target.pathname = decision.pathname;
  if (decision.action === "rewrite") return NextResponse.rewrite(target);
  target.search = "";
  return NextResponse.redirect(target, 307);
}

// 0141: aprovação da Presidência e Hero/Creator só pelo aplicativo (lib/access/gate). Página → redireciona para a tela de
// status ou para a mensagem do app; API e server action (POST com Next-Action) → 403, porque um 307 repetiria o POST.
async function accessResponse(request: NextRequest, session: SessionState): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent");
  const decision = decideAccess({
    pathname,
    signedIn: session.signedIn,
    claims: readAccessClaims(session.claims),
    // o canal do app: marca no user agent ou o cookie que a lembra (navegação refeita pelo service worker no Android)
    native: nativeAppFrom(userAgent, request.cookies.get(NATIVE_CHANNEL_COOKIE)?.value) !== null,
    creatorAppOnly: isCreatorAppOnlyEnabled(),
    quickSignupPending: request.cookies.get(QUICK_SIGNUP_PENDING_COOKIE)?.value === "1",
  });
  if (decision.action === "next") return null;

  // WebView do Android sem a marca pode ser o próprio app: barra, mas não revoga a sessão (a tela da mensagem se recupera)
  if (decision.action === "app-only" && decision.signOut && !isAndroidWebView(userAgent)) await session.signOut();
  const json = isApiPath(pathname) || request.headers.has("next-action");
  const target = decision.action === "pending" ? PENDING_PATH : decision.action === "change-password" ? CHANGE_PASSWORD_PATH : APP_ONLY_PATH;
  let blocked: NextResponse;
  if (json) {
    const error = decision.action === "pending" ? `account_${decision.status}` : decision.action === "change-password" ? "password_change_required" : "creator_app_only";
    blocked = NextResponse.json({ error }, { status: 403 });
  } else if (decision.action === "app-only" && !decision.redirect) {
    // já está na mensagem do app: só encerra a sessão deste navegador e mostra a página
    return session.response();
  } else {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    blocked = NextResponse.redirect(url, 307);
  }
  for (const cookie of session.response().cookies.getAll()) blocked.cookies.set(cookie);
  return blocked;
}

export async function middleware(request: NextRequest) {
  const marketing = marketingResponse(request);
  if (marketing) return marketing;

  // Renova a sessão (cookies) em toda requisição.
  const session = await updateSession(request);
  // 0141: a WebView da casca se identifica no user agent; o cookie lembra o canal para as requisições sem a marca
  const fromUa = parseNativeApp(request.headers.get("user-agent"));
  if (fromUa && request.cookies.get(NATIVE_CHANNEL_COOKIE)?.value !== fromUa.platform) {
    session.response().cookies.set(NATIVE_CHANNEL_COOKIE, fromUa.platform, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  const access = await accessResponse(request, session);
  if (access) return access;
  const response = session.response();
  const { signedIn } = session;

  const { pathname, search } = request.nextUrl;
  const early = legacyHeroPortalResponse(request) ?? nativeAppResponse(request) ?? heroHubResponse(request) ?? legacyEvolutionResponse(request);
  if (early) {
    // Mantém os cookies renovados na resposta.
    for (const cookie of response.cookies.getAll()) early.cookies.set(cookie);
    return early;
  }
  if (pathname === "/") {
    const root = await rootResponse(request, signedIn);
    for (const cookie of response.cookies.getAll()) root.cookies.set(cookie);
    return root;
  }
  // Os cookies do request já foram atualizados por updateSession; valida o JWT.
  if (signedIn) return response;

  // App das lojas: só entra com login. A casca publicada abre em /personalities: sem sessão, isso é a abertura do app
  // e leva à apresentação; o resto do que não é aberto (surface.ts) pede o login, como as rotas protegidas.
  const nativeApp = parseNativeApp(request.headers.get("user-agent")) !== null;
  if (nativeApp && pathname === LOGIN_HOME) {
    const entry = request.nextUrl.clone();
    entry.pathname = NATIVE_VISITOR_ENTRY;
    entry.search = "";
    const redirect = NextResponse.redirect(entry, 307);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  if (!isProtected(pathname) && !(nativeApp && !isOpenToNativeVisitor(pathname))) return response;

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  // Mantém os cookies renovados na resposta de redirecionamento.
  const redirect = NextResponse.redirect(loginUrl);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // media/: miniaturas públicas dos vídeos (proxy do Cloudflare Stream) não precisam renovar a sessão.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|sw.js|manifest.webmanifest|icons/|placeholders/|media/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml)$).*)",
  ],
};
