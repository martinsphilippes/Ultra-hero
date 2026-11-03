import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Etiqueta curta (ex.: "Teste"). */
  tag?: ReactNode;
  /** "demo" é só um apelido antigo de "neutral" (a variante tracejada de demonstração saiu da interface). */
  tagVariant?: "demo" | "neutral" | "warning" | "info";
  tone?: "default" | "muted" | "danger";
  className?: string;
};

// Cartão de indicador: rótulo, valor grande e dica opcional. Server-safe.
export function KpiCard({ label, value, hint, tag, tagVariant = "neutral", tone = "default", className }: Props) {
  return (
    <div className={cn("flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-surface p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
        {/* texto vira selo; um selo pronto (ex.: um Badge) entra como está, sem moldura dupla */}
        {tag &&
          (typeof tag === "string" ? (
            <Badge variant={tagVariant === "demo" ? "neutral" : tagVariant} size="sm">
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
