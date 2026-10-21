"use client";

import { ArrowLeft, ArrowRight, Check, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { finishOnboarding, skipOnboarding } from "@/app/onboarding/actions";
import { Button, FormField, ProgressBar, SegmentedControl, Select, useToast } from "@/components/ui";
import { locales, type Locale } from "@/i18n/config";
import { THEME_COOKIE, type ResolvedTheme } from "@/lib/theme/constants";
import { InterestTagGrid, type InterestGroup } from "./InterestTagGrid";

type Props = { groups: InterestGroup[]; initialTags: string[]; initialLocale: Locale; initialTheme: ResolvedTheme };

const TOTAL_STEPS = 2;

// Assistente em 2 passos (interesses → idioma e tema). "Pular" marca como concluído e volta ao Início.
export function OnboardingWizard({ groups, initialTags, initialLocale, initialTheme }: Props) {
  const t = useTranslations("me.onboarding");
  const tl = useTranslations("common.languages");
  const tt = useTranslations("common.theme");
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<ResolvedTheme>(initialTheme);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyTheme(value: ResolvedTheme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", value);
    try {
      localStorage.setItem(THEME_COOKIE, value);
    } catch {
      // armazenamento indisponível; o cookie cobre
    }
  }

  function onFinish() {
    setError(null);
    startTransition(async () => {
      const result = await finishOnboarding({ tags, locale, theme });
      // Em caso de sucesso a action redireciona para "/": só chegamos aqui com erro.
      if (result && !result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      applyTheme(theme);
      toast({ title: t("done"), variant: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="type-overline text-accent-text" aria-live="polite">
          {t("step", { n: step, total: TOTAL_STEPS })}
        </p>
        <ProgressBar value={step} max={TOTAL_STEPS} label={t("step", { n: step, total: TOTAL_STEPS })} size="sm" />
      </div>

      {step === 1 ? (
        <section aria-labelledby="step-interests" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="step-interests" className="type-h2 text-fg">
              {t("steps.interests.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("steps.interests.description")}</p>
          </div>
          <InterestTagGrid groups={groups} selected={tags} onChange={setTags} disabled={pending} />
        </section>
      ) : (
        <section aria-labelledby="step-preferences" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="step-preferences" className="type-h2 text-fg">
              {t("steps.preferences.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("steps.preferences.description")}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label={t("language")}>
              <Select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} disabled={pending}>
                {locales.map((code) => (
                  <option key={code} value={code}>
                    {tl(code)}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-fg">{t("theme")}</span>
              <SegmentedControl<ResolvedTheme>
                aria-label={t("theme")}
                value={theme}
                onValueChange={(value) => {
                  setTheme(value);
                  applyTheme(value);
                }}
                options={[
                  { value: "dark", label: tt("dark"), icon: <Moon /> },
                  { value: "light", label: tt("light"), icon: <Sun /> },
                ]}
              />
            </div>
          </div>
        </section>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <form action={skipOnboarding}>
          <Button type="submit" variant="link" disabled={pending}>
            {t("skip")}
          </Button>
        </form>
        <div className="flex gap-2">
          {step === 2 ? (
            <Button variant="ghost" leadingIcon={<ArrowLeft />} onClick={() => setStep(1)} disabled={pending}>
              {t("back")}
            </Button>
          ) : null}
          {step === 1 ? (
            <Button variant="primary" trailingIcon={<ArrowRight />} onClick={() => setStep(2)} disabled={pending}>
              {t("next")}
            </Button>
          ) : (
            <Button variant="primary" leadingIcon={<Check />} onClick={onFinish} loading={pending}>
              {t("finish")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
