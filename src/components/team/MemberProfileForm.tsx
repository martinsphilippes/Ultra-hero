"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { completeMemberProfileAction, requestAgencyAccessAction, type MemberProfileResult } from "@/app/agencia/cadastro/actions";
import { Button, Checkbox, FormField, Input } from "@/components/ui";
import { formatCnpj, isValidCnpj } from "@/lib/invitations/rules";
import { MEMBER_LEVELS, isMemberLevel, type MemberLevel } from "@/lib/team/levels";
import { cn } from "@/lib/utils";

type Props = {
  /** request: pedido de acesso (primeiro acesso); complete: quem já é da agência completa ou edita. */
  mode: "request" | "complete";
  initial?: { fullName?: string | null; cnpj?: string | null; jobTitle?: string | null; level?: string | null };
  /** Para onde vai depois de salvar (complete). */
  doneHref?: string;
};

// Cadastro PJ do colaborador (reunião Groscove, 06/11/2026): nome, CNPJ (cada colaborador é PJ), cargo livre, nível
// (Júnior < Pleno < Sênior, com a explicação de cada um) e o aceite do Termo do Parceiro. Um campo por linha, mobile first.
export function MemberProfileForm({ mode, initial, doneHref = "/agencia" }: Props) {
  const t = useTranslations("team.profile");
  const router = useRouter();
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [cnpj, setCnpj] = useState(initial?.cnpj ? formatCnpj(initial.cnpj) : "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [level, setLevel] = useState<MemberLevel | "">(isMemberLevel(initial?.level) ? initial.level : "");
  const [accept, setAccept] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setField("fullName");
    if (!isValidCnpj(cnpj)) return setField("cnpj");
    if (jobTitle.trim().length < 2) return setField("jobTitle");
    if (!level) return setField("level");
    if (!accept) return setField("terms");
    setField(null);
    start(async () => {
      const input = { fullName, cnpj, jobTitle, level, acceptTerms: accept };
      const result: MemberProfileResult = mode === "request" ? await requestAgencyAccessAction(input) : await completeMemberProfileAction(input);
      if (!result.ok) {
        if (result.field) setField(result.field);
        if (result.error !== "invalid_input") setError(result.error);
        return;
      }
      if (mode === "complete") router.push(doneHref);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="member-profile-form">
      <FormField label={t("fullName")} required error={field === "fullName" ? t("errors.fullName") : undefined}>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={80} />
      </FormField>
      <FormField label={t("cnpj")} required hint={t("cnpjHint")} error={field === "cnpj" ? t("errors.cnpj") : undefined}>
        <Input value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" maxLength={18} data-testid="member-cnpj" />
      </FormField>
      <FormField label={t("jobTitle")} required hint={t("jobTitleHint")} error={field === "jobTitle" ? t("errors.jobTitle") : undefined}>
        <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} placeholder={t("jobTitlePlaceholder")} data-testid="member-job" />
      </FormField>

      <fieldset className="flex flex-col gap-2" aria-describedby="member-level-hint">
        <legend className="text-sm font-semibold text-fg">
          {t("level")} <span className="text-danger">*</span>
        </legend>
        <p id="member-level-hint" className="type-caption text-fg-muted">
          {t("levelHint")}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {MEMBER_LEVELS.map((l) => (
            <label
              key={l}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                level === l ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
              )}
            >
              <input type="radio" name="member-level" value={l} checked={level === l} onChange={() => setLevel(l)} className="sr-only" data-testid={`member-level-${l}`} />
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                {level === l ? <CircleCheck className="size-4 text-accent-text" aria-hidden="true" /> : null}
                {t(`levels.${l}.title`)}
              </span>
              <span className="type-caption text-fg-muted">{t(`levels.${l}.body`)}</span>
            </label>
          ))}
        </div>
        {field === "level" ? <p className="type-caption text-danger">{t("errors.level")}</p> : null}
      </fieldset>

      <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-elevated p-3">
        <Checkbox checked={accept} onChange={(e) => setAccept(e.target.checked)} label={t("acceptTerms")} description={t("acceptTermsHint")} data-testid="member-accept-terms" />
        <a href="/legal/partner-terms" target="_blank" rel="noopener" className="ml-8 w-fit text-sm font-semibold text-accent-text underline">
          {t("readTerms")}
        </a>
        {field === "terms" ? <p className="ml-8 type-caption text-danger">{t("errors.terms")}</p> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 type-body-sm text-fg">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending} data-testid="member-profile-submit">
        {mode === "request" ? t("submitRequest") : t("submitComplete")}
      </Button>
    </form>
  );
}
