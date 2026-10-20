"use client";

import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { initialAuthState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialAuthState);

  if (state.status === "success") {
    return (
      <EmptyState
        icon={<MailCheck />}
        title={t("forgot.successTitle")}
        description={t("forgot.successDescription")}
        action={
          <Button asChild variant="secondary">
            <Link href="/login">{t("forgot.backToLogin")}</Link>
          </Button>
        }
      />
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const err = (key?: string) => (key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : undefined);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} noValidate className="flex flex-col gap-4">
        {errorKey && <AuthAlert>{err(errorKey)}</AuthAlert>}
        <FormField label={t("fields.email")} required error={err(fieldErrors.email)}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("fields.emailPlaceholder")} data-autofocus />
        </FormField>
        <Button type="submit" block size="lg" loading={pending}>
          {t("forgot.submit")}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
