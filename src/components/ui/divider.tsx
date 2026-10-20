import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DividerProps = Omit<ComponentProps<"div">, "children"> & {
  /** Texto central (ex.: "ou"). */
  label?: ReactNode;
  orientation?: "horizontal" | "vertical";
};

export function Divider({ label, orientation = "horizontal", className, ...props }: DividerProps) {
  if (orientation === "vertical") {
    return <div role="separator" aria-orientation="vertical" className={cn("w-px self-stretch bg-border", className)} {...props} />;
  }
  if (!label) {
    return <hr className={cn("border-0 border-t border-border", className)} />;
  }
  return (
    <div role="separator" className={cn("flex items-center gap-3 text-fg-muted", className)} {...props}>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className="type-caption uppercase tracking-widest">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
