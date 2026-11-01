import { NextResponse, type NextRequest } from "next/server";
import { isOAuthSignupRefused, isOAuthUserBanned, readExperimentOpen } from "@/lib/auth/experiment";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { forgetGeneratedPassword, rotateGeneratedPassword } from "@/lib/auth/quick-signup-server";
import { acceptMyInvitations } from "@/lib/auth/invite-first-access";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
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

  await secureQuickSignupOnGoogle(supabase);
  // convites pendentes do e-mail (0077): o Google já provou que a pessoa é dona dele
  const home = await acceptMyInvitations(supabase);
  const target = home && (next === LOGIN_HOME || next === "/invite" || next.startsWith("/invite?")) ? home : next;
  return NextResponse.redirect(`${origin}${target}`);
}

// Conta do cadastro rápido (e-mail nunca verificado) que agora entrou com o Google do mesmo e-mail:
// o Google prova que a pessoa é dona do e-mail. Se outra pessoa tinha cadastrado esse e-mail, ela
// ainda sabe a senha gerada: troca a senha (a nova fica no Perfil), marca o e-mail como verificado e
// derruba as outras sessões. Melhor esforço: nunca impede o login.
async function secureQuickSignupOnGoogle(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.quick_signup_unverified !== true) return;
    if (!user.identities?.some((identity) => identity.provider === "google")) return;
    if (!hasAdminClient()) return;
    const admin = createAdminClient();
    const rotated = await rotateGeneratedPassword(admin, user.id, { quick_signup_unverified: false });
    if (!rotated) {
      await forgetGeneratedPassword(admin, user.id);
      return;
    }
    await supabase.auth.signOut({ scope: "others" });
  } catch {
    // segue o login
  }
}
