"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { completeRecipeOnboarding } from "@/app/(app)/recipes/onboarding/actions";
import { InterestTagGrid, type InterestGroup } from "@/components/me/InterestTagGrid";
import { Button, Checkbox, Chip } from "@/components/ui";
import { RECIPE_ALLERGIES, RECIPE_RESTRICTIONS, RECIPE_STEPS, type RecipeAllergy, type RecipeRestriction } from "@/lib/recipes/onboarding";
import { cn } from "@/lib/utils";

type Props = {
  next: string;
  groups: InterestGroup[];
  initialInterests: string[];
  initialRestrictions: RecipeRestriction[];
  initialAllergies: RecipeAllergy[];
  /** Quem já concluiu volta para revisar: o aviso já vem aceito. */
  alreadyCompleted: boolean;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// Etapa demonstrativa de receitas em 4 passos: aviso, restrições e alergias, interesses, confirmação.
export function RecipeOnboardingWizard({ next, groups, initialInterests, initialRestrictions, initialAllergies, alreadyCompleted }: Props) {
  const t = useTranslations("recipes.onboarding");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(alreadyCompleted);
  const [restrictions, setRestrictions] = useState<RecipeRestriction[]>(initialRestrictions);
  const [allergies, setAllergies] = useState<RecipeAllergy[]>(initialAllergies);
  const [interests, setInterests] = useState<string[]>(initialInterests);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const current = RECIPE_STEPS[step];
  const last = step === RECIPE_STEPS.length - 1;
  const canAdvance = current !== "notice" || accepted;

  // A cada passo, o foco vai para o título (leitor de tela anuncia onde a pessoa está).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await completeRecipeOnboarding({ acceptNotice: true, restrictions, allergies, interests });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="recipe-onboarding">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-accent-text" aria-live="polite">
          {t("progress", { step: step + 1, total: RECIPE_STEPS.length })}
        </p>
        <ol className="grid grid-cols-4 gap-2" aria-hidden="true">
          {RECIPE_STEPS.map((s, i) => (
            <li key={s} className={cn("h-1 rounded-full", i <= step ? "bg-accent" : "bg-border-strong")} />
          ))}
        </ol>
      </div>

      <section aria-labelledby="recipe-step-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <h2 id="recipe-step-title" ref={headingRef} tabIndex={-1} className="type-h2 text-fg outline-none">
          {t(`${current}.title`)}
        </h2>
        <p className="type-body-sm text-fg-muted">{t(`${current}.description`)}</p>

        {current === "notice" ? (
          <div className="flex flex-col gap-3">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-fg">
              <li>{t("notice.item1")}</li>
              <li>{t("notice.item2")}</li>
              <li>{t("notice.item3")}</li>
            </ul>
            <Checkbox id="recipe-notice" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} label={t("notice.accept")} />
          </div>
        ) : null}

        {current === "diet" ? (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="type-overline text-accent-text">{t("diet.restrictionsLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {RECIPE_RESTRICTIONS.map((r) => (
                  <Chip key={r} selected={restrictions.includes(r)} icon={restrictions.includes(r) ? <Check /> : undefined} onClick={() => setRestrictions((l) => toggle(l, r))} className="min-h-11">
                    {t(`restrictions.${r}`)}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="type-overline text-accent-text">{t("diet.allergiesLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {RECIPE_ALLERGIES.map((a) => (
                  <Chip key={a} selected={allergies.includes(a)} icon={allergies.includes(a) ? <Check /> : undefined} onClick={() => setAllergies((l) => toggle(l, a))} className="min-h-11">
                    {t(`allergies.${a}`)}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <p className="type-caption text-fg-muted">{t("diet.privacy")}</p>
          </div>
        ) : null}

        {current === "interests" ? <InterestTagGrid groups={groups} selected={interests} onChange={setInterests} disabled={pending} /> : null}

        {current === "confirm" ? (
          <dl className="flex flex-col gap-3 type-body-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">{t("confirm.notice")}</dt>
              <dd className="text-fg-muted">{t("confirm.noticeAccepted")}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">{t("diet.restrictionsLabel")}</dt>
              <dd className="text-fg-muted">{restrictions.length ? restrictions.map((r) => t(`restrictions.${r}`)).join(", ") : t("confirm.none")}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">{t("diet.allergiesLabel")}</dt>
              <dd className="text-fg-muted">{allergies.length ? allergies.map((a) => t(`allergies.${a}`)).join(", ") : t("confirm.none")}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">{t("confirm.interests")}</dt>
              <dd className="text-fg-muted">{t("confirm.interestsCount", { n: interests.length })}</dd>
            </div>
          </dl>
        ) : null}

        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" leadingIcon={<ArrowLeft />} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          {t("back")}
        </Button>
        {last ? (
          <Button variant="primary" leadingIcon={<Check />} onClick={finish} loading={pending} data-testid="recipe-onboarding-finish">
            {t("finish")}
          </Button>
        ) : (
          <Button variant="primary" trailingIcon={<ArrowRight />} onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} data-testid="recipe-onboarding-next">
            {t("next")}
          </Button>
        )}
      </div>
    </div>
  );
}
