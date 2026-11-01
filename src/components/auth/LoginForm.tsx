"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { initialAuthState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { PasswordInput } from "./PasswordInput";

type LoginFormProps = { next: string };

// "Já tenho senha": e-mail + senha (a gerada no cadastro rápido ou a escolhida pela recuperação).
export function LoginForm({ next }: LoginFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(loginAction, initialAuthState);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const errorMessage = errorKey ? (t.has(`errors.${errorKey}`) ? t(`errors.${errorKey}`) : t("errors.unknown")) : null;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="password-login">
      <input type="hidden" name="next" value={next} />
      {errorMessage && <AuthAlert tone={errorKey === "experimentClosed" ? "info" : "error"}>{errorMessage}</AuthAlert>}

      <FormField label={t("fields.email")} required error={fieldErrors.email ? t(`errors.${fieldErrors.email}`) : undefined}>
        <Input name="email" type="email" autoComplete="username" inputMode="email" placeholder={t("fields.emailPlaceholder")} />
      </FormField>

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
    </form>
  );
}
