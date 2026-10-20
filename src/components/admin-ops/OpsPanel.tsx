"use client";

import { Truck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { advanceTransport, runRetention } from "@/app/admin/ops-actions";
import { Button, FormField, Input, useToast } from "@/components/ui";

type Props = { defaultMinutes: number };

// Painel de operações: rotinas sob demanda (retenção, transporte simulado) com resultado em toast.
export function OpsPanel({ defaultMinutes }: Props) {
  const t = useTranslations("adminOps.settings.ops");
  const { toast } = useToast();
  const [minutes, setMinutes] = useState(String(defaultMinutes));
  const [retentionPending, startRetention] = useTransition();
  const [transportPending, startTransport] = useTransition();

  function onRetention() {
    startRetention(async () => {
      const result = await runRetention();
      if (!result.ok) {
        toast({ title: result.error, variant: "error" });
        return;
      }
      toast({ title: t("retentionResult"), description: t("retentionDetail", result.counts), variant: "success", duration: 8000 });
    });
  }

  function onTransport() {
    startTransport(async () => {
      const result = await advanceTransport({ minutes: Number(minutes) });
      if (!result.ok) {
        toast({ title: result.error, variant: "error" });
        return;
      }
      toast({ title: t("transportResult", { count: result.advanced }), variant: "success" });
    });
  }

  const minutesValid = Number.isInteger(Number(minutes)) && Number(minutes) >= 0 && Number(minutes) <= 10080;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">{t("runRetention")}</h3>
          <p className="type-caption mt-1 text-fg-muted">{t("runRetentionDescription")}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onRetention} loading={retentionPending} leadingIcon={<Trash2 />}>
          {t("runRetention")}
        </Button>
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">{t("advanceTransport")}</h3>
          <p className="type-caption mt-1 text-fg-muted">{t("advanceTransportDescription")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label={t("minutes")} className="w-36">
            <Input type="number" inputMode="numeric" min={0} max={10080} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </FormField>
          <Button type="button" variant="secondary" onClick={onTransport} loading={transportPending} disabled={!minutesValid} leadingIcon={<Truck />}>
            {t("advanceTransport")}
          </Button>
        </div>
      </div>
    </div>
  );
}
