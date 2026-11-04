import { getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import type { RoadmapIndicators } from "@/lib/roadmap/queries";

// Indicadores dos roteiros (gestor+): % no prazo, tempo médio por etapa, setor com mais atraso, etapas mais demoradas
// e no prazo por serviço (últimos 90 dias de etapas concluídas; atrasadas abertas contam agora).
export async function RoadmapIndicatorsCard({ data }: { data: RoadmapIndicators }) {
  const [t, ts] = await Promise.all([getTranslations("roadmap.indicators"), getTranslations("roadmap.sectors")]);
  const pct = data.done > 0 ? Math.round((data.onTime / data.done) * 100) : null;
  const fmt = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));
  return (
    <section aria-labelledby="roadmap-indicators" className="flex flex-col gap-3" data-testid="roadmap-indicators">
      <div className="flex flex-col gap-0.5">
        <h2 id="roadmap-indicators" className="text-sm font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("description")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("onTime")} value={pct === null ? "—" : `${pct}%`} hint={data.done > 0 ? t("onTimeHint", { onTime: data.onTime, done: data.done }) : t("noData")} />
        <KpiCard label={t("avgDays")} value={fmt(data.avgDays)} hint={t("avgDaysHint")} />
        <KpiCard label={t("worstSector")} value={data.worstSector ? ts(data.worstSector) : "—"} hint={data.worstSector ? undefined : t("worstNone")} tone={data.worstSector ? "danger" : "default"} />
        <KpiCard label={t("lateOpen")} value={data.lateOpen} tone={data.lateOpen > 0 ? "danger" : "default"} />
      </div>
      {data.done > 0 || data.lateOpen > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <h3 className="type-caption font-semibold text-fg-muted">{t("bySector")}</h3>
            <ul className="flex flex-col gap-1.5">
              {data.sectors.map((s) => (
                <li key={s.sector} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-fg">{ts(s.sector)}</span>
                  <span className="type-caption text-fg-muted">{t("sectorRow", { done: s.done, late: s.lateDone + s.lateOpen, avg: fmt(s.avgDays) })}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <h3 className="type-caption font-semibold text-fg-muted">{t("slowest")}</h3>
            {data.slowestSteps.length === 0 ? (
              <p className="type-caption text-fg-muted">{t("noData")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.slowestSteps.map((s) => (
                  <li key={`${s.service}:${s.title}`} className="flex flex-col text-sm">
                    <span className="text-fg">{s.title}</span>
                    <span className="type-caption text-fg-muted">
                      {s.service ? `${s.service} · ` : ""}
                      {t("slowestRow", { avg: fmt(s.avgDays), count: s.count })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.services.length > 0 ? (
              <>
                <h3 className="mt-2 type-caption font-semibold text-fg-muted">{t("byService")}</h3>
                <ul className="flex flex-col gap-1">
                  {data.services.map((s) => (
                    <li key={s.service} className="flex justify-between gap-2 text-sm">
                      <span className="text-fg">{s.service || "—"}</span>
                      <span className="type-caption text-fg-muted type-numeric">{s.done > 0 ? `${Math.round((s.onTime / s.done) * 100)}%` : "—"}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
