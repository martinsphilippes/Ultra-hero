import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLibraryKey, legacyLibraryTarget } from "@/lib/catalog/creator-libraries";
import { legacyHeroPortalTarget } from "@/lib/hero-portal/routes";
import { EXPLORE_COOKIE, rootDestination, rootNeedsSessionCheck } from "@/lib/institutional/root";
import { isMarketingHost, marketingDecision, parseMarketingHosts, requestHost } from "@/lib/marketing-host";
import { isBlockedInNativeApp, NATIVE_BLOCKED_FALLBACK, parseNativeApp } from "@/lib/native-app/surface";
import { updateSession } from "@/lib/supabase/middleware";

// Rotas que exigem sessão. Papéis NÃO são checados aqui (os layouts fazem isso no servidor).
// /profissional = portal do profissional (0058); /profissionais (lista pública) não entra.
const PROTECTED_PREFIXES = ["/admin", "/heroi", "/seller", "/profissional", "/agencia", "/marca", "/profile", "/recipes", "/cart", "/checkout", "/orders", "/shop/compras", "/onboarding", "/configuracoes", "/projetos"];

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
  if (!parseNativeApp(request.headers.get("user-agent"))) return null;
  if (!isBlockedInNativeApp(request.nextUrl.pathname, request.nextUrl.searchParams)) return null;
  const target = request.nextUrl.clone();
  target.pathname = NATIVE_BLOCKED_FALLBACK;
  target.search = "";
  return NextResponse.redirect(target, 307);
}

// Confere o JWT dos cookies (já renovados por updateSession).
async function hasSession(request: NextRequest): Promise<boolean> {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Já tratado em updateSession.
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}

// Endereço principal "/" (etapa 7, antes um redirect fixo do next.config para /personalities): com sessão, app das
// lojas ou "Pular e explorar" → aba Hero, como sempre; visitante sem sessão → apresentação (/conheca). 307 com a query.
async function rootResponse(request: NextRequest): Promise<NextResponse> {
  const nativeApp = parseNativeApp(request.headers.get("user-agent")) !== null;
  const explored = request.cookies.get(EXPLORE_COOKIE)?.value === "1";
  const signedIn = rootNeedsSessionCheck({ nativeApp, explored }) ? await hasSession(request) : false;
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

export async function middleware(request: NextRequest) {
  const marketing = marketingResponse(request);
  if (marketing) return marketing;

  // Renova a sessão (cookies) em toda requisição.
  const response = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  const early = legacyHeroPortalResponse(request) ?? nativeAppResponse(request) ?? heroHubResponse(request) ?? legacyEvolutionResponse(request);
  if (early) {
    // Mantém os cookies renovados na resposta.
    for (const cookie of response.cookies.getAll()) early.cookies.set(cookie);
    return early;
  }
  if (pathname === "/") {
    const root = await rootResponse(request);
    for (const cookie of response.cookies.getAll()) root.cookies.set(cookie);
    return root;
  }
  if (!isProtected(pathname)) return response;

  // Os cookies do request já foram atualizados por updateSession; valida o JWT.
  if (await hasSession(request)) return response;

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
