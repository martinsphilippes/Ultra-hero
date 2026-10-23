"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { grantHealthConsent } from "@/app/(app)/profile/devices/actions";
import { Button, Checkbox } from "@/components/ui";
import type { HealthCategory, HealthProvider } from "@/lib/health/types";

type Props = {
  provider: HealthProvider;
  brand: string;
  version: string;
  locale: string;
  minAge: number;
  minAgePending: boolean;
  categories: readonly HealthCategory[];
  /** Já autorizadas antes (outra marca): vêm marcadas; retirar é em "Relógios e anéis". */
  alreadyGranted: readonly HealthCategory[];
};

// Consentimento específico e destacado, por categoria (LGPD art. 11, I; RF-08): nada vem marcado
// de fábrica além do que a pessoa já autorizou, a idade é autodeclarada (regra configurável, Q7) e
// o botão é inequívoco. Só depois do aceite gravado o navegador segue para a tela da marca (OAuth).
export function ConsentForm({ provider, brand, version, locale, minAge, minAgePending, categories, alreadyGranted }: Props) {
  const t = useTranslations("devices");
  const id = useId();
  const [selected, setSelected] = useState<Set<HealthCategory>>(() => new Set(alreadyGranted.filter((c) => categories.includes(c))));
  const [age, setAge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (c: HealthCategory) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const submit = () => {
    setError(null);
    if (selected.size === 0) return setError(t("errors.categories"));
    if (!age) return setError(t("errors.age"));
    startTransition(async () => {
      const result = await grantHealthConsent({ provider, version, locale, categories: [...selected], ageConfirmed: true });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        // login ficou velho enquanto lia: a página volta com o botão "Entrar de novo"
        if (result.error === "reauth") window.location.reload();
        return;
      }
      setRedirecting(true);
      // rota de servidor que cria o state/PKCE e redireciona para a marca
      window.location.assign(result.next);
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      data-testid="consent-form"
    >
      <fieldset className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
        <legend className="px-1 type-h3 text-fg">{t("consent.categoriesTitle")}</legend>
        <p className="type-caption text-fg-muted">{t("consent.categoriesHint")}</p>
        {categories.map((c) => (
          <Checkbox
            key={c}
            id={`${id}-${c}`}
            name="categories"
            value={c}
            checked={selected.has(c)}
            onChange={() => toggle(c)}
            label={t(`categories.${c}.name`)}
            description={t(`categories.${c}.desc`)}
          />
        ))}
      </fieldset>

      <p className="flex items-start gap-2 type-body-sm text-fg">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
        {t("consent.notDo")}
      </p>

      <div className="flex flex-col gap-1">
        <Checkbox id={`${id}-age`} checked={age} onChange={(e) => setAge(e.currentTarget.checked)} label={t("consent.age", { age: minAge })} description={minAgePending ? t("consent.agePending") : undefined} />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 type-body-sm text-fg">
          {error}
        </p>
      ) : null}
      {redirecting ? (
        <p aria-live="polite" className="type-body-sm text-fg-muted">
          {t("consent.redirecting", { brand })}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="primary" size="lg" loading={pending || redirecting} data-testid="consent-submit">
          {t("consent.submit")}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <a href="/profile/devices">{t("consent.cancel")}</a>
        </Button>
      </div>
    </form>
  );
}
