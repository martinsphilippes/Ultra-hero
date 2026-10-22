import type { Baseline } from "@/lib/wearables/derived";
import { cn } from "@/lib/utils";

export type TrendPoint = { date: string; label: string; value: number | null; display: string; partial: boolean };

type Props = {
  title: string;
  /** Resumo para leitor de tela (role="img"). */
  summary: string;
  points: TrendPoint[];
  band: Baseline | null;
  bandLabel: string;
  partialLabel: string;
  table: { toggle: string; caption: string; colDate: string; colValue: string };
  /** Começa o eixo no zero (contagens, minutos). */
  zeroBased?: boolean;
  locale: string;
  /** Rótulo do eixo (ex.: minutos em horas); padrão: número compacto do idioma. */
  formatTick?: (value: number) => string;
  testId?: string;
};

// Tendência de 7/30 dias: uma série, um eixo, barras finas ancoradas na base, a faixa habitual
// sombreada atrás e o dia de hoje (parcial) com contorno. Texto sempre nas cores de texto; cada
// barra tem dica nativa (title) e há uma tabela equivalente para quem não enxerga o gráfico.
export function TrendChart({ title, summary, points, band, bandLabel, partialLabel, table, zeroBased = false, locale, formatTick, testId }: Props) {
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const tick = (v: number) => (formatTick ? formatTick(v) : compact.format(v));
  const hasPartial = points.some((p) => p.partial && p.value !== null);
  const values = points.map((p) => p.value).filter((v): v is number => typeof v === "number");
  const candidates = [...values, ...(band ? [band.low, band.high] : [])];
  const rawMax = candidates.length ? Math.max(...candidates) : 1;
  const rawMin = candidates.length ? Math.min(...candidates) : 0;
  const pad = (rawMax - rawMin) * 0.12 || Math.abs(rawMax) * 0.1 || 1;
  const yMin = zeroBased ? 0 : rawMin - pad;
  const yMax = rawMax + pad;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - yMin) / (yMax - yMin)) * 100));
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure className="flex flex-col gap-2" data-testid={testId}>
      <figcaption className="type-body-sm font-semibold text-fg">{title}</figcaption>
      <div className="flex items-stretch gap-2">
        {/* eixo y: só máximo e mínimo, discretos */}
        <div className="flex w-12 shrink-0 flex-col justify-between py-0.5 text-right type-caption type-numeric text-fg-muted" aria-hidden="true">
          <span>{tick(yMax)}</span>
          <span>{tick(yMin)}</span>
        </div>
        <div role="img" aria-label={summary} className="relative h-40 flex-1 rounded-lg border border-border bg-surface">
          {band ? (
            <div
              className="absolute inset-x-0 border-y border-dashed border-info/50 bg-info-soft"
              style={{ bottom: `${pct(band.low)}%`, height: `${Math.max(1, pct(band.high) - pct(band.low))}%` }}
              title={bandLabel}
            />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-0.5 px-1">
            {points.map((p) => (
              <div key={p.date} className="flex h-full flex-1 items-end" title={`${p.label}: ${p.display}${p.partial ? ` (${partialLabel})` : ""}`}>
                {typeof p.value === "number" ? (
                  <div
                    className={cn("w-full rounded-t-[4px]", p.partial ? "border border-b-0 border-accent bg-accent/30" : "bg-accent")}
                    style={{ height: `${Math.max(2, pct(p.value))}%` }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between pl-14 type-caption text-fg-muted" aria-hidden="true">
        <span>{first?.label}</span>
        <span>{last?.label}</span>
      </div>
      <p className="flex flex-wrap items-center gap-3 type-caption text-fg-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm border border-dashed border-info/60 bg-info-soft" />
          {bandLabel}
        </span>
        {hasPartial ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border border-accent bg-accent/30" />
            {partialLabel}
          </span>
        ) : null}
      </p>
      <details className="rounded-lg border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{table.toggle}</summary>
        <div className="max-h-72 overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" role="region" aria-label={table.caption} tabIndex={0}>
          <table className="w-full border-collapse text-left type-body-sm">
            <caption className="sr-only">{table.caption}</caption>
            <thead className="bg-surface-elevated">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold text-fg">
                  {table.colDate}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-fg">
                  {table.colValue}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 font-normal text-fg">
                    {p.label}
                  </th>
                  <td className="px-3 py-1.5 text-right type-numeric text-fg">
                    {p.display}
                    {p.partial ? ` (${partialLabel})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

