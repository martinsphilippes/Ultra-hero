"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";
import { profileSignupAction } from "@/app/(auth)/actions";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { BusinessProfile } from "@/lib/auth/profile-signup";
import { HONEYPOT_FIELD } from "@/lib/auth/quick-signup";
import { initialAuthState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { PasswordInput } from "./PasswordInput";

type Props = {
  profile: BusinessProfile;
  alternatives?: ReactNode;
  /** Período sem senha (lib/auth/passwordless): o campo Senha some e o servidor gera uma senha forte. */
  passwordless?: boolean;
  defaultEmail?: string;
};

// Cadastro por perfil (0103): nome, e-mail e senha → a conta nasce, a pessoa entra e segue para o passo a
// passo do perfil (Hero, Marca ou Agência). Passo 1 de 2 (o 2 é o /primeiro-acesso).
export function ProfileSignupForm({ profile, alternatives, passwordless = false, defaultEmail }: Props) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(profileSignupAction, initialAuthState);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const err = (key?: string) => (key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : undefined);
  const infoTone = errorKey === "experimentClosed" || errorKey === "signupUnavailable" || errorKey === "emailExists";

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t("profile.stepsLabel")}>
        <li className="flex items-center gap-2 font-semibold text-fg" aria-current="step">
          <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs text-accent-fg">1</span>
          {t("profile.stepAccount")}
        </li>
        <li className="flex items-center gap-2 text-fg-muted">
          <span className="flex size-7 items-center justify-center rounded-full border border-border text-xs">2</span>
          {t(`profile.stepProfile.${profile}`)}
        </li>
      </ol>
      <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="profile-signup">
        <input type="hidden" name="profile" value={profile} />
        {errorKey && (
          <AuthAlert tone={infoTone ? "info" : "error"}>
            <span data-testid="profile-signup-error">{err(errorKey)}</span>
          </AuthAlert>
        )}

        <FormField label={t("quick.fullName")} required error={err(fieldErrors.fullName)}>
          <Input name="fullName" type="text" autoComplete="name" autoCapitalize="words" placeholder={t("quick.fullNamePlaceholder")} maxLength={120} />
        </FormField>

        <FormField label={t("fields.email")} required hint={profile === "agency" ? t("profile.agencyEmailHint") : undefined} error={err(fieldErrors.email)}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("fields.emailPlaceholder")} maxLength={254} defaultValue={defaultEmail} />
        </FormField>

        {!passwordless && (
          <FormField label={t("fields.password")} required hint={t("fields.passwordHint")} error={err(fieldErrors.password)}>
            <PasswordInput name="password" autoComplete="new-password" placeholder={t("fields.passwordPlaceholder")} maxLength={72} />
          </FormField>
        )}

        {/* Campo-isca: fora da tela e da ordem de tabulação, escondido de leitores de tela. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            {t("quick.honeypot")}
            <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <p className="type-caption text-fg-muted">{t.rich("quick.terms", { terms: legalRichTags.terms, privacy: legalRichTags.privacy })}</p>

        <Button type="submit" block size="lg" loading={pending} trailingIcon={<ArrowRight />}>
          {t("profile.submit")}
        </Button>
      </form>
      {alternatives}
    </div>
  );
}
