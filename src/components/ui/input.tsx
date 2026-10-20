import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full rounded-lg border border-border-strong bg-surface text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150 hover:border-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus/40 disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger aria-invalid:focus:ring-danger/30";

type InputProps = ComponentProps<"input"> & {
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  inputSize?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-9 min-h-9 px-3 text-sm",
  md: "h-11 min-h-11 px-3.5 text-base md:text-sm",
  lg: "h-12 min-h-12 px-4 text-base",
};

// Campo de texto; use dentro de <FormField> para rótulo, dica e erro conectados.
export function Input({ className, invalid, leadingIcon, trailingIcon, inputSize = "md", ...props }: InputProps) {
  const input = (
    <input
      className={cn(fieldBase, sizes[inputSize], leadingIcon && "pl-10", trailingIcon && "pr-10", className)}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    />
  );
  if (!leadingIcon && !trailingIcon) return input;
  return (
    <div className="relative">
      {leadingIcon && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-muted [&_svg]:size-4">
          {leadingIcon}
        </span>
      )}
      {input}
      {trailingIcon && (
        <span className="absolute inset-y-0 right-2 flex items-center text-fg-muted [&_svg]:size-4">{trailingIcon}</span>
      )}
    </div>
  );
}
