import type { ReactNode } from "react";
import { StepMark } from "@/components/ui/page-header";

type AuthCardProps = { title: ReactNode; subtitle?: ReactNode; children: ReactNode };

// Cartão das telas de autenticação.
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <section aria-labelledby="auth-title" className="rounded-2xl border border-border bg-surface p-6 shadow-lg sm:p-8">
      <header className="mb-6 flex flex-col gap-2">
        <StepMark className="size-4" />
        <h1 id="auth-title" className="type-h2 text-fg">
          {title}
        </h1>
        {subtitle && <p className="type-body-sm text-fg-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}
