import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLibraryKey, legacyLibraryTarget } from "@/lib/catalog/creator-libraries";
import { updateSession } from "@/lib/supabase/middleware";

// Rotas que exigem sessão. Papéis NÃO são checados aqui (os layouts fazem isso no servidor).
const PROTECTED_PREFIXES = ["/admin", "/creator", "/seller", "/profile", "/recipes", "/cart", "/checkout", "/orders", "/shop/compras", "/onboarding"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Hub do herói: /personalities/[slug] e as bibliotecas /personalities/[slug]/[library].
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

export async function middleware(request: NextRequest) {
  // Renova a sessão (cookies) em toda requisição.
  const response = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  const early = heroHubResponse(request) ?? legacyEvolutionResponse(request);
  if (early) {
    // Mantém os cookies renovados na resposta.
    for (const cookie of response.cookies.getAll()) early.cookies.set(cookie);
    return early;
  }
  if (!isProtected(pathname)) return response;

  // Os cookies do request já foram atualizados por updateSession; valida o JWT.
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
  if (data?.claims) return response;

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
