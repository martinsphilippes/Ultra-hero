import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Esconde no empilhamento mobile (ex.: colunas secundárias). */
  hideOnMobile?: boolean;
  className?: string;
  align?: "left" | "right" | "center";
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  emptyTitle: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  className?: string;
};

// Tabela acessível e responsiva: tabela real em md+, cartões empilhados no mobile.
export function DataTable<T>({ columns, rows, rowKey, caption, emptyTitle, emptyDescription, emptyAction, className }: Props<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} size="sm" />;
  }
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden bg-surface-elevated md:table-header-group">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block divide-y divide-border md:table-row-group">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="block p-3 md:table-row md:p-0 md:hover:bg-surface-hover">
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={typeof c.header === "string" ? c.header : undefined}
                  className={cn(
                    "flex items-start justify-between gap-3 py-1 text-fg md:table-cell md:px-4 md:py-3 md:align-middle",
                    "before:text-xs before:font-semibold before:uppercase before:tracking-wider before:text-fg-muted before:content-[attr(data-label)] md:before:hidden",
                    c.hideOnMobile && "hidden md:table-cell",
                    c.align === "right" && "md:text-right",
                    c.align === "center" && "md:text-center",
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
