import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type LabelProps = ComponentProps<"label"> & {
  required?: boolean;
  /** Texto curto exibido ao lado (ex.: "opcional"). */
  hint?: string;
};

export function Label({ className, required, hint, children, ...props }: LabelProps) {
  return (
    <label className={cn("flex items-baseline gap-2 text-sm font-semibold text-fg", className)} {...props}>
      <span>
        {children}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-accent-text">
            *
          </span>
        )}
      </span>
      {hint && <span className="type-caption font-normal text-fg-muted">{hint}</span>}
    </label>
  );
}
