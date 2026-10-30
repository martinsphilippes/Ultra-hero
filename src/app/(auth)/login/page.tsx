import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard } from "@/components/auth/AuthCard";
import { AppleButton } from "@/components/auth/AppleButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LoginForm } from "@/components/auth/LoginForm";
import { QuickSignupForm } from "@/components/auth/QuickSignupForm";
import { DemoAccess } from "@/components/demo/DemoAccess";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Divider } from "@/components/ui/divider";
import { readExperimentOpen } from "@/lib/auth/experiment";
import { QUICK_SIGNUP_PENDING_COOKIE } from "@/lib/auth/quick-signup";
import { quickSignupAvailability } from "@/lib/auth/quick-signup-server";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { isAuthQueryError } from "@/lib/auth/types";
import { getNativeApp } from "@/lib/native-app/server";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ next?: string; error?: string; demo?: string; mode?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.quick");
  return { title: t("title") };
}

// Tela inicial: cadastro rápido (nome, e-mail, celular) → senha gerada; Google; "Já tenho senha";
// contas de demonstração.
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext, error, demo, mode } = await searchParams;
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
  const passwordOpen = mode === "password" || queryError === "sessionRequired";

  const alternatives = (
    <div className="flex flex-col gap-5">
      <Divider label={t("divider")} />
      {/* App iOS das lojas: com login do Google, a Apple exige o dela também (guideline 4.8) */}
      {nativeApp?.platform === "ios" ? <AppleButton next={next} size="lg" /> : null}
      <GoogleButton next={next} size="lg" />
      {/* O Google cria a conta no primeiro acesso: a declaração de 18+ e o aceite também valem aqui. */}
      <p className="type-caption text-center text-fg-muted">{t.rich("login.googleTerms", { terms: legalRichTags.terms, privacy: legalRichTags.privacy })}</p>
      <details className="group rounded-xl border border-border bg-bg" open={passwordOpen} data-testid="have-password">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          {t("quick.havePassword")}
          <span aria-hidden="true" className="text-fg-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1">
          <LoginForm next={next} />
        </div>
      </details>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <AuthCard title={t("quick.title")} subtitle={t("quick.subtitle")}>
        <div className="flex flex-col gap-4">
          {queryError && <AuthAlert tone={queryError === "experimentClosed" ? "info" : "error"}>{t(`errors.${queryError}`)}</AuthAlert>}
          {!open && (
            <AuthAlert tone="info">
              <span className="block font-semibold">{t("signup.closedTitle")}</span>
              <span className="mt-0.5 block">{fromInvitation ? t("signup.closedInvited") : t("signup.closedDescription")}</span>
            </AuthAlert>
          )}
          {availability !== "ok" && (
            <AuthAlert tone="info">
              <span data-testid="quick-signup-unavailable">{t("errors.signupUnavailable")}</span>
            </AuthAlert>
          )}
          <QuickSignupForm next={next} alternatives={alternatives} resumeSignedIn={Boolean(user && pendingSignup)} />
        </div>
      </AuthCard>
      {/* Contas de demonstração, uma por tipo de acesso: um toque e a pessoa entra. */}
      {/* Contas demo de um toque (inclui admin) não vão para o app das lojas; o revisor recebe credenciais */}
      {nativeApp ? null : <DemoAccess from="login" failed={demo === "error"} />}
    </div>
  );
}
