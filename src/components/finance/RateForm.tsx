"use client";

import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, FormField, Input, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { setAgencyRateAction } from "@/lib/finance/actions";
import { computeFinance, parseRatePercent } from "@/lib/finance/vocab";

// Taxa de serviço padrão da agência (Adm): percentual sobre os cachês; prévia com um exemplo.
export function RateForm({ initialBp, locked = false }: { initialBp: number; locked?: boolean }) {
  const t = useTranslations("agency.finance");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [value, setValue] = useState((initialBp / 100).toLocaleString(locale, { maximumFractionDigits: 2 }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bp = parseRatePercent(value);
  const example = computeFinance([100000], bp ?? 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (bp === null) return setError(t("rateInvalid"));
    start(async () => {
      const result = await setAgencyRateAction({ rateBp: bp });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="rate-form">
      <FormField label={t("rateLabel")} hint={t("rateHint")} required error={error}>
        <Input inputMode="decimal" value={value} maxLength={6} onChange={(e) => setValue(e.target.value)} disabled={pending || locked} className="sm:max-w-32" />
      </FormField>
      <p className="type-caption text-fg-muted" data-testid="rate-preview">
        {bp === null ? t("rateInvalid") : t("ratePreview", { fees: formatCents(100000, locale), commission: formatCents(example.commission, locale), total: formatCents(example.total, locale) })}
      </p>
      {locked ? <p className="type-caption text-fg-muted">{t("rateLocked")}</p> : null}
      <Button type="submit" size="sm" leadingIcon={<Save />} loading={pending} disabled={locked} className="w-fit">
        {t("rateSave")}
      </Button>
    </form>
  );
}
