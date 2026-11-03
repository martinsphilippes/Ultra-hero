"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormField, MoneyInput, NumberInput, SegmentedControl } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCents } from "@/lib/deals/schemas";
import { brlToCents } from "@/lib/money/brl-input";
import { ceilingCents, MAX_HEROES_LIMIT, valueLabelKey, type ValueModel } from "@/lib/value-model/model";

type Props = {
  idPrefix: string;
  model: ValueModel;
  onModelChange: (m: ValueModel) => void;
  amountText: string;
  onAmountChange: (text: string) => void;
  maxHeroes: number | null;
  onMaxHeroesChange: (n: number | null) => void;
  disabled?: boolean;
  /** Modelo, valor e máximo congelados (acordo): só mostra. */
  frozen?: boolean;
  /** Dica própria do campo de valor (patrocínio acordado, etc.); sem ela, a dica do modelo. */
  amountHint?: ReactNode;
  amountPlaceholder?: string;
  /** data-testid do campo de valor (os testes de ponta a ponta já usam os da campanha e da chamada). */
  amountTestId?: string;
  /** Obrigatório (proposta, contraproposta): marca o campo. */
  required?: boolean;
  className?: string;
};

/**
 * Seletor "Valor fixo do evento | Valor por herói" acima do campo de valor (0096). Rótulos dinâmicos ("Valor total" /
 * "Valor por herói"), "Máximo de heróis" quando é por herói e uma linha de resumo com o teto de investimento
 * ("Até R$ X"). Usado na campanha da marca, na chamada, na proposta da agência e nas contrapropostas.
 */
export function ValueModelFields({ idPrefix, model, onModelChange, amountText, onAmountChange, maxHeroes, onMaxHeroesChange, disabled, frozen, amountHint, amountPlaceholder, amountTestId, required, className }: Props) {
  const t = useTranslations("valueModel");
  const locale = useLocale() as Locale;
  const off = Boolean(disabled || frozen);
  const label = valueLabelKey(model);
  const cents = brlToCents(amountText);
  const ceiling = ceilingCents({ model, amountCents: cents, maxHeroes });
  const perHero = model === "por_heroi";

  return (
    <div className={className ?? "flex flex-col gap-3"} data-testid={`${idPrefix}-value-model`}>
      <div className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-model-label`} className="text-sm font-medium text-fg">
          {t("model.label")}
        </span>
        <SegmentedControl<ValueModel>
          aria-label={t("model.label")}
          value={model}
          onValueChange={(m) => {
            if (!off) onModelChange(m);
          }}
          options={[
            { value: "fixo", label: t("model.fixo"), disabled: off },
            { value: "por_heroi", label: t("model.porHeroi"), disabled: off },
          ]}
          className="w-full sm:w-fit"
        />
        <p className="type-caption text-fg-muted">{t(`model.hint.${perHero ? "porHeroi" : "fixo"}`)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t(`amount.${label}`)} hint={amountHint ?? t(`amount.hint.${label}`)} required={required}>
          <MoneyInput
            value={amountText}
            maxCents={10_000_000_000}
            onValueChange={(text) => onAmountChange(text)}
            disabled={off}
            placeholder={amountPlaceholder}
            data-testid={amountTestId ?? `${idPrefix}-amount`}
          />
        </FormField>
        {perHero ? (
          <FormField label={t("maxHeroes.label")} hint={t("maxHeroes.hint")} required>
            <NumberInput
              value={maxHeroes === null ? "" : maxHeroes}
              max={MAX_HEROES_LIMIT}
              onValueChange={(_text, n) => onMaxHeroesChange(n === null || n < 1 ? null : n)}
              disabled={off}
              placeholder="3"
              data-testid={`${idPrefix}-max-heroes`}
            />
          </FormField>
        ) : null}
      </div>
      <p
        role="status"
        className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-fg"
        data-testid={`${idPrefix}-value-summary`}
      >
        {perHero ? (
          ceiling !== null && cents !== null && maxHeroes !== null ? (
            <>
              <strong className="block text-base font-semibold">{t("summary.ceiling", { value: formatCents(ceiling, locale) })}</strong>
              <span className="type-caption text-fg-muted">{t("summary.ceilingDetail", { value: formatCents(cents, locale), n: maxHeroes })}</span>
            </>
          ) : (
            <span className="text-fg-muted">{t("summary.perHeroMissing")}</span>
          )
        ) : cents !== null && cents > 0 ? (
          <>
            <strong className="block text-base font-semibold">{t("summary.fixed", { value: formatCents(cents, locale) })}</strong>
            <span className="type-caption text-fg-muted">{t("summary.fixedDetail")}</span>
          </>
        ) : (
          <span className="text-fg-muted">{t("summary.fixedMissing")}</span>
        )}
      </p>
    </div>
  );
}
