"use client";

import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "@/app/(auth)/actions";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { initialAuthState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { GoogleButton } from "./GoogleButton";
import { PasswordInput } from "./PasswordInput";

type SignupFormProps = { next: string };

export function SignupForm({ next }: SignupFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signupAction, initialAuthState);

  if (state.status === "success") {
    return (
      <EmptyState
        icon={<MailCheck />}
        title={t("signup.successTitle")}
        description={t("signup.successDescription")}
        action={
          <Button asChild variant="secondary">
            <Link href="/login">{t("signup.signIn")}</Link>
          </Button>
        }
      />
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const nextQuery = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const err = (key?: string) => (key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : undefined);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        {errorKey && <AuthAlert tone={errorKey === "experimentClosed" ? "info" : "error"}>{err(errorKey)}</AuthAlert>}

        <FormField label={t("fields.displayName")} required error={err(fieldErrors.displayName)}>
          <Input name="displayName" type="text" autoComplete="name" placeholder={t("fields.displayNamePlaceholder")} maxLength={80} data-autofocus />
        </FormField>

        <FormField label={t("fields.email")} required error={err(fieldErrors.email)}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("fields.emailPlaceholder")} />
        </FormField>

        <FormField label={t("fields.password")} required hint={t("fields.passwordHint")} error={err(fieldErrors.password)}>
          <PasswordInput name="password" autoComplete="new-password" placeholder={t("fields.passwordPlaceholder")} />
        </FormField>

        <FormField label={t("fields.confirmPassword")} required error={err(fieldErrors.confirmPassword)}>
          <PasswordInput name="confirmPassword" autoComplete="new-password" />
        </FormField>

        <p className="type-caption text-fg-muted">{t.rich("signup.terms", { terms: legalRichTags.terms, privacy: legalRichTags.privacy })}</p>

        <Button type="submit" block size="lg" loading={pending}>
          {t("signup.submit")}
        </Button>
      </form>

      <Divider label={t("divider")} />
      <GoogleButton next={next} />

      <p className="text-center text-sm text-fg-muted">
        {t("signup.hasAccount")}{" "}
        <Link href={`/login${nextQuery}`} className="font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {t("signup.signIn")}
        </Link>
      </p>
    </div>
  );
}
