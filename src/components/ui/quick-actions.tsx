import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type QuickAction = {
  href: string;
  icon: ReactNode;
  /** Rótulo curto que aparece no atalho. */
  label: string;
  /** Nome completo para leitor de tela (ex.: "Ver casting"); sem ele, vale o rótulo. */
  title?: string;
  testId?: string;
};

type Props = {
  /** Ação principal (botão de destaque, largura total no celular). */
  primary?: QuickAction | null;
  items: QuickAction[];
  label: string;
  className?: string;
  testId?: string;
};

// Atalhos padrão dos portais (pedido do responsável, 04/11 — "padrão e bonito"): no celular, a ação principal em
// largura total e, embaixo, atalhos compactos do mesmo tamanho (ícone + rótulo curto, alvo de 64px) em 3 colunas;
// em telas largas, tudo numa linha. Usado na Agenda da marca e da agência.
export function QuickActions({ primary, items, label, className, testId }: Props) {
  return (
    <nav aria-label={label} className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch", className)} data-testid={testId}>
      {primary ? (
        <Button asChild block leadingIcon={primary.icon} className="sm:w-auto sm:shrink-0">
          <Link href={primary.href} data-testid={primary.testId} aria-label={primary.title}>
            {primary.label}
          </Link>
        </Button>
      ) : null}
      {items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          {items.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              aria-label={a.title}
              data-testid={a.testId}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-1 py-2 text-center text-xs font-medium text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:bg-surface-hover sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm [&_svg]:size-5 [&_svg]:text-fg-muted sm:[&_svg]:size-4"
            >
              {a.icon}
              <span className="leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
