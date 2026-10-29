import { NextResponse, type NextRequest } from "next/server";
import { isOAuthSignupRefused, isOAuthUserBanned, readExperimentOpen } from "@/lib/auth/experiment";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

// Troca o código PKCE (OAuth, confirmação, recuperação) por sessão e segue para `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getOriginFromRequest(request);
  const next = safeNext(searchParams.get("next"), LOGIN_HOME);
  const code = searchParams.get("code");

  if (searchParams.get("error") || searchParams.get("error_code")) {
    // Conta suspensa pela administração (ban no Auth).
    if (isOAuthUserBanned(searchParams)) {
      return NextResponse.redirect(`${origin}/login?error=accountSuspended`);
    }
    // Primeiro acesso com Google recusado pelo banco: com o cadastro fechado, é o kill switch.
    if (isOAuthSignupRefused(searchParams) && !(await readExperimentOpen(await createClient()))) {
      return NextResponse.redirect(`${origin}/login?error=experimentClosed`);
    }
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${error.code === "user_banned" ? "accountSuspended" : "callback"}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
