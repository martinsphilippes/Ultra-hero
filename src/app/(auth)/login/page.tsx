import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard } from "@/components/auth/AuthCard";
import { AppleButton } from "@/components/auth/AppleButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LoginForm } from "@/components/auth/LoginForm";
import { ProfileChooser } from "@/components/auth/ProfileChooser";
import { ProfileSignupForm } from "@/components/auth/ProfileSignupForm";
import { QuickSignupForm } from "@/components/auth/QuickSignupForm";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Divider } from "@/components/ui/divider";
import { readExperimentOpen } from "@/lib/auth/experiment";
import { isPasswordlessActive, passwordlessLastDayLabel } from "@/lib/auth/passwordless";
import { isBusinessProfile, parseSignupProfile, profilesForSurface, startPathFor } from "@/lib/auth/profile-signup";
import { QUICK_SIGNUP_PENDING_COOKIE } from "@/lib/auth/quick-signup";
import { quickSignupAvailability } from "@/lib/auth/quick-signup-server";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { isAuthQueryError } from "@/lib/auth/types";
import { getNativeApp } from "@/lib/native-app/server";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ next?: string; error?: string; mode?: string; perfil?: string; email?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.quick");
  return { title: t("title") };
}

// Tela inicial (0103): "Como você vai usar o Ultra?" — Hero, Marca, Agência ou só o app. Cada cartão abre o cadastro
// do perfil (?perfil=…): o "app" é o cadastro rápido de sempre (nome, e-mail → senha gerada); Hero, Marca e
// Agência criam a conta com senha e seguem ao passo a passo do perfil. "Já tenho conta" (Google e senha) fica embaixo
// em todas as telas; com um perfil escolhido, entrar leva a /comecar/<perfil> (o mesmo fluxo de Configurações).
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext, error, mode, perfil, email: rawEmail } = await searchParams;
  // e-mail vindo do "Criar conta" do login sem senha: só preenche o campo (validado de novo na action)
  const prefillEmail = typeof rawEmail === "string" && rawEmail.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(rawEmail) ? rawEmail : undefined;
  // período do evento (lib/auth/passwordless): entrar e criar conta só com o e-mail; volta sozinho ao normal no prazo
  const passwordless = isPasswordlessActive();
  const next = safeNext(rawNext, LOGIN_HOME);

  // Já autenticado: não faz sentido ver a entrada, salvo logo depois do cadastro rápido (a tela
  // "Sua senha" continua aberta até "Já anotei").
  const [user, cookieStore] = await Promise.all([getUser(), cookies()]);
  const pendingSignup = cookieStore.get(QUICK_SIGNUP_PENDING_COOKIE)?.value === "1";
  if (user && !pendingSignup) redirect(next);

  const [t, open, availability, nativeApp] = await Promise.all([getTranslations("auth"), createClient().then(readExperimentOpen), quickSignupAvailability(), getNativeApp()]);
  const queryError = isAuthQueryError(error) ? error : undefined;
  // Veio do link de convite (/invite?token=…): o cadastro segue liberado para o e-mail convidado.
  const fromInvitation = next === "/invite" || next.startsWith("/invite?");
  // Pedido explícito (?mode=password) ou sessão expirada: abre "Já tenho senha".
  // Veio do link do convite: abre direto (o convidado cria a senha ali no primeiro acesso).
  const passwordOpen = mode === "password" || queryError === "sessionRequired" || fromInvitation || (passwordless && !perfil);
  // Perfil escolhido; convite (já emitido) e a tela "Sua senha" recarregada seguem no cadastro rápido de sempre.
  const surfaceProfiles = profilesForSurface(nativeApp !== null);
  const parsedProfile = parseSignupProfile(perfil);
  const profile = (user && pendingSignup) || fromInvitation ? "consumer" : parsedProfile && surfaceProfiles.includes(parsedProfile) ? parsedProfile : null;
  // com perfil de negócio, entrar com a conta existente continua no passo a passo dele
  const afterLogin = profile && isBusinessProfile(profile) ? startPathFor(profile) : next;
  const chooseParams = new URLSearchParams();
  if (rawNext) chooseParams.set("next", next);
  if (prefillEmail) chooseParams.set("email", prefillEmail);
  const chooseHref = chooseParams.size ? `/login?${chooseParams.toString()}` : "/login";

  const alternatives = (
    <div className="flex flex-col gap-5">
      <Divider label={t("divider")} />
      {/* App iOS das lojas: com login do Google, a Apple exige o dela também (guideline 4.8) */}
      {nativeApp?.platform === "ios" ? <AppleButton next={afterLogin} size="lg" /> : null}
      <GoogleButton next={afterLogin} size="lg" />
      {/* O Google cria a conta no primeiro acesso: a declaração de 18+ e o aceite também valem aqui. */}
      <p className="type-caption text-center text-fg-muted">{t.rich("login.googleTerms", { terms: legalRichTags.terms, privacy: legalRichTags.privacy })}</p>
      <details className="group rounded-xl border border-border bg-bg" open={passwordOpen} data-testid="have-password">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          {profile ? t("quick.havePassword") : t("choose.haveAccount")}
          <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1">
          <LoginForm next={afterLogin} passwordless={passwordless} passwordlessUntil={passwordless ? passwordlessLastDayLabel() : undefined} defaultEmail={prefillEmail} />
        </div>
      </details>
    </div>
  );

  const alerts = (
    <>
      {queryError && <AuthAlert tone={queryError === "experimentClosed" ? "info" : "error"}>{t(`errors.${queryError}`)}</AuthAlert>}
      {!open && (
        <AuthAlert tone="info">
          <span className="block font-semibold">{t("signup.closedTitle")}</span>
          <span className="mt-0.5 block">{fromInvitation ? t("signup.closedInvited") : t("signup.closedDescription")}</span>
        </AuthAlert>
      )}
      {profile && availability !== "ok" && (
        <AuthAlert tone="info">
          <span data-testid="quick-signup-unavailable">{t("errors.signupUnavailable")}</span>
        </AuthAlert>
      )}
    </>
  );
  const changeProfile =
    profile && !fromInvitation && !(user && pendingSignup) ? (
      <Link href={chooseHref} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-accent-text hover:underline" data-testid="profile-change">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("choose.change")}
      </Link>
    ) : null;

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <AuthCard title={t("choose.title")} subtitle={t("choose.subtitle")}>
          <div className="flex flex-col gap-5">
            {alerts}
            <ProfileChooser profiles={surfaceProfiles} next={rawNext ? next : null} email={prefillEmail} />
            {alternatives}
          </div>
        </AuthCard>
      </div>
    );
  }

  if (isBusinessProfile(profile)) {
    return (
      <div className="flex flex-col gap-4">
        <AuthCard title={t(`profile.title.${profile}`)} subtitle={t(`profile.subtitle.${profile}`)}>
          <div className="flex flex-col gap-4">
            {changeProfile}
            {alerts}
            <ProfileSignupForm profile={profile} alternatives={alternatives} passwordless={passwordless} defaultEmail={prefillEmail} />
          </div>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AuthCard title={t("quick.title")} subtitle={t("quick.subtitle")}>
        <div className="flex flex-col gap-4">
          {changeProfile}
          {alerts}
          <QuickSignupForm next={next} alternatives={alternatives} resumeSignedIn={Boolean(user && pendingSignup)} defaultEmail={prefillEmail} />
        </div>
      </AuthCard>
    </div>
  );
}
