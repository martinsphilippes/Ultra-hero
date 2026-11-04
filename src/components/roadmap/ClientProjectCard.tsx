import { CheckCircle2, Circle, ScrollText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import type { ClientProject } from "@/lib/roadmap/queries";
import { RoadmapProgress } from "./RoadmapProgress";

// Projeto em que o herói é cliente da agência (0107): andamento em dias úteis e só as etapas visíveis ao cliente.
export async function ClientProjectCard({ project, limit }: { project: ClientProject; limit?: number }) {
  const [t, tl, locale] = await Promise.all([getTranslations("roadmap.hero"), getTranslations("projectRoom.link"), getLocale() as Promise<Locale>]);
  const nextIndex = project.steps.findIndex((s) => !s.done);
  const steps = limit ? project.steps.slice(Math.max(0, nextIndex - 1), Math.max(0, nextIndex - 1) + limit) : project.steps;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="client-project">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-semibold text-fg">{project.title}</h3>
          <span className="type-caption text-fg-muted">
            {[project.progress?.service, project.brand, project.agency].filter(Boolean).join(" · ")}
          </span>
        </div>
        {project.closed ? (
          <Badge variant="neutral" size="sm">
            {t("closed")}
          </Badge>
        ) : null}
      </div>
      {project.progress ? <RoadmapProgress progress={project.progress} compact /> : null}
      {/* 0110: clipping do projeto (ao vivo; congelado no fechamento) e a pesquisa de satisfação */}
      <Link href={`/heroi/projetos/${project.dealId}/clipping`} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline" data-testid="client-project-clipping">
        <ScrollText className="size-4" aria-hidden="true" />
        {tl("clipping")}
      </Link>
      {steps.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {steps.map((s, i) => (
            <li key={`${s.title}:${i}`} className="flex items-start gap-2 text-sm">
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />}
              <span className="flex min-w-0 flex-col">
                <span className={s.done ? "text-fg-muted" : "text-fg"}>{s.title}</span>
                <span className="type-caption text-fg-muted">
                  {s.done && s.completedOn ? t("done", { date: formatPlainDate(s.completedOn, locale) }) : s.dueOn ? t("pending", { date: formatPlainDate(s.dueOn, locale) }) : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-caption text-fg-muted">{t("noSteps")}</p>
      )}
      {/* 0111: serviço recorrente — a rotina do ciclo (pautas, relatórios, feedbacks, clippings) */}
      {!limit && project.recurring.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="client-project-recurring">
          <h4 className="type-caption font-semibold text-fg-muted">{t("recurringTitle")}</h4>
          <ul className="flex flex-col gap-1">
            {project.recurring.map((r, i) => (
              <li key={`${r.title}:${r.dueOn}:${i}`} className="flex items-start gap-2 text-sm">
                {r.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />}
                <span className={r.done ? "text-fg-muted" : "text-fg"}>
                  {r.title}
                  {r.dueOn ? <span className="type-caption text-fg-muted"> · {formatPlainDate(r.dueOn, locale, { day: "2-digit", month: "2-digit" })}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
