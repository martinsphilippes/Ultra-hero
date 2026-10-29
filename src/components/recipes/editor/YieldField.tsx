"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { composeYield, convertYieldAmount, parseYield, sanitizeYieldAmount, YIELD_RULES, YIELD_UNITS, type YieldChoice, type YieldLabel, type YieldValue } from "@/lib/recipes/yield";
import { FieldError } from "./shared";

type Props = {
  /** id do campo de erro/foco (details.yield_text) */
  id: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  disabled?: boolean;
};

// Rendimento: número + tipo. O teclado e o que a caixa aceita seguem o tipo escolhido
// (inteiro para un/forma/fatia e g/ml; decimal para kg e L); "Outro" vira texto livre.
export function YieldField({ id, value, onChange, error, disabled }: Props) {
  const t = useTranslations("recipes.editor.basics");
  const locale = useLocale();
  const sep = locale.startsWith("en") ? "." : ",";
  const label: YieldLabel = useMemo(() => (unit, count) => t(`yieldUnits.${unit}.${count === 1 ? "one" : "other"}`), [t]);
  const [state, setState] = useState<YieldValue>(() => parseYield(value, label, sep));

  const update = (next: YieldValue) => {
    setState(next);
    onChange(composeYield(next, label, locale));
  };

  const changeUnit = (unit: YieldChoice) => {
    if (unit === "other") {
      // leva o que já estava montado para o texto livre, para não perder nada
      update({ unit, amount: state.amount, other: state.other || composeYield(state, label, locale) });
      return;
    }
    update({ ...state, unit, amount: convertYieldAmount(state.amount, unit, sep) });
  };

  const isOther = state.unit === "other";
  const kind = state.unit === "other" ? null : YIELD_RULES[state.unit].kind;
  const hint = isOther ? t("yieldHintOther") : kind === "decimal" ? t("yieldHintDecimal") : t("yieldHintInteger");
  const preview = composeYield(state, label, locale);
  const hintId = `${id}-hint`;
  const describedBy = [hintId, error ? `${id}-err` : null].filter(Boolean).join(" ");

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5" data-testid="recipe-yield">
      <Label id={`${id}-label`} htmlFor={id}>
        {t("yield")}
      </Label>
      <div className={isOther ? "flex flex-col gap-2" : "grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2"}>
        {isOther ? null : (
          <Input
            id={id}
            aria-label={t("yieldAmount")}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            inputMode={kind === "decimal" ? "decimal" : "numeric"}
            pattern={kind === "decimal" ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
            autoComplete="off"
            placeholder={kind === "decimal" ? `1${sep}5` : "12"}
            value={state.amount}
            onChange={(e) => update({ ...state, amount: sanitizeYieldAmount(e.target.value, state.unit as Exclude<YieldChoice, "other">, sep) })}
            disabled={disabled}
            data-testid="recipe-yield-amount"
          />
        )}
        <Select aria-label={t("yieldUnit")} value={state.unit} onChange={(e) => changeUnit(e.target.value as YieldChoice)} disabled={disabled} data-testid="recipe-yield-unit">
          {YIELD_UNITS.map((u) => (
            <option key={u} value={u}>
              {t(`yieldOptions.${u}`)}
            </option>
          ))}
          <option value="other">{t("yieldOptions.other")}</option>
        </Select>
        {isOther ? (
          <Input
            id={id}
            aria-label={t("yieldOther")}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            maxLength={60}
            value={state.other}
            onChange={(e) => update({ ...state, other: e.target.value })}
            disabled={disabled}
            data-testid="recipe-yield-other"
          />
        ) : null}
      </div>
      <p id={hintId} className="type-caption text-fg-muted">
        {preview ? t("yieldPreview", { text: preview }) : hint}
      </p>
      <FieldError id={id} message={error} />
    </div>
  );
}
