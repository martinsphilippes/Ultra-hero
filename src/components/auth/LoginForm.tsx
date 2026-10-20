"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/(auth)/actions";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { initialAuthState, type AuthQueryError } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { GoogleButton } from "./GoogleButton";
import { PasswordInput } from "./PasswordInput";

type LoginFormProps = { next: string; queryError?: AuthQueryError };

export function LoginForm({ next, queryError }: LoginFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(loginAction, initialAuthState);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : queryError;
  const errorMessage = errorKey ? (t.has(`errors.${errorKey}`) ? t(`errors.${errorKey}`) : t("errors.unknown")) : null;
  const nextQuery = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        {/* Cadastro fechado não é falha do usuário: aviso informativo, não erro. */}
        {errorMessage && <AuthAlert tone={errorKey === "experimentClosed" ? "info" : "error"}>{errorMessage}</AuthAlert>}

        <FormField label={t("fields.email")} required error={fieldErrors.email ? t(`errors.${fieldErrors.email}`) : undefined}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("fields.emailPlaceholder")} data-autofocus />
        </FormField>

        <FormField label={t("fields.password")} required error={fieldErrors.password ? t(`errors.${fieldErrors.password}`) : undefined}>
          <PasswordInput name="password" autoComplete="current-password" />
        </FormField>

        <div className="-mt-1 flex justify-end">
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("login.forgotPassword")}
          </Link>
        </div>

        <Button type="submit" block size="lg" loading={pending}>
          {t("login.submit")}
        </Button>
      </form>

      <Divider label={t("divider")} />
      <GoogleButton next={next} />
      {/* O Google cria a conta no primeiro acesso: a declaração de 18+ e o aceite também valem aqui. */}
      <p className="type-caption text-center text-fg-muted">
        {t.rich("login.googleTerms", { terms: legalRichTags.terms, privacy: legalRichTags.privacy })}
      </p>

      <p className="text-center text-sm text-fg-muted">
        {t("login.noAccount")}{" "}
        <Link href={`/signup${nextQuery}`} className="font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("login.createAccount")}
        </Link>
      </p>
    </div>
  );
}
