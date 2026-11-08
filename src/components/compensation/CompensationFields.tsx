"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormField, Input, MoneyInput, SegmentedControl, Textarea } from "@/components/ui";
import { COMP_KINDS, MEASURE_MAX, OFFER_MAX, PERF_KINDS, type CompensationDraft, type CompKind, type PerfKind } from "@/lib/compensation/model";
import { cn } from "@/lib/utils";

type Props = {
  idPrefix: string;
  draft: CompensationDraft;
  onChange: (draft: CompensationDraft) => void;
  disabled?: boolean;
  /** Os campos de dinheiro do próprio formulário (valor oferecido, verba, cota): só aparecem com "Valor" marcado. */
  money?: ReactNode;
  /** Dica própria (ex.: cota de patrocínio: "por marca"); sem ela, a dica geral. */
  hint?: string;
  className?: string;
};

const DRAFT_KEY: Record<CompKind, "money" | "barter" | "performance"> = { money: "money", barter: "barter", performance: "performance" };

/**
 * Forma de pagamento (0140): três botões combináveis — Valor, Permuta, Performance — e, abaixo, os campos de cada um.
 * Valor mostra os campos de dinheiro do formulário (recebidos em `money`); Permuta pede o que oferece e o valor
 * estimado; Performance pede a regra (% sobre vendas, R$ por venda ou por cadastro), como mede e a estimativa.
 */
export function CompensationFields({ idPrefix, draft, onChange, disabled, money, hint, className }: Props) {
  const t = useTranslations("compensation");
  const set = (patch: Partial<CompensationDraft>) => onChange({ ...draft, ...patch });
  const percent = draft.perfKind === "percent";

  return (
    <fieldset className={className ?? "flex flex-col gap-3"} data-testid={`${idPrefix}-compensation`} disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-fg">
        {t("label")}
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      </legend>
      <p className="-mt-1.5 type-caption text-fg-muted">{hint ?? t("hint")}</p>
      <div role="group" aria-label={t("label")} className="grid grid-cols-3 gap-1.5">
        {COMP_KINDS.map((k) => {
          const on = draft[DRAFT_KEY[k]];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => set({ [DRAFT_KEY[k]]: !on } as Partial<CompensationDraft>)}
              className={cn(
                "inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60",
                on ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg hover:bg-surface-hover",
              )}
              data-testid={`${idPrefix}-comp-${k}`}
            >
              {on ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              <span className="truncate">{t(`kinds.${k}`)}</span>
            </button>
          );
        })}
      </div>

      {draft.money && money ? <div className="flex flex-col gap-3">{money}</div> : null}

      {draft.barter ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid={`${idPrefix}-comp-barter-fields`}>
          <p className="text-sm font-semibold text-fg">{t("kinds.barter")}</p>
          <FormField label={t("barter.offer")} required>
            <Textarea
              value={draft.barterOffer}
              maxLength={OFFER_MAX}
              rows={2}
              placeholder={t("barter.offerPlaceholder")}
              onChange={(e) => set({ barterOffer: e.target.value })}
              disabled={disabled}
              data-testid={`${idPrefix}-comp-barter-offer`}
            />
          </FormField>
          <FormField label={t("barter.value")} hint={t("barter.valueHint")}>
            <MoneyInput value={draft.barterValueText} onValueChange={(text) => set({ barterValueText: text })} disabled={disabled} data-testid={`${idPrefix}-comp-barter-value`} />
          </FormField>
        </div>
      ) : null}

      {draft.performance ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid={`${idPrefix}-comp-performance-fields`}>
          <p className="text-sm font-semibold text-fg">{t("kinds.performance")}</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t("performance.kind")}</span>
            <SegmentedControl<PerfKind>
              aria-label={t("performance.kind")}
              value={draft.perfKind}
              onValueChange={(k) => {
                // trocar entre % e R$ zera o número (10 por cento não é R$ 10)
                if (k !== draft.perfKind) set({ perfKind: k, perfRateText: "" });
              }}
              options={PERF_KINDS.map((k) => ({ value: k, label: t(`performance.kinds.${k}`), disabled }))}
            />
          </div>
          {percent ? (
            <FormField label={t("performance.ratePercent")} required>
              <Input
                inputMode="decimal"
                value={draft.perfRateText}
                maxLength={6}
                placeholder={t("performance.ratePercentPlaceholder")}
                onChange={(e) => set({ perfRateText: e.target.value })}
                disabled={disabled}
                data-testid={`${idPrefix}-comp-perf-rate`}
              />
            </FormField>
          ) : (
            <FormField label={t(`performance.rateMoney.${draft.perfKind}`)} required>
              <MoneyInput value={draft.perfRateText} onValueChange={(text) => set({ perfRateText: text })} disabled={disabled} data-testid={`${idPrefix}-comp-perf-rate`} />
            </FormField>
          )}
          <FormField label={t("performance.measure")} required>
            <Input
              value={draft.perfMeasure}
              maxLength={MEASURE_MAX}
              placeholder={t("performance.measurePlaceholder")}
              onChange={(e) => set({ perfMeasure: e.target.value })}
              disabled={disabled}
              data-testid={`${idPrefix}-comp-perf-measure`}
            />
          </FormField>
          <FormField label={t("performance.estimate")} hint={t("performance.estimateHint")}>
            <MoneyInput value={draft.perfEstimateText} onValueChange={(text) => set({ perfEstimateText: text })} disabled={disabled} data-testid={`${idPrefix}-comp-perf-estimate`} />
          </FormField>
        </div>
      ) : null}
    </fieldset>
  );
}
