"use client";

import { ArrowLeft, Building2, CircleCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { cancelSelfOnboardingAction, createAgencyAction, createBrandAction, createHeroAction, createProfessionalAction, createSellerAction, type OnboardingResult } from "@/app/primeiro-acesso/actions";
import { Button, FormField, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BR_UFS, PROFESSIONAL_SPECIALTIES, REGISTRY_BY_SPECIALTY, cnpjDigits, formatCnpj, isValidCnpj, type ProfessionalSpecialty, type WizardKind } from "@/lib/invitations/rules";

type Props = {
  kind: WizardKind;
  agencyName?: string | null;
  /** Passo do cadastro por perfil (0103): mostra "Agora não" (o de convite fica esperando a empresa). */
  selfService?: boolean;
};

// Passo a passo curto do primeiro acesso (0091): 1) dados da empresa/perfil, 2) revisar e criar. Mobile first:
// um campo por linha, botões grandes. A RPC dá o papel (Adm da agência, Dono da marca, owner da operação).
export function OnboardingWizard({ kind, agencyName, selfService = false }: Props) {
  const t = useTranslations("invites.onboarding");
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [segment, setSegment] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [specialty, setSpecialty] = useState<ProfessionalSpecialty>("nutritionist");
  const [registryNumber, setRegistryNumber] = useState("");
  const [registryUf, setRegistryUf] = useState("SP");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [home, setHome] = useState<string | null>(null);

  const cnpjOk = !cnpj.trim() || isValidCnpj(cnpj);
  const maxName = kind === "brand" ? 60 : 80;

  function next(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const n = name.trim();
    if (n.length < 2 || n.length > maxName) return setFieldError("name");
    if ((kind === "agency" || kind === "brand") && !cnpjOk) return setFieldError("cnpj");
    if (kind === "brand" && siteUrl.trim().length < 4) return setFieldError("site");
    if (kind === "professional" && !/^[0-9A-Za-z./-]{2,20}$/.test(registryNumber.trim())) return setFieldError("registry");
    setFieldError(null);
    setStep(2);
  }

  function create() {
    setError(null);
    start(async () => {
      let result: OnboardingResult;
      if (kind === "agency") result = await createAgencyAction({ name, cnpj, contactEmail });
      else if (kind === "brand") result = await createBrandAction({ name, cnpj, segment, siteUrl });
      else if (kind === "seller") result = await createSellerAction({ name });
      else if (kind === "hero") result = await createHeroAction({ name });
      else result = await createProfessionalAction({ name, specialty, registryNumber, registryUf });
      if (!result.ok) {
        setError(result.error);
        setStep(1);
        return;
      }
      setHome(result.home);
    });
  }

  // "Agora não" (só no cadastro por perfil): encerra o passo e volta ao app; dá para recomeçar por Configurações
  function cancel() {
    start(async () => {
      const result = await cancelSelfOnboardingAction({ kind });
      window.location.assign(result.ok ? result.home : "/");
    });
  }

  if (home) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status" data-testid="onboarding-done">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl border border-success/30 bg-success-soft text-success">
          <CircleCheck className="size-7" />
        </span>
        <div>
          <h2 className="type-h3 text-fg">{t(`${kind}.doneTitle`)}</h2>
          <p className="type-body-sm mt-1 text-fg-muted">{t(`${kind}.doneText`)}</p>
        </div>
        <Button asChild size="lg" block>
          <a href={home}>{t(`${kind}.go`)}</a>
        </Button>
      </div>
    );
  }

  const review: Array<[string, string]> = [[t(`${kind}.name`), name.trim()]];
  if ((kind === "agency" || kind === "brand") && cnpj.trim()) review.push([t("cnpj"), formatCnpj(cnpj)]);
  if (kind === "agency" && contactEmail.trim()) review.push([t("agency.contactEmail"), contactEmail.trim().toLowerCase()]);
  if (kind === "brand") {
    if (segment.trim()) review.push([t("brand.segment"), segment.trim()]);
    review.push([t("brand.site"), siteUrl.trim()]);
  }
  if (kind === "professional") {
    review.push([t("professional.specialty"), t(`specialties.${specialty}`)]);
    review.push([t("professional.registry"), `${REGISTRY_BY_SPECIALTY[specialty]} ${registryNumber.trim()}/${registryUf}`]);
  }

  return (
    <div className="flex flex-col gap-5" data-testid={`onboarding-${kind}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
          {kind === "hero" ? <Sparkles className="size-5" /> : <Building2 className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="type-caption text-fg-muted">{t("stepOf", { step, total: 2 })}</p>
          <h2 className="type-h3 text-fg">{t(`${kind}.title`)}</h2>
        </div>
      </div>
      <ol className="flex gap-2" aria-label={t("stepsLabel")}>
        <li className="flex items-center gap-2 text-sm">
          <StepDot n={1} active={step === 1} done={step > 1} />
          {t("stepData")}
        </li>
        <li className="flex items-center gap-2 text-sm">
          <StepDot n={2} active={step === 2} done={false} />
          {t("stepReview")}
        </li>
      </ol>
      {kind === "brand" ? <p className="rounded-xl border border-border bg-surface-elevated px-3 py-2 type-body-sm text-fg-muted">{agencyName ? t("brand.withAgency", { agency: agencyName }) : t("brand.noAgency")}</p> : null}

      {step === 1 ? (
        <form onSubmit={next} className="flex flex-col gap-4" noValidate>
          <FormField label={t(`${kind}.name`)} required error={fieldError === "name" ? t("errors.name", { max: maxName }) : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={maxName} autoComplete="organization" data-testid="onboarding-name" />
          </FormField>
          {kind === "agency" || kind === "brand" ? (
            <FormField label={t("cnpj")} hint={t("cnpjHint")} error={fieldError === "cnpj" || !cnpjOk ? t("errors.cnpj") : undefined}>
              <Input value={formatCnpj(cnpj)} onChange={(e) => setCnpj(cnpjDigits(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" />
            </FormField>
          ) : null}
          {kind === "agency" ? (
            <FormField label={t("agency.contactEmail")} hint={t("agency.contactEmailHint")}>
              <Input type="email" inputMode="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </FormField>
          ) : null}
          {kind === "brand" ? (
            <>
              <FormField label={t("brand.segment")} hint={t("brand.segmentHint")}>
                <Input value={segment} onChange={(e) => setSegment(e.target.value)} maxLength={60} />
              </FormField>
              <FormField label={t("brand.site")} hint={t("brand.siteHint")} required error={fieldError === "site" ? t("errors.site") : undefined}>
                <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} inputMode="url" placeholder="https://" data-testid="onboarding-site" />
              </FormField>
            </>
          ) : null}
          {kind === "professional" ? (
            <>
              <FormField label={t("professional.specialty")} required>
                <Select value={specialty} onChange={(e) => setSpecialty(e.target.value as ProfessionalSpecialty)}>
                  {PROFESSIONAL_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {t(`specialties.${s}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <FormField label={t("professional.registryNumber", { council: REGISTRY_BY_SPECIALTY[specialty] })} required error={fieldError === "registry" ? t("errors.registry") : undefined}>
                  <Input value={registryNumber} onChange={(e) => setRegistryNumber(e.target.value)} maxLength={20} />
                </FormField>
                <FormField label={t("professional.uf")} required>
                  <Select value={registryUf} onChange={(e) => setRegistryUf(e.target.value)}>
                    {BR_UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <p className="type-caption text-fg-muted">{t("professional.reviewNote")}</p>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" block data-testid="onboarding-next">
            {t("next")}
          </Button>
          {selfService ? (
            <Button type="button" variant="ghost" block onClick={cancel} disabled={pending} data-testid="onboarding-cancel">
              {t("notNow")}
            </Button>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {review.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 px-3 py-2">
                <dt className="type-caption text-fg-muted">{label}</dt>
                <dd className="break-words text-sm font-medium text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="type-body-sm text-fg-muted">{t(`${kind}.roleNote`)}</p>
          <Button type="button" size="lg" block onClick={create} loading={pending} data-testid="onboarding-create">
            {t(`${kind}.create`)}
          </Button>
          <Button type="button" variant="ghost" block onClick={() => setStep(1)} disabled={pending} leadingIcon={<ArrowLeft />}>
            {t("back")}
          </Button>
        </div>
      )}
    </div>
  );
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <span
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
        active ? "border-accent bg-accent text-accent-fg" : done ? "border-success bg-success-soft text-success" : "border-border text-fg-muted",
      )}
    >
      {n}
    </span>
  );
}
