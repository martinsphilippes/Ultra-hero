import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
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
  /**
   * Destino do cartão (pedido do responsável 04/11: os cartões do início levam ao lugar da informação). Com href, o
   * cartão inteiro vira um link (sem elementos interativos dentro), com seta, hover e anel de foco.
   */
  href?: string;
  className?: string;
};

const text = (n: ReactNode) => (typeof n === "string" || typeof n === "number" ? String(n) : null);

// Nome acessível do cartão-link: "rótulo: valor · dica" quando tudo é texto; senão o conteúdo do link já serve.
export function kpiAriaLabel(label: ReactNode, value: ReactNode, hint?: ReactNode): string | undefined {
  const l = text(label);
  const v = text(value);
  if (l === null || v === null) return undefined;
  const h = hint === undefined || hint === null || hint === false ? null : text(hint);
  return h ? `${l}: ${v} · ${h}` : `${l}: ${v}`;
}

// Cartão de indicador: rótulo, valor grande e dica opcional. Server-safe.
export function KpiCard({ label, value, hint, tag, tagVariant = "neutral", tone = "default", href, className }: Props) {
  const body = (
    <>
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
    </>
  );
  const base = "flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-surface p-4";
  if (!href) return <div className={cn(base, className)}>{body}</div>;
  return (
    <Link
      href={href}
      aria-label={kpiAriaLabel(label, value, hint)}
      data-kpi-link=""
      className={cn(
        base,
        "group relative pr-9 transition-[border-color,background-color,box-shadow] duration-200 hover:border-accent/40 hover:bg-surface-hover hover:shadow-sm active:bg-surface-hover active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      {body}
      <ChevronRight
        className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text"
        aria-hidden="true"
      />
    </Link>
  );
}
