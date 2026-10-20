import Link from "next/link";
import type { ReactNode } from "react";
import { badgeVariants, type BadgeVariant } from "@/components/ui";
import { cn } from "@/lib/utils";

type ChipLinkProps = {
  href: string;
  selected?: boolean;
  variant?: BadgeVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

// Chip de filtro navegável: o estado vive na URL e funciona sem JavaScript.
export function ChipLink({ href, selected = false, variant = "neutral", icon, children, className }: ChipLinkProps) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        selected
          ? variant === "neutral"
            ? "border-fg bg-fg text-bg"
            : cn(badgeVariants[variant], "font-semibold")
          : "border-border-strong bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg",
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="[&_svg]:size-4">
          {icon}
        </span>
      )}
      {children}
    </Link>
  );
}

type ChipRowProps = {
  label: string;
  children: ReactNode;
  /** Mostra o rótulo visualmente (padrão: só para leitores de tela). */
  showLabel?: boolean;
  /** Sangra até a borda da tela no mobile (rolagem horizontal). */
  bleed?: boolean;
  className?: string;
};

// Linha de chips com rótulo acessível e rolagem horizontal no mobile.
export function ChipRow({ label, children, showLabel = false, bleed = true, className }: ChipRowProps) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-1.5", className)}>
      {showLabel ? <span className="type-overline text-fg-muted">{label}</span> : null}
      <div
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 scrollbar-none md:flex-wrap md:pb-0",
          bleed && "-mx-gutter px-gutter md:mx-0 md:px-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
