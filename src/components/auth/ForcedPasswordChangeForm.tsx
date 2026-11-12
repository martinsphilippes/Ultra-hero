"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { forcedPasswordChangeAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { initialAuthState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { PasswordInput } from "./PasswordInput";

// Nova senha + confirmação. Ao salvar, a action troca a senha, tira a marca de senha provisória e segue (status ou app).
export function ForcedPasswordChangeForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(forcedPasswordChangeAction, initialAuthState);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const err = (key?: string) => (key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : undefined);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {errorKey && <AuthAlert>{err(errorKey)}</AuthAlert>}
      <FormField label={t("fields.newPassword")} required hint={t("forcedChange.hint")} error={err(fieldErrors.password)}>
        <PasswordInput name="password" autoComplete="new-password" placeholder={t("fields.passwordPlaceholder")} data-autofocus data-testid="forced-change-password" />
      </FormField>
      <FormField label={t("fields.confirmPassword")} required error={err(fieldErrors.confirmPassword)}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" data-testid="forced-change-confirm" />
      </FormField>
      <Button type="submit" block size="lg" loading={pending} data-testid="forced-change-submit">
        {t("forcedChange.submit")}
      </Button>
    </form>
  );
}
