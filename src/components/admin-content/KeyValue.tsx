import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KeyValueItem = { label: ReactNode; value: ReactNode; wide?: boolean };

// Lista de definição compacta para metadados (2 colunas em md+).
export function KeyValue({ items, className }: { items: KeyValueItem[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {items.map((item, index) => (
        <div key={index} className={cn("flex min-w-0 flex-col gap-0.5", item.wide && "sm:col-span-2")}>
          <dt className="type-caption uppercase tracking-wider text-fg-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-fg">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// Painel com título usado nas páginas de detalhe.
export function Panel({ title, description, action, children, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h3 text-fg">{title}</h2>
          {description && <p className="type-body-sm mt-0.5 text-fg-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
