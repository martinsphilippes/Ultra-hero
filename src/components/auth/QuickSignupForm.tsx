"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { quickSignupAction } from "@/app/(auth)/actions";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatBrPhoneInput } from "@/lib/auth/phone";
import { HONEYPOT_FIELD } from "@/lib/auth/quick-signup";
import { initialQuickSignupState } from "@/lib/auth/types";
import { AuthAlert } from "./AuthAlert";
import { GeneratedPasswordPanel } from "./GeneratedPasswordPanel";

type Props = {
  next: string;
  /** Google, "Já tenho senha"…: somem enquanto a tela "Sua senha" está aberta. */
  alternatives?: ReactNode;
  /** Sessão criada há pouco pelo cadastro (recarregou a página antes de "Já anotei"). */
  resumeSignedIn?: boolean;
};

// Tela inicial: cadastro rápido sem senha. Depois de criar, mostra a senha gerada uma vez.
export function QuickSignupForm({ next, alternatives, resumeSignedIn }: Props) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(quickSignupAction, initialQuickSignupState);
  const [phone, setPhone] = useState("");

  if (state.status === "created") {
    return <GeneratedPasswordPanel password={state.password} stored={state.stored} signedIn={state.signedIn} next={next} />;
  }
  if (resumeSignedIn && state.status === "idle") {
    return <GeneratedPasswordPanel password={null} stored signedIn next={next} />;
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const errorKey = state.status === "error" ? state.error : undefined;
  const err = (key?: string) => (key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : undefined);
  const infoTone = errorKey === "experimentClosed" || errorKey === "signupUnavailable" || errorKey === "emailExists";

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="quick-signup">
        <input type="hidden" name="next" value={next} />
        {errorKey && (
          <AuthAlert tone={infoTone ? "info" : "error"}>
            <span data-testid="quick-signup-error">{err(errorKey)}</span>
          </AuthAlert>
        )}

        <FormField label={t("quick.fullName")} required error={err(fieldErrors.fullName)}>
          <Input name="fullName" type="text" autoComplete="name" autoCapitalize="words" placeholder={t("quick.fullNamePlaceholder")} maxLength={120} />
        </FormField>

        <FormField label={t("fields.email")} required error={err(fieldErrors.email)}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("fields.emailPlaceholder")} maxLength={254} />
        </FormField>

        <FormField label={t("quick.phone")} required hint={t("quick.phoneHint")} error={err(fieldErrors.phone)}>
          <Input
            name="phone"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            placeholder={t("quick.phonePlaceholder")}
            maxLength={22}
            value={phone}
            onChange={(e) => setPhone(formatBrPhoneInput(e.target.value))}
          />
        </FormField>

        {/* Campo-isca: fora da tela e da ordem de tabulação, escondido de leitores de tela. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            {t("quick.honeypot")}
            <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <p className="type-caption text-fg-muted">{t.rich("quick.terms", { terms: legalRichTags.terms, privacy: legalRichTags.privacy })}</p>

        <Button type="submit" block size="lg" loading={pending} trailingIcon={<ArrowRight />}>
          {t("quick.submit")}
        </Button>
        <p className="type-caption text-center text-fg-muted">{t("quick.noPassword")}</p>
      </form>
      {alternatives}
    </div>
  );
}
