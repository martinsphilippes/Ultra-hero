"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Rótulo acessível do campo numérico. */
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
};

// Seletor de quantidade (1–20 por padrão): botões de 44px + campo numérico editável.
export function QuantityStepper({ value, onChange, min = 1, max = 20, label, disabled, size = "md", className }: Props) {
  const t = useTranslations("commerce.product");
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl border border-border-strong bg-surface p-0.5", className)}>
      <IconButton label={t("qtyDecrease")} icon={<Minus />} size={size} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className={cn(
          "type-numeric w-12 bg-transparent text-center font-semibold text-fg outline-none [appearance:textfield] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          size === "sm" ? "h-9 text-sm" : "h-11 text-base",
        )}
      />
      <IconButton label={t("qtyIncrease")} icon={<Plus />} size={size} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))} />
    </div>
  );
}
