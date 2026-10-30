import type { ReactNode } from "react";
import { barPercent, share, type DailyPoint } from "@/lib/indicators";
import { cn } from "@/lib/utils";

// Peças visuais dos Indicadores (0060): só CSS, sem biblioteca. Cada número aparece em texto; as
// barras são decorativas (aria-hidden) e a lista/tabela carrega o significado. Server-safe.

type BlockProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** true mostra `emptyLabel` no lugar do conteúdo. */
  empty?: boolean;
  emptyLabel: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** Bloco com título; vazio vira "Sem dados ainda". */
export function Block({ id, title, description, empty, emptyLabel, action, children, className }: BlockProps) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5", className)} data-testid="indicator-block">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id} className="type-h3 text-fg">
            {title}
          </h2>
          {description ? <p className="type-caption text-fg-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {empty ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center type-body-sm text-fg-muted" data-testid="indicator-empty">
          {emptyLabel}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

export type BarItem = { key: string; label: ReactNode; value: number; display: ReactNode; hint?: ReactNode };

/** Barras horizontais: rótulo + valor em texto, barra proporcional ao maior valor. */
export function BarList({ items, label, tone = "accent", ordered = false }: { items: BarItem[]; label: string; tone?: "accent" | "info" | "success" | "warning"; ordered?: boolean }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  const List = ordered ? "ol" : "ul";
  return (
    <List aria-label={label} className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={item.key} className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              {ordered ? <span className="type-numeric w-5 shrink-0 text-right text-xs font-semibold text-fg-muted">{index + 1}</span> : null}
              <span className="min-w-0 truncate font-medium text-fg">{item.label}</span>
            </span>
            <span className="type-numeric shrink-0 font-semibold text-fg">{item.display}</span>
          </div>
          <div aria-hidden="true" className={cn("h-2 overflow-hidden rounded-full bg-surface-elevated", ordered && "ml-7")}>
            <div
              className={cn(
                "h-full rounded-full",
                tone === "accent" && "bg-accent",
                tone === "info" && "bg-info",
                tone === "success" && "bg-success",
                tone === "warning" && "bg-warning",
              )}
              style={{ width: `${barPercent(item.value, max)}%` }}
            />
          </div>
          {item.hint ? <p className={cn("type-caption text-fg-muted", ordered && "ml-7")}>{item.hint}</p> : null}
        </li>
      ))}
    </List>
  );
}

/** Colunas por dia (uma série). Cada dia é um item com rótulo acessível; datas só no começo e fim. */
export function DailyBars({ points, label, barLabel, formatDay }: { points: DailyPoint[]; label: string; barLabel: (day: string, value: number) => string; formatDay: (day: string) => string }) {
  const max = Math.max(0, ...points.map((p) => p.value));
  if (points.length === 0) return null;
  return (
    <figure className="flex flex-col gap-2">
      <ul aria-label={label} className={cn("flex h-28 items-end", points.length > 45 ? "gap-px" : "gap-0.5")}>
        {points.map((p) => (
          <li key={p.day} aria-label={barLabel(p.day, p.value)} className="flex h-full min-w-0 flex-1 items-end">
            <span aria-hidden="true" className={cn("block w-full rounded-t-sm", p.value > 0 ? "bg-accent" : "bg-surface-elevated")} style={{ height: `${p.value > 0 ? barPercent(p.value, max) : 3}%` }} />
          </li>
        ))}
      </ul>
      <figcaption aria-hidden="true" className="flex justify-between type-caption text-fg-muted">
        <span>{formatDay(points[0].day)}</span>
        <span>{formatDay(points[points.length - 1].day)}</span>
      </figcaption>
    </figure>
  );
}

export type FunnelStep = { key: string; label: ReactNode; value: number; display: ReactNode };

/** Funil: cada etapa com barra relativa à primeira e a % da etapa anterior. */
export function Funnel({ steps, label, ofPrevious }: { steps: FunnelStep[]; label: string; ofPrevious: (ratio: number) => ReactNode }) {
  const max = Math.max(0, ...steps.map((s) => s.value));
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const ratio = i > 0 ? share(step.value, steps[i - 1].value) : null;
        return (
          <li key={step.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 font-medium text-fg">{step.label}</span>
              <span className="type-numeric shrink-0 text-fg">
                <span className="font-semibold">{step.display}</span>
                {ratio !== null ? <span className="ml-2 type-caption text-fg-muted">{ofPrevious(ratio)}</span> : null}
              </span>
            </div>
            <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
              <div className={cn("h-full rounded-full", i === 0 ? "bg-info" : "bg-accent")} style={{ width: `${barPercent(step.value, max)}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Grade de números pequenos (rótulo em cima, valor embaixo) para cartões de herói/profissional. */
export function StatGrid({ stats, className }: { stats: { key: string; label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-3 gap-x-3 gap-y-2", className)}>
      {stats.map((s) => (
        <div key={s.key} className="flex min-w-0 flex-col justify-end gap-0.5">
          <dt className="text-[0.6875rem] font-semibold uppercase leading-tight tracking-wider text-fg-muted">{s.label}</dt>
          <dd className="type-numeric text-base font-semibold text-fg">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
