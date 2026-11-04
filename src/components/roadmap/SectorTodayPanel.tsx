import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { SectorToday, TodayItem } from "@/lib/roadmap/queries";
import { TODAY_SCOPES } from "@/lib/roadmap/vocab";
import { RoadmapDoneButton } from "./RoadmapDoneButton";

const BUCKETS = ["overdue", "today", "next"] as const;

// "Hoje no meu setor" (0107): etapas atrasadas, que vencem hoje e no próximo dia útil, % no prazo no mês e os filtros
// Meu setor / Só minhas / Todos os setores. Marcar feita direto daqui; o roteiro abre para quem pode ver o negócio.
export async function SectorTodayPanel({ data, basePath = "/agencia" }: { data: SectorToday; basePath?: string }) {
  const [t, ts, locale] = await Promise.all([getTranslations("roadmap.today"), getTranslations("roadmap.sectors"), getLocale() as Promise<Locale>]);
  const by = (b: TodayItem["bucket"]) => data.items.filter((x) => x.bucket === b);
  const pct = data.month.done > 0 ? Math.round((data.month.onTime / data.month.done) * 100) : null;
  const tile = "flex flex-col gap-0.5 rounded-xl border border-border bg-bg p-3";
  return (
    <section id="hoje-setor" aria-labelledby="sector-today" className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-border bg-surface p-4" data-testid="sector-today">
      <div className="flex flex-col gap-1">
        <h2 id="sector-today" className="text-sm font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">
          {data.sectors.length > 0 ? t("mySectors", { sectors: data.sectors.map((s) => ts(s)).join(", ") }) : t("noSectors")}
        </p>
      </div>
      <nav aria-label={t("scopesLabel")} className="flex flex-wrap gap-2">
        {TODAY_SCOPES.map((s) => (
          <FilterAnchor key={s} href={`${basePath}?setor=${s}#hoje-setor`} active={data.scope === s} label={t(`scopes.${s}`)} />
        ))}
      </nav>
      <div className="grid grid-cols-3 gap-2">
        <div className={tile}>
          <span className={`text-xl font-semibold type-numeric ${by("overdue").length > 0 ? "text-danger" : "text-fg"}`}>{by("overdue").length}</span>
          <span className="type-caption text-fg-muted">{t("overdue")}</span>
        </div>
        <div className={tile}>
          <span className="text-xl font-semibold text-fg type-numeric">{by("today").length}</span>
          <span className="type-caption text-fg-muted">{t("dueToday")}</span>
        </div>
        <div className={tile}>
          <span className="text-xl font-semibold text-fg type-numeric">{pct === null ? "—" : `${pct}%`}</span>
          <span className="type-caption text-fg-muted">{pct === null ? t("onTimeNone") : t("onTimeHint", { onTime: data.month.onTime, done: data.month.done })}</span>
        </div>
      </div>
      {data.items.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        BUCKETS.filter((b) => by(b).length > 0).map((b) => (
          <div key={b} className="flex flex-col gap-2">
            <h3 className={`type-caption font-semibold ${b === "overdue" ? "text-danger" : "text-fg-muted"}`}>
              {b === "overdue" ? t("overdue") : b === "today" ? t("dueToday") : t("dueNext", { date: formatPlainDate(data.next, locale) })}
            </h3>
            <ul className="flex flex-col gap-2" data-testid={`sector-today-${b}`}>
              {by(b)
                .slice(0, 20)
                .map((x) => (
                  <li key={x.id} className="flex items-start gap-2 rounded-xl border border-border bg-bg p-2">
                    <RoadmapDoneButton taskId={x.id} dealId={x.dealId} title={x.title} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                      <span className="text-sm font-medium text-fg">{x.title}</span>
                      <span className="type-caption text-fg-muted">
                        {x.dealTitle}
                        {x.client ? ` · ${x.client}` : ""}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="accent" size="sm">
                          {x.sectorExtra ? `${ts(x.sector)} + ${ts(x.sectorExtra)}` : ts(x.sector)}
                        </Badge>
                        <span className={`type-caption ${b === "overdue" ? "font-semibold text-danger" : "text-fg-muted"}`}>{t("due", { date: formatPlainDate(x.dueOn, locale) })}</span>
                        <span className="type-caption text-fg-muted">· {x.assigneeName ?? t("unassigned")}</span>
                      </span>
                    </div>
                    {x.canOpen ? (
                      <Link
                        href={`/agencia/negocios/${x.dealId}/roteiro`}
                        aria-label={t("open", { deal: x.dealTitle })}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg"
                      >
                        <ArrowRight className="size-5" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
