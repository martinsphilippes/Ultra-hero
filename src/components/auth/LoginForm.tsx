"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { initialAuthState, type AuthActionState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { PasswordInput } from "./PasswordInput";

type LoginFormProps = {
  next: string;
  /** Período do evento (lib/auth/passwordless): entra só com o e-mail; "Entrar com senha" abre o formulário de sempre. */
  passwordless?: boolean;
  /** Último dia do período (dd/mm) para o aviso. */
  passwordlessUntil?: string;
  defaultEmail?: string;
};

// "Já tenho senha": e-mail + senha (a gerada no cadastro rápido ou a escolhida pela recuperação). No período sem senha,
// só o e-mail; conta de administrador responde "passwordRequired" e o campo Senha aparece.
export function LoginForm({ next, passwordless = false, passwordlessUntil, defaultEmail = "" }: LoginFormProps) {
  const t = useTranslations("auth");
  const [withPassword, setWithPassword] = useState(!passwordless);
  const [email, setEmail] = useState(defaultEmail);
  const [state, formAction, pending] = useActionState(async (prev: AuthActionState, formData: FormData) => {
    const result = await loginAction(prev, formData);
    if (result.status === "error" && result.error === "passwordRequired") setWithPassword(true);
    return result;
  }, initialAuthState);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const errorMessage = errorKey ? (t.has(`errors.${errorKey}`) ? t(`errors.${errorKey}`) : t("errors.unknown")) : null;
  const infoTone = errorKey === "experimentClosed" || errorKey === "passwordRequired" || errorKey === "noAccount";
  const emailOnly = passwordless && !withPassword;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid={emailOnly ? "email-only-login" : "password-login"}>
      <input type="hidden" name="next" value={next} />
      {emailOnly && <input type="hidden" name="passwordless" value="1" />}
      {errorMessage && (
        <AuthAlert tone={infoTone ? "info" : "error"}>
          <span className="block">{errorMessage}</span>
          {errorKey === "noAccount" && (
            <Link href={`/login?email=${encodeURIComponent(email.trim())}`} className="mt-1 inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline" data-testid="create-account">
              {t("login.createAccount")}
            </Link>
          )}
        </AuthAlert>
      )}

      <FormField label={t("fields.email")} required error={fieldErrors.email ? t(`errors.${fieldErrors.email}`) : undefined}>
        <Input name="email" type="email" autoComplete="username" inputMode="email" placeholder={t("fields.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>

      {emailOnly ? (
        <>
          <p className="type-caption text-fg-muted" data-testid="passwordless-note">
            {t("login.passwordlessNote", { date: passwordlessUntil ?? "" })}
          </p>
          <Button type="submit" block size="lg" loading={pending}>
            {t("login.submitEmailOnly")}
          </Button>
          <button
            type="button"
            onClick={() => setWithPassword(true)}
            className="inline-flex min-h-11 items-center justify-center self-center rounded-md text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            data-testid="use-password"
          >
            {t("login.submitPassword")}
          </button>
        </>
      ) : (
        <>
          <FormField label={t("fields.password")} required error={fieldErrors.password ? t(`errors.${fieldErrors.password}`) : undefined}>
            <PasswordInput name="password" autoComplete="current-password" />
          </FormField>

          <p className="type-caption text-fg-muted" data-testid="invite-first-access-hint">
            {t("login.inviteHint")}
          </p>

          <div className="-mt-1 flex justify-end">
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {t("login.forgotPassword")}
            </Link>
          </div>

          <Button type="submit" variant="secondary" block size="lg" loading={pending}>
            {t("login.submitPassword")}
          </Button>
        </>
      )}
    </form>
  );
}
