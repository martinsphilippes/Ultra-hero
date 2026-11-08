import Link from "next/link";
import { ENTRY_FILTERS, type EntryFilter } from "@/lib/finance/vocab";
import { cn } from "@/lib/utils";

// Filtros do Financeiro da agência em grade (pedido de 08/11/2026): caixas do mesmo tamanho, alinhadas e um pouco
// menores que as pílulas soltas de antes. Situação e direção em 4 colunas (Em aberto, A receber, A pagar, Vencidos /
// Previstos, Liquidados, Cancelados, Todos); as listas à parte (notas para conferir, pagamentos da marca) em 2 caixas
// largas embaixo.

export type FinanceFilterKey = EntryFilter | "payments";

const MAIN_ORDER: readonly EntryFilter[] = ["open", "receivable", "payable", "overdue", "forecast", "settled", "cancelled", "all"];
const SPECIAL: readonly FinanceFilterKey[] = ["invoices", "payments"];

/** Linhas da grade: os filtros conhecidos na ordem acima; filtro novo em ENTRY_FILTERS entra no fim da grade principal. */
export function financeFilterRows(): { main: EntryFilter[]; special: FinanceFilterKey[] } {
  const known = MAIN_ORDER.filter((f) => (ENTRY_FILTERS as readonly string[]).includes(f));
  const extra = ENTRY_FILTERS.filter((f) => !MAIN_ORDER.includes(f) && !SPECIAL.includes(f));
  return { main: [...known, ...extra], special: [...SPECIAL] };
}

/** Caixa de filtro: altura fixa, texto centralizado (quebra em 2 linhas se precisar), ativa preenchida. */
export function FilterBox({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 min-w-0 items-center justify-center rounded-xl border px-1.5 py-1 text-center text-xs font-medium leading-tight transition-colors sm:text-[13px]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
}

export function FinanceFilters({ active, label, labels }: { active: FinanceFilterKey; label: string; labels: Record<FinanceFilterKey, string> }) {
  const { main, special } = financeFilterRows();
  return (
    <nav aria-label={label} className="flex w-full max-w-2xl flex-col gap-1.5" data-testid="finance-filters">
      <div className="grid grid-cols-4 gap-1.5">
        {main.map((f) => (
          <FilterBox key={f} href={`/agencia/financeiro?f=${f}`} active={active === f} label={labels[f]} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {special.map((f) => (
          <FilterBox key={f} href={`/agencia/financeiro?f=${f}`} active={active === f} label={labels[f]} />
        ))}
      </div>
    </nav>
  );
}
