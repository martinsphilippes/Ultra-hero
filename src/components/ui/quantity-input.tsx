"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type QuantityInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "inputMode"> & {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  max?: number;
};

/**
 * Quantidade pequena (entregáveis, vagas, heróis): botões − e + e o número no meio. Dá para apagar o número e
 * digitar outro (o campo pode ficar vazio enquanto digita); ao sair, volta para dentro de min..max.
 * Pedido do responsável (04/11): "não estava conseguindo apagar o 1 para colocar o 3".
 */
export function QuantityInput({ value, onValueChange, min = 1, max = 100, disabled, className, onBlur, ...props }: QuantityInputProps) {
  const t = useTranslations("common.quantity");
  const [text, setText] = useState<string | null>(null); // null = mostra o valor; texto = digitando
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.trunc(n)));
  const shown = text ?? String(value);
  const step = (d: number) => {
    setText(null);
    onValueChange(clamp(value + d));
  };
  const btn =
    "flex size-11 shrink-0 items-center justify-center text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";
  return (
    <div className={cn("inline-flex h-11 w-fit items-center overflow-hidden rounded-[var(--uh-field-radius)] border border-border bg-surface", disabled && "opacity-60", className)}>
      <button type="button" className={btn} onClick={() => step(-1)} disabled={disabled || value <= min} aria-label={t("decrease")}>
        <Minus aria-hidden="true" />
      </button>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={shown}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, String(max).length);
          setText(digits);
          if (digits !== "") {
            const n = Number(digits);
            if (n >= min && n <= max) onValueChange(n);
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          if (text !== null) onValueChange(clamp(text === "" ? value : Number(text)));
          setText(null);
          onBlur?.(e);
        }}
        className="h-full w-12 min-w-0 bg-transparent text-center text-base font-semibold tabular-nums text-fg outline-none sm:text-sm"
      />
      <button type="button" className={btn} onClick={() => step(1)} disabled={disabled || value >= max} aria-label={t("increase")}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
