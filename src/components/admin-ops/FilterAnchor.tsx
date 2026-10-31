import { cn } from "@/lib/utils";

type Props = { href: string; active: boolean; label: string };

// Mesmo visual do FilterLink, mas com <a> comum: filtro por parâmetro na mesma página precisa de
// carga completa (a navegação no cliente às vezes aborta nesse caso; docs/testing.md).
export function FilterAnchor({ href, active, label }: Props) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active ? "border-fg bg-fg text-bg" : "border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg",
      )}
    >
      {label}
    </a>
  );
}
