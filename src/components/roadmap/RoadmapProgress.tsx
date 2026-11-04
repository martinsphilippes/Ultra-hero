"use client";

import { CalendarCheck2, CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, ProgressBar, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { RoadmapProgress as Progress } from "@/lib/roadmap/queries";
import type { RoadmapStatus } from "@/lib/roadmap/vocab";

const STATUS_VARIANT: Record<RoadmapStatus, BadgeVariant> = { on_time: "success", late: "danger", done: "info" };

/** Selo "No prazo" / "Atrasado" / "Concluído". */
export function RoadmapStatusBadge({ status, size = "md" }: { status: RoadmapStatus; size?: "sm" | "md" }) {
  const t = useTranslations("roadmap.status");
  return (
    <Badge variant={STATUS_VARIANT[status]} size={size} data-testid="roadmap-status">
      {t(status)}
    </Badge>
  );
}

// Barra do roteiro: "Dia X de N úteis · No prazo/Atrasado", etapas feitas, marco intermediário e previsão de entrega.
export function RoadmapProgress({ progress, compact = false }: { progress: Progress; compact?: boolean }) {
  const t = useTranslations("roadmap.progress");
  const locale = useLocale() as Locale;
  const total = progress.total ?? 0;
  const dayText =
    progress.day === 0
      ? t("notStarted", { date: formatPlainDate(progress.startedOn, locale) })
      : total > 0
        ? t("day", { day: progress.day, total })
        : t("dayNoTotal", { day: progress.day });
  return (
    <div className="flex flex-col gap-2" data-testid="roadmap-progress">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-fg type-numeric">{dayText}</span>
        <RoadmapStatusBadge status={progress.status} size={compact ? "sm" : "md"} />
        {!compact ? <span className="type-caption text-fg-muted">{t("steps", { done: progress.done, total: progress.steps })}</span> : null}
      </div>
      {total > 0 ? (
        <ProgressBar
          value={Math.min(progress.day, total)}
          max={total}
          label={t("label")}
          tone={progress.status === "late" ? "danger" : progress.status === "done" ? "info" : "success"}
          size={compact ? "sm" : "md"}
        />
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-fg-muted">
        {progress.forecast ? (
          <span className="inline-flex items-center gap-1">
            <CalendarCheck2 className="size-3.5" aria-hidden="true" />
            {t("forecast", { date: formatPlainDate(progress.forecast, locale) })}
          </span>
        ) : null}
        {!compact && progress.targetOn ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {t("target", { date: formatPlainDate(progress.targetOn, locale) })}
          </span>
        ) : null}
        {!compact && progress.milestoneOn && progress.milestoneLabel ? (
          <span>{t("milestone", { label: progress.milestoneLabel, date: formatPlainDate(progress.milestoneOn, locale) })}</span>
        ) : null}
      </div>
    </div>
  );
}
