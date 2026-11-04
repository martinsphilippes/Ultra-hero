"use client";

import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { joinLaunchListAction } from "@/app/conheca/actions";
import { LEGAL_PRIVACY_HREF } from "@/components/legal/rich-tags";
import { formatBrPhoneInput } from "@/lib/auth/phone";
import { initialLaunchLeadState, LAUNCH_HONEYPOT_FIELD, type LaunchLeadField, type LaunchLeadKind } from "@/lib/launch-leads";

/** Origem do acesso (?utm_*), repassada em campos ocultos. */
export type LaunchLeadTags = { source: string; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null };

type Props = { kind: LaunchLeadKind; tags: LaunchLeadTags };

// "Seja o primeiro a saber": nome, celular (máscara BR), e-mail, caixinha obrigatória e, na porta do influenciador, o @
// do Instagram (opcional). Grava pela server action (service role). Erros por campo ligados por aria-describedby; no
// sucesso a mensagem recebe o foco (leitor de tela anuncia).
export function LaunchLeadForm({ kind, tags }: Props) {
  const t = useTranslations("institutional.form");
  const [state, formAction, pending] = useActionState(joinLaunchListAction, initialLaunchLeadState);
  // campos controlados: o React 19 limpa o formulário depois da action, e num erro a pessoa não pode perder o que digitou
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [consent, setConsent] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (state.status === "ok") successRef.current?.focus();
  }, [state.status]);

  if (state.status === "ok") {
    return (
      <div ref={successRef} tabIndex={-1} role="status" className="uh-tz-success" data-testid="launch-lead-success">
        <span aria-hidden="true" className="uh-tz-success-mark">
          <Check className="size-6" />
        </span>
        <p>{t("success")}</p>
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const formError = state.status === "error" && state.error ? t(`errors.${state.error}`) : null;
  const err = (field: LaunchLeadField) => {
    const key = fieldErrors[field];
    return key ? (t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.unknown")) : null;
  };
  const privacy = (chunks: ReactNode) => (
    <Link href={LEGAL_PRIVACY_HREF} className="uh-tz-link">
      {chunks}
    </Link>
  );

  return (
    <form action={formAction} noValidate className="mt-5 flex flex-col gap-4" data-testid="launch-lead-form" data-kind={kind}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="source" value={tags.source} />
      {tags.utmSource ? <input type="hidden" name="utm_source" value={tags.utmSource} /> : null}
      {tags.utmMedium ? <input type="hidden" name="utm_medium" value={tags.utmMedium} /> : null}
      {tags.utmCampaign ? <input type="hidden" name="utm_campaign" value={tags.utmCampaign} /> : null}

      {formError ? (
        <p role="alert" className="uh-tz-error rounded-xl border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 px-3 py-2" data-testid="launch-lead-error">
          {formError}
        </p>
      ) : null}

      <Field id={`${id}-name`} label={t("name")} error={err("name")}>
        {(a11y) => <input {...a11y} name="name" type="text" autoComplete="name" autoCapitalize="words" placeholder={t("namePlaceholder")} maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} className="uh-tz-input" />}
      </Field>

      <Field id={`${id}-phone`} label={t("phone")} error={err("phone")}>
        {(a11y) => (
          <input
            {...a11y}
            name="phone"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            placeholder={t("phonePlaceholder")}
            maxLength={22}
            required
            value={phone}
            onChange={(e) => setPhone(formatBrPhoneInput(e.target.value))}
            className="uh-tz-input"
          />
        )}
      </Field>

      <Field id={`${id}-email`} label={t("email")} error={err("email")}>
        {(a11y) => <input {...a11y} name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("emailPlaceholder")} maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} className="uh-tz-input" />}
      </Field>

      {kind === "influenciador" ? (
        <Field id={`${id}-instagram`} label={t("instagram")} error={err("instagram")}>
          {(a11y) => (
            <input
              {...a11y}
              name="instagram"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("instagramPlaceholder")}
              maxLength={60}
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="uh-tz-input"
            />
          )}
        </Field>
      ) : null}

      {/* Campo-isca: fora da tela e da ordem de tabulação, escondido de leitores de tela. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          {t("honeypot")}
          <input type="text" name={LAUNCH_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="uh-tz-check">
          <input
            type="checkbox"
            name="consent"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={err("consent") ? true : undefined}
            aria-describedby={err("consent") ? `${id}-consent-error` : undefined}
            data-testid="launch-lead-consent"
          />
          <span>{t("consent")}</span>
        </label>
        {err("consent") ? (
          <p id={`${id}-consent-error`} className="uh-tz-error">
            {err("consent")}
          </p>
        ) : null}
        <p className="uh-tz-fine">{t.rich("privacy", { privacy })}</p>
      </div>

      <button type="submit" className="uh-tz-cta" disabled={pending} aria-busy={pending || undefined} data-testid="launch-lead-submit">
        {pending ? t("sending") : t("submit")}
        {pending ? null : <ArrowRight className="size-4" aria-hidden="true" />}
      </button>
    </form>
  );
}

type A11yProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string; "aria-required"?: boolean };

function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: (a11y: A11yProps) => ReactNode }) {
  const errorId = `${id}-error`;
  return (
    <div className="uh-tz-field">
      <label htmlFor={id} className="uh-tz-label">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined })}
      {error ? (
        <p id={errorId} className="uh-tz-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
