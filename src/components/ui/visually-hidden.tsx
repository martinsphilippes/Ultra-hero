import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Texto só para leitores de tela.
export function VisuallyHidden({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("sr-only", className)} {...props} />;
}
