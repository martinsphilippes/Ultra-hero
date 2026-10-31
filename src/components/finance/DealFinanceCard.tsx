"use client";

import { Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, FormField, Input, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { setDealRateAction } from "@/lib/finance/actions";
import type { Entry } from "@/lib/finance/queries";
import { computeFinance, formatRate, parseRatePercent } from "@/lib/finance/vocab";
import { EntryTable } from "./EntryTable";

type Props = {
  dealId: string;
  agencyRateBp: number;
  dealRateBp: number | null;
  contracted: boolean;
  /** Cachês dos creators que seguem no negócio (só o Adm chega aqui). */
  fees: { name: string; feeCents: number | null }[];
  entries: Entry[];
};

// Financeiro do negócio (Adm): antes da contratação, prévia (cachês + taxa = o que a marca paga) e sobrescrita
// da taxa; depois, os lançamentos gerados. Sempre simulado.
export function DealFinanceCard({ dealId, agencyRateBp, dealRateBp, contracted, fees, entries }: Props) {
  const t = useTranslations("agency.deal.finance");
  const tf = useTranslations("agency.finance");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [value, setValue] = useState(dealRateBp === null ? "" : (dealRateBp / 100).toLocaleString(locale, { maximumFractionDigits: 2 }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const effective = value.trim() === "" ? agencyRateBp : parseRatePercent(value);
  const preview = computeFinance(fees.map((f) => f.feeCents ?? 0), effective ?? agencyRateBp);
  const missing = fees.filter((f) => f.feeCents === null).length;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const bp = value.trim() === "" ? null : parseRatePercent(value);
    if (value.trim() !== "" && bp === null) return setError(tf("rateInvalid"));
    start(async () => {
      const result = await setDealRateAction({ dealId, rateBp: bp });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="deal-finance" data-testid="deal-finance">
      <h2 id="deal-finance" className="flex items-center gap-2 text-base font-semibold text-fg">
        <Wallet className="size-4" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="type-caption text-fg-muted">{tf("disclaimer")}</p>
      {!contracted ? (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div className="flex flex-col">
              <dt className="type-caption text-fg-muted">{t("fees")}</dt>
              <dd className="font-mono font-semibold text-fg">{formatCents(preview.payouts, locale)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="type-caption text-fg-muted">{t("commission", { rate: formatRate(effective ?? agencyRateBp, locale) })}</dt>
              <dd className="font-mono font-semibold text-fg">{formatCents(preview.commission, locale)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="type-caption text-fg-muted">{t("total")}</dt>
              <dd className="font-mono font-semibold text-fg" data-testid="deal-finance-total">
                {formatCents(preview.total, locale)}
              </dd>
            </div>
          </dl>
          {missing > 0 ? <p className="type-caption text-warning">{t("missingFees", { count: missing })}</p> : null}
          <FormField label={t("rateOverride")} hint={t("rateOverrideHint", { rate: formatRate(agencyRateBp, locale) })} error={error}>
            <Input inputMode="decimal" value={value} maxLength={6} placeholder={(agencyRateBp / 100).toLocaleString(locale)} onChange={(e) => setValue(e.target.value)} disabled={pending} className="sm:max-w-32" />
          </FormField>
          <Button type="submit" size="sm" variant="secondary" loading={pending} className="w-fit" data-testid="deal-rate-save">
            {t("rateSave")}
          </Button>
        </form>
      ) : (
        <EntryTable entries={entries} canAct compact emptyText={t("noEntries")} />
      )}
    </section>
  );
}
