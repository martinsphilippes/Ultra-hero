import { NextResponse, type NextRequest } from "next/server";
import { APP_ONLY_PATH, PENDING_PATH, readAccessClaims } from "@/lib/access/gate";
import { heroChannelBlocked } from "@/lib/access/server";
import { profileFromStartPath } from "@/lib/access/status";
import { isOAuthSignupRefused, isOAuthUserBanned, readExperimentOpen } from "@/lib/auth/experiment";
import { getOriginFromRequest } from "@/lib/auth/origin";
import { forgetGeneratedPassword, rotateGeneratedPassword } from "@/lib/auth/quick-signup-server";
import { acceptMyInvitations } from "@/lib/auth/invite-first-access";
import { PROFILE_ONBOARDING_PATH } from "@/lib/auth/profile-signup";
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
  const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${error.code === "user_banned" ? "accountSuspended" : "callback"}`);
  }

  await secureQuickSignupOnGoogle(supabase);

  // 0141: aprovação da Presidência e Hero só pelo aplicativo, já no retorno do Google. A troca de senha pela recuperação
  // (/reset-password) segue liberada para qualquer conta.
  if (next !== "/reset-password") {
    let access = readAccessClaims(exchanged?.user?.app_metadata);
    // conta nova que escolheu o perfil na entrada (/comecar/<perfil>): o pedido à Presidência sai com esse perfil
    const chosen = profileFromStartPath(next);
    const webBlocked = await heroChannelBlocked();
    // Hero escolhido no navegador: nada é registrado como Hero (cadastro de Hero só pelo aplicativo)
    if (chosen === "hero" && webBlocked) {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${origin}${APP_ONLY_PATH}`);
    }
    if (access.status === "pending" && chosen && exchanged?.user && hasAdminClient()) {
      try {
        await createAdminClient().rpc("account_approval_annotate", { p_user: exchanged.user.id, p_profile: chosen, p_origin: null });
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.user) access = readAccessClaims(refreshed.user.app_metadata);
      } catch {
        // a tela de status pergunta o perfil se ele não ficou registrado
      }
    }
    if (access.appOnly && webBlocked) {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${origin}${APP_ONLY_PATH}`);
    }
    if (access.status === "pending" || access.status === "rejected") {
      return NextResponse.redirect(`${origin}${PENDING_PATH}`);
    }
  }
  // convites pendentes do e-mail (0077): o Google já provou que a pessoa é dona dele
  // aceita os convites, mas a entrada é sempre a aba Hero (os portais ficam no menu)
  const home = await acceptMyInvitations(supabase);
  const target = home && (next === "/invite" || next.startsWith("/invite?")) ? LOGIN_HOME : next;
  // 0141: passo a passo em aberto (ex.: aberto pela aprovação da Presidência) e nenhum destino pedido → retoma, como no login
  if (!home && target === LOGIN_HOME && (await hasOpenOnboarding(supabase))) {
    return NextResponse.redirect(`${origin}${PROFILE_ONBOARDING_PATH}`);
  }
  return NextResponse.redirect(`${origin}${target}`);
}

async function hasOpenOnboarding(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("onboarding_pending");
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
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
