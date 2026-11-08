import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProjectEditor, StepItem } from "@/components/group-projects/ProjectControls";
import { PRIORITY_CLASS } from "@/components/group-projects/priority";
import { Badge, PageHeader, ProgressBar } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime, formatPlainDate } from "@/i18n/format";
import { requireAgency } from "@/lib/agency/server";
import { PLAN_FIELDS, STAGE_KEYS, STAGES, formatScore, progressPercent } from "@/lib/group-projects/format";
import { listGroupMembers, loadGroupProject } from "@/lib/group-projects/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number } = await params;
  const t = await getTranslations("groupProjects.meta");
  return { title: `${t("title")} · ${number.padStart(2, "0")}` };
}

const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5";

// Ficha do projeto (0137): objetivo final, responsável e apoio, 5W2H e o plano de execução em 5 etapas com 6
// microetapas e a meta de passagem de cada uma. Gestor+ edita a ficha; responsável, apoio e gestor+ marcam.
export default async function GroupProjectPage({ params }: Props) {
  const { number: raw } = await params;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1 || number > 999) notFound();
  const ctx = await requireAgency("staff");
  if (ctx.agency.slug !== "groscove" && !ctx.platformAdmin) notFound();
  const [t, locale, project, members] = await Promise.all([getTranslations("groupProjects"), getLocale() as Promise<Locale>, loadGroupProject(number), listGroupMembers()]);
  if (!project) notFound();
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const done = project.steps.filter((s) => s.status === "done").length;
  const pct = progressPercent(done, project.steps.length);

  return (
    <div className="flex flex-col gap-5" data-testid="group-project">
      <PageHeader
        eyebrow={`${String(project.number).padStart(2, "0")} · ${project.category}`}
        title={project.name}
        backHref="/agencia/plano-de-projetos"
        backLabel={t("detail.back")}
        actions={project.canEdit ? <ProjectEditor project={project} members={members.map((m) => ({ id: m.id, name: m.name }))} /> : null}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase", PRIORITY_CLASS[project.priority])}>{t(`priorities.${project.priority}.label`)}</span>
        <span className="type-caption tabular-nums text-fg-muted">{t("score", { score: formatScore(project.score, locale) })}</span>
        <Badge size="sm" variant={project.status === "done" ? "success" : project.status === "active" ? "info" : "neutral"}>
          {t(`statuses.${project.status}`)}
        </Badge>
        <span className="type-caption text-fg-muted">{project.dueOn ? `${t("detail.due")}: ${formatPlainDate(project.dueOn, locale)}` : t("detail.noDue")}</span>
      </div>
      <div className="flex flex-col gap-1">
        <ProgressBar value={pct} label={t("progress", { done, total: project.steps.length, percent: pct })} />
        <p className="type-caption tabular-nums text-fg-muted">{t("progress", { done, total: project.steps.length, percent: pct })}</p>
      </div>
      {!project.canEdit ? <p className="type-caption text-fg-muted">{t("readOnly")}</p> : null}

      <section className={card} aria-labelledby="gp-objective">
        <h2 id="gp-objective" className="text-base font-semibold text-fg">
          {t("detail.objective")}
        </h2>
        <p className="type-body-sm text-fg">{project.objective}</p>
      </section>

      <section className={card} aria-labelledby="gp-people">
        <h2 id="gp-people" className="text-base font-semibold text-fg">
          {t("detail.people")}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="type-caption font-semibold text-fg-muted">{t("detail.owner")}</dt>
            <dd className="type-body-sm text-fg">{name(project.ownerId) ?? t("detail.toDefine")}</dd>
          </div>
          <div>
            <dt className="type-caption font-semibold text-fg-muted">{t("detail.support")}</dt>
            <dd className="type-body-sm text-fg">
              {project.supportIds.length > 0 ? project.supportIds.map((id) => name(id) ?? "—").join(", ") : t("detail.toDefine")}
            </dd>
          </div>
        </dl>
      </section>

      <section className={card} aria-labelledby="gp-plan">
        <h2 id="gp-plan" className="text-base font-semibold text-fg">
          {t("detail.plan")}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {PLAN_FIELDS.map((f) => (
            <div key={f} className="flex flex-col gap-0.5 rounded-xl border border-border p-3">
              <dt className="type-caption font-semibold uppercase tracking-wide text-accent-text">{t(`plan.${f}`)}</dt>
              <dd className="type-body-sm text-fg">{project.plan[f] || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="gp-execution">
        <div className="flex flex-col gap-1">
          <h2 id="gp-execution" className="text-lg font-semibold text-fg">
            {t("detail.execution")}
          </h2>
          {project.canMark ? <p className="type-caption text-fg-muted">{t("step.hint")}</p> : null}
        </div>
        <ol className="grid gap-3 lg:grid-cols-2">
          {STAGES.map((stage, i) => {
            const steps = project.steps.filter((s) => s.stage === stage);
            const stageDone = steps.filter((s) => s.status === "done").length;
            return (
              <li key={stage} className={card} data-testid={`stage-${stage}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-fg">{`${stage}. ${t(`stages.${STAGE_KEYS[i]}`)}`}</h3>
                  <Badge size="sm" variant={stageDone === steps.length && steps.length > 0 ? "success" : "neutral"}>
                    {t("detail.stageProgress", { done: stageDone })}
                  </Badge>
                </div>
                <ul className="divide-y divide-border">
                  {steps.map((s) => (
                    <StepItem
                      key={`${s.stage}-${s.position}`}
                      projectId={project.id}
                      number={project.number}
                      stage={s.stage}
                      position={s.position}
                      title={s.title}
                      status={s.status}
                      note={s.note}
                      canMark={project.canMark}
                    />
                  ))}
                </ul>
                {project.stageGoals[i] ? (
                  <p className="rounded-xl bg-accent-soft px-3 py-2 type-body-sm text-fg">
                    <strong className="font-semibold">{`${t("detail.stageGoal")}: `}</strong>
                    {project.stageGoals[i]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {project.notes ? (
        <section className={card} aria-labelledby="gp-notes">
          <h2 id="gp-notes" className="text-base font-semibold text-fg">
            {t("detail.notes")}
          </h2>
          <p className="type-body-sm whitespace-pre-line text-fg">{project.notes}</p>
        </section>
      ) : null}
      <p className="type-caption text-fg-muted">{t("detail.updated", { date: formatDateTime(project.updatedAt, locale) })}</p>
    </div>
  );
}
