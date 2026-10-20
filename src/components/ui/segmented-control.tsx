"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** Rótulo acessível do grupo. */
  "aria-label": string;
  size?: "sm" | "md";
  /** Só ícones (rótulo vira title/aria-label). */
  iconOnly?: boolean;
  className?: string;
};

// Seletor segmentado (role=radiogroup) com navegação por setas.
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = "md",
  iconOnly = false,
  className,
  ...props
}: SegmentedControlProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const enabled = options.filter((o) => !o.disabled);
    const index = enabled.findIndex((o) => o.value === value);
    if (index === -1) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % enabled.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    onValueChange(enabled[next].value);
    const target = event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${enabled[next].value}"]`);
    target?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={props["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn("inline-flex max-w-full gap-0.5 rounded-xl border border-border bg-surface-elevated p-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const label = typeof option.label === "string" ? option.label : undefined;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconOnly ? label : undefined}
            title={iconOnly ? label : undefined}
            data-value={option.value}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus disabled:opacity-50",
              size === "sm" ? "min-h-8 px-2.5 text-xs" : "min-h-9 px-3.5 text-sm",
              iconOnly && (size === "sm" ? "min-w-9 px-0" : "min-w-11 px-0"),
              selected ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.icon && (
              <span aria-hidden="true" className="[&_svg]:size-4">
                {option.icon}
              </span>
            )}
            {!iconOnly && option.label}
          </button>
        );
      })}
    </div>
  );
}
