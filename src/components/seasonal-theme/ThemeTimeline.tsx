import { getFormatter, getTranslations } from "next-intl/server";
import type { AdminTheme } from "@/lib/seasonal-theme/form";
import { buildTimeline } from "@/lib/seasonal-theme/resolve";

const FALLBACK = ["#64748b", "#0e7490", "#7c3aed", "#b45309", "#be123c", "#15803d"];

/** Trechos seguidos com o mesmo vencedor (e os temas que coincidem e perdem pela prioridade). */
function segments(days: ReturnType<typeof buildTimeline>) {
  const out: { from: string; to: string; winner: string | null; others: Set<string> }[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && last.winner === d.winner) {
      last.to = d.day;
      d.others.forEach((o) => last.others.add(o));
    } else out.push({ from: d.day, to: d.day, winner: d.winner, others: new Set(d.others) });
  }
  return out.filter((s) => s.winner);
}

// Linha do tempo dos próximos N dias (publicados): quem vence em cada dia e os conflitos de prioridade.
export async function ThemeTimeline({ themes, now, timeZone, days = 60 }: { themes: AdminTheme[]; now: Date; timeZone: string; days?: number }) {
  const [t, format] = await Promise.all([getTranslations("seasonalTheme.admin"), getFormatter()]);
  const live = themes.filter((x) => x.status === "published" && x.windowStart && x.windowEnd && !x.eventCancelled);
  const byId = new Map(live.map((x, i) => [x.id, { ...x, color: x.tokens.light?.accent ?? x.tokens.dark?.accent ?? FALLBACK[i % FALLBACK.length] }]));
  const timeline = buildTimeline(
    live.map((x) => ({ id: x.id, priority: x.priority, areas: x.areas, windowStart: x.windowStart!, windowEnd: x.windowEnd! })),
    now,
    days,
    timeZone,
  );
  const fmt = (day: string) => format.dateTime(new Date(`${day}T12:00:00Z`), { day: "2-digit", month: "short", timeZone: "UTC" });

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="themes-timeline">
      <h2 className="type-h3">{t("timeline", { days })}</h2>
      <div className="flex h-6 w-full overflow-hidden rounded-md border border-border" role="img" aria-label={t("timelineAria", { days })}>
        {timeline.map((d) => (
          <span
            key={d.day}
            className="h-full flex-1 border-r border-bg/40 last:border-r-0"
            style={{ background: d.winner ? byId.get(d.winner)?.color : "transparent", boxShadow: d.others.length ? "inset 0 -5px 0 var(--uh-warning)" : undefined }}
            title={`${fmt(d.day)}: ${d.winner ? byId.get(d.winner)?.name : t("defaultIdentity")}`}
          />
        ))}
      </div>
      <div className="flex justify-between type-caption text-fg-muted">
        <span>{fmt(timeline[0].day)}</span>
        <span>{fmt(timeline[timeline.length - 1].day)}</span>
      </div>
      <p className="flex items-center gap-2 type-caption text-fg-muted">
        <span className="h-1.5 w-4 rounded-sm bg-warning" aria-hidden="true" />
        {t("conflictLegend")}
      </p>
      {segments(timeline).length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("timelineEmpty", { days })}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {segments(timeline).map((s) => {
            const w = byId.get(s.winner!)!;
            return (
              <li key={`${s.from}-${s.winner}`} className="flex items-start gap-2 type-body-sm">
                <span className="mt-1 size-3 shrink-0 rounded-sm border border-border" style={{ background: w.color }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-semibold">{w.name}</span> · {s.from === s.to ? fmt(s.from) : `${fmt(s.from)} – ${fmt(s.to)}`} · {t("priorityShort", { value: w.priority })}
                  {s.others.size ? (
                    <span className="block text-warning">{t("conflict", { names: [...s.others].map((id) => `${byId.get(id)?.name} (${byId.get(id)?.priority})`).join(", ") })}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
