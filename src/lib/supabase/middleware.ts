import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readAccessClaims } from "@/lib/access/gate";

/** Marca que o token antigo (sem app_metadata.access, anterior à 0141) já foi renovado uma vez nesta sessão. */
const CLAIMS_REFRESHED_COOKIE = "uh-ac";

export type SessionState = {
  /** Resposta com os cookies de sessão renovados (sempre a mais recente). */
  response: () => NextResponse;
  signedIn: boolean;
  /** Claims do JWT validado (app_metadata incluído) ou nulo sem sessão. */
  claims: Record<string, unknown> | null;
  /** Encerra a sessão deste navegador (revoga o refresh token e apaga os cookies na resposta). */
  signOut: () => Promise<void>;
};

// Renova a sessão do usuário a cada requisição e diz se ela é válida. Velocidade: getClaims confere a assinatura do
// JWT localmente (chave pública ES256 em memória) e só vai ao servidor de auth quando o token venceu e precisa ser
// renovado — antes, getUser fazia essa ida em TODO clique.
// 0141: token emitido antes da regra de aprovação não traz app_metadata.access; ele é renovado UMA vez (o token novo sai
// com access/app_only gravados pelo banco) e um cookie evita repetir a renovação em toda requisição.
export async function updateSession(request: NextRequest): Promise<SessionState> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  let claims = (data?.claims as Record<string, unknown> | undefined) ?? null;

  // só em navegação de verdade (pré-carregamento e server action em paralelo não disputam a renovação do mesmo token)
  const prefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch" || request.headers.has("next-action");
  if (!prefetch && claims?.sub && readAccessClaims(claims).status === null && request.cookies.get(CLAIMS_REFRESHED_COOKIE)?.value !== "1") {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (!error) {
        const again = await supabase.auth.getClaims();
        claims = (again.data?.claims as Record<string, unknown> | undefined) ?? claims;
      }
    } catch {
      // segue com o token atual; o banco continua barrando o que precisa
    }
    response.cookies.set(CLAIMS_REFRESHED_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  }

  return {
    response: () => response,
    signedIn: Boolean(claims?.sub),
    claims,
    signOut: async () => {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // os cookies saem mesmo assim abaixo
      }
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith("sb-")) response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
      }
    },
  };
}
