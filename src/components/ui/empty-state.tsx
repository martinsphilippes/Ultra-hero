import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

// Estado vazio padrão: ícone em moldura, título, descrição e ação opcional.
export function EmptyState({ icon, title, description, action, size = "md", className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-4 px-6 py-14" : "gap-3 px-4 py-8",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-2xl border border-border bg-surface-elevated text-accent-text shadow-sm",
            size === "md" ? "size-16 [&_svg]:size-7" : "size-12 [&_svg]:size-5",
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex max-w-prose flex-col gap-1">
        <h2 className={cn(size === "md" ? "type-h3" : "text-sm font-semibold", "text-fg")}>{title}</h2>
        {description && <p className="type-body-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
