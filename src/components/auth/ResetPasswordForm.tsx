"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { initialAuthState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { PasswordInput } from "./PasswordInput";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common.actions");
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialAuthState);

  if (state.status === "success") {
    return (
      <EmptyState
        icon={<CircleCheck />}
        title={t("reset.successTitle")}
        description={t("reset.successDescription")}
        action={
          <Button asChild>
            <Link href="/">{tc("continue")}</Link>
          </Button>
        }
      />
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const err = (key?: string) => (key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : undefined);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {errorKey && (
        <AuthAlert>
          {err(errorKey)}{" "}
          {errorKey === "sessionRequired" && (
            <Link href="/forgot-password" className="font-semibold underline">
              {t("reset.requestNewLink")}
            </Link>
          )}
        </AuthAlert>
      )}
      <FormField label={t("fields.newPassword")} required hint={t("fields.passwordHint")} error={err(fieldErrors.password)}>
        <PasswordInput name="password" autoComplete="new-password" placeholder={t("fields.passwordPlaceholder")} data-autofocus />
      </FormField>
      <FormField label={t("fields.confirmPassword")} required error={err(fieldErrors.confirmPassword)}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" />
      </FormField>
      <Button type="submit" block size="lg" loading={pending}>
        {t("reset.submit")}
      </Button>
    </form>
  );
}
