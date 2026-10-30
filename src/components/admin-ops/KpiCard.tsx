import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Etiqueta curta (ex.: "Demonstração"). */
  tag?: ReactNode;
  tagVariant?: "demo" | "neutral" | "warning" | "info";
  tone?: "default" | "muted" | "danger";
  className?: string;
};

// Cartão de indicador: rótulo, valor grande e dica opcional. Server-safe.
export function KpiCard({ label, value, hint, tag, tagVariant = "demo", tone = "default", className }: Props) {
  return (
    <div className={cn("flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-surface p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
        {/* texto vira selo; um selo pronto (ex.: DemoBadge) entra como está, sem moldura dupla */}
        {tag &&
          (typeof tag === "string" ? (
            <Badge variant={tagVariant} size="sm">
              {tag}
            </Badge>
          ) : (
            tag
          ))}
      </div>
      <p className={cn("type-numeric text-2xl font-bold", tone === "muted" && "text-fg-muted", tone === "danger" && "text-danger", tone === "default" && "text-fg")}>
        {value}
      </p>
      {hint && <p className="type-caption text-fg-muted">{hint}</p>}
    </div>
  );
}
