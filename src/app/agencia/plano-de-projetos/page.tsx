import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, ProgressBar } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { requireAgency } from "@/lib/agency/server";
import { PRIORITIES, countByPriority, formatScore, isPriority, progressPercent } from "@/lib/group-projects/format";
import { listGroupProjects } from "@/lib/group-projects/queries";
import { cn } from "@/lib/utils";
import { PRIORITY_CLASS } from "@/components/group-projects/priority";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groupProjects.meta");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ prioridade?: string }> };


// Plano de projetos (0137): os 25 projetos da Groscove na ordem oficial, com nota, prioridade, responsável e o
// progresso das 30 microetapas. Só a equipe da Groscove vê.
export default async function GroupProjectsPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  if (ctx.agency.slug !== "groscove" && !ctx.platformAdmin) notFound();
  const [{ prioridade }, t, locale, projects] = await Promise.all([searchParams, getTranslations("groupProjects"), getLocale() as Promise<Locale>, listGroupProjects()]);
  if (!projects) notFound();
  const filter = isPriority(prioridade) ? prioridade : null;
  const shown = filter ? projects.filter((p) => p.priority === filter) : projects;
  const counts = countByPriority(projects);
  const done = projects.reduce((s, p) => s + p.done, 0);
  const total = projects.reduce((s, p) => s + p.total, 0);
  const chip = "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <div className="flex flex-col gap-5" data-testid="group-projects">
      <PageHeader title={t("title")} description={t("description")} />
      <p className="type-body-sm font-semibold text-fg">{t("summary", { count: projects.length, percent: progressPercent(done, total) })}</p>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PRIORITIES.map((p) => (
          <div key={p} className={cn("flex flex-col gap-0.5 rounded-xl border px-3 py-2", PRIORITY_CLASS[p])}>
            <dt className="text-sm font-bold uppercase tracking-wide">{t(`priorities.${p}.label`)}</dt>
            <dd className="type-caption text-fg">{t(`priorities.${p}.hint`)}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label={t("filters.label")} className="flex flex-wrap gap-2">
        <Link href="/agencia/plano-de-projetos" aria-current={filter === null ? "page" : undefined} className={cn(chip, filter === null ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg")}>
          {t("filters.all", { count: projects.length })}
        </Link>
        {PRIORITIES.map((p) => (
          <Link
            key={p}
            href={`/agencia/plano-de-projetos?prioridade=${p}`}
            aria-current={filter === p ? "page" : undefined}
            className={cn(chip, filter === p ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg")}
          >
            {`${t(`priorities.${p}.label`)} (${counts[p]})`}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {shown.map((p) => {
            const pct = progressPercent(p.done, p.total);
            return (
              <li key={p.id}>
                <Link
                  href={`/agencia/plano-de-projetos/${p.number}`}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-4"
                  data-testid="group-project-row"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 font-mono text-sm font-semibold text-fg-muted">{String(p.number).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg">{p.name}</p>
                      <p className="type-caption text-fg-muted">{p.category}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold uppercase", PRIORITY_CLASS[p.priority])}>{t(`priorities.${p.priority}.label`)}</span>
                      <span className="type-caption tabular-nums text-fg-muted">{t("score", { score: formatScore(p.score, locale) })}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
                    <ProgressBar value={pct} size="sm" className="w-32" label={t("progress", { done: p.done, total: p.total, percent: pct })} />
                    <span className="type-caption tabular-nums text-fg-muted">{t("progress", { done: p.done, total: p.total, percent: pct })}</span>
                    <span className="type-caption text-fg-muted">{p.owner ? t("owner", { name: p.owner }) : t("ownerNone")}</span>
                    {p.status !== "active" ? (
                      <Badge size="sm" variant={p.status === "done" ? "success" : "neutral"}>
                        {t(`statuses.${p.status}`)}
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
