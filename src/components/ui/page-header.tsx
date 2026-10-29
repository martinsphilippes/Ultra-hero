import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Texto curto acima do título (ex.: pilar, seção). */
  eyebrow?: ReactNode;
  /** Link de voltar; exige `backLabel` para acessibilidade. */
  backHref?: string;
  backLabel?: string;
  /** Ações à direita (botões). */
  actions?: ReactNode;
  /** Conteúdo abaixo (abas, filtros). */
  children?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
};

// Cabeçalho de página com marca em degraus, título, descrição e ações.
export function PageHeader({ title, description, eyebrow, backHref, backLabel, actions, children, as: Heading = "h1", className }: PageHeaderProps) {
  return (
    <header className={cn("uh-page-header flex flex-col gap-4 pb-2", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md pr-2 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {backLabel}
            </Link>
          )}
          {eyebrow && (
            <div className="flex items-center gap-2">
              <StepMark />
              <span className="type-overline text-accent-text">{eyebrow}</span>
            </div>
          )}
          <Heading className={cn(Heading === "h1" ? "type-h1 uh-page-title" : "type-h2", "text-balance text-fg")}>{title}</Heading>
          {description && <p className="type-body max-w-prose text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

// Marca em degraus miniatura (decorativa).
export function StepMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-3.5 shrink-0 text-accent", className)}>
      <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="currentColor" />
    </svg>
  );
}
