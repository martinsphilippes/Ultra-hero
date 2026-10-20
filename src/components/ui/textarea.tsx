import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./input";

type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export function Textarea({ className, invalid, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(fieldBase, "min-h-24 resize-y px-3.5 py-2.5 text-base leading-relaxed md:text-sm", className)}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    />
  );
}
