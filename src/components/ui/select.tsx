import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./input";

type SelectProps = ComponentProps<"select"> & {
  invalid?: boolean;
  selectSize?: "sm" | "md";
};

const sizes = {
  sm: "h-9 min-h-9 pl-3 pr-9 text-sm",
  md: "h-11 min-h-11 pl-3.5 pr-10 text-base md:text-sm",
};

// <select> nativo (melhor acessibilidade em mobile) com seta customizada.
export function Select({ className, invalid, selectSize = "md", children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(fieldBase, sizes[selectSize], "appearance-none")}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
    </div>
  );
}
