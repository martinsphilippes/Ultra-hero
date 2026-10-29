"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<ComponentProps<"button">, "onChange" | "children"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md";
};

// Interruptor acessível (role=switch). Área de toque mínima 44px via padding.
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  size = "md",
  className,
  disabled,
  id,
  ...props
}: SwitchProps) {
  const track = size === "sm" ? "h-5 w-9" : "h-7 w-12";
  const thumb = size === "sm" ? "size-4 translate-x-0.5 peer-aria-checked:translate-x-[18px]" : "size-6 translate-x-0.5 peer-aria-checked:translate-x-[22px]";

  const control = (
    <span className="relative inline-flex min-h-11 items-center">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "peer relative inline-flex shrink-0 cursor-pointer rounded-full border border-transparent bg-border-strong transition-colors",
          "aria-checked:bg-accent disabled:cursor-not-allowed disabled:opacity-55",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          track,
          className,
        )}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          "uh-switch-thumb pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform",
          thumb,
        )}
      />
    </span>
  );

  if (!label) return control;

  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 text-sm text-fg">
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {description && <span className="type-caption text-fg-muted">{description}</span>}
      </span>
      {control}
    </label>
  );
}
