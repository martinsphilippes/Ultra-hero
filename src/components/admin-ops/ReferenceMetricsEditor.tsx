"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCreatorReferencesAction } from "@/app/admin/creators/reference-actions";
import { Button, FormField, Input, useToast } from "@/components/ui";
import { COMPARE_METRIC_DEFS, COMPARE_METRICS, type CompareMetricKey } from "@/lib/heroes/compare";

type Props = { creatorId: string; initial: Partial<Record<CompareMetricKey, number>> };

// Referências para comparação (0056): um campo por indicador, com unidade fixa. Em branco = o
// indicador não é comparado para este herói.
export function ReferenceMetricsEditor({ creatorId, initial }: Props) {
  const t = useTranslations("follows.admin");
  const tm = useTranslations("follows.compare.metrics");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const start = () => Object.fromEntries(COMPARE_METRICS.map((key) => [key, initial[key] === undefined ? "" : String(initial[key])])) as Record<CompareMetricKey, string>;
  const [values, setValues] = useState<Record<CompareMetricKey, string>>(start);
  const dirty = COMPARE_METRICS.some((key) => values[key].trim() !== (initial[key] === undefined ? "" : String(initial[key])));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCreatorReferencesAction(creatorId, values);
      if (result.ok) {
        toast({ title: result.message ?? t("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="reference-metrics-editor">
      <div className="grid gap-3 sm:grid-cols-2">
        {COMPARE_METRICS.map((key) => (
          <FormField key={key} label={tm(`${key}.label`)} hint={t("unit", { unit: t(`units.${COMPARE_METRIC_DEFS[key].unit}`) })}>
            <Input
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
              data-testid={`reference-${key}`}
            />
          </FormField>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
