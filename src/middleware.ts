import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Rotas que exigem sessão. Papéis NÃO são checados aqui (os layouts fazem isso no servidor).
const PROTECTED_PREFIXES = ["/admin", "/creator", "/seller", "/evolution", "/profile", "/cart", "/checkout", "/orders", "/onboarding"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  // Renova a sessão (cookies) em toda requisição.
  const response = await updateSession(request);

  const { pathname, search } = request.nextUrl;
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
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|sw.js|manifest.webmanifest|icons/|placeholders/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml)$).*)",
  ],
};
