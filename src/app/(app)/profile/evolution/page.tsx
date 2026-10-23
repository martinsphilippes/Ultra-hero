import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { Award, BookOpen, CheckCircle2, ChefHat, Compass, Download, Dumbbell, FileText, Flame, Heart, Layers, PlayCircle, Trophy } from "lucide-react";
import { AchievementsGrid, type AchievementRow } from "@/components/me/AchievementsGrid";
import { ActivityStrip } from "@/components/me/ActivityStrip";
import { isValidTimeZone, localDateIn, longestRun } from "@/components/me/dates";
import { Badge, Button, EmptyState, PageHeader, PillarBadge, ProgressBar } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatRelativeTime } from "@/i18n/format";
import { getProfile, requireUser } from "@/lib/auth/session";
import type { Enums, FnReturns, Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("evolution") };
}

// Evolução: sequência (compute_streak), faixa de 14 dias, estatísticas, programas, conquistas e atividade recente.
// A faixa e os dias ativos vêm só de streak_events, a mesma regra da sequência (Q10, 0037): lembretes não contam.

const STRIP_DAYS = 14;

type EnrollmentRow = {
  id: string;
  status: Enums<"enrollment_status">;
  program_id: string;
  version_id: string;
  enrolled_at: string;
  completed_at: string | null;
  program: { slug: string; pillar: Pillar; cover_url: string | null } | null;
  version: { title: string; version_no: number } | null;
};

type ContentRef = { slug: string; title: string; type: Enums<"content_type">; pillar: Pillar } | null;
type RecentCompletion = { content_id: string; completed_at: string; content: ContentRef };
type RecentProgress = { content_id: string; progress_pct: number; updated_at: string; content: ContentRef };
type Activity = { key: string; kind: "completed" | "progress"; at: string; pct: number | null; content: ContentRef };
type RequiredItem = FnReturns<"program_required_items">[number];

const TYPE_ICON = { video: PlayCircle, recipe: ChefHat, workout: Dumbbell, guide: BookOpen, article: FileText } as const;

export default async function EvolutionPage() {
  const user = await requireUser("/profile/evolution");
  const [profile, locale, t, tc] = await Promise.all([getProfile(), getLocale(), getTranslations("me.evolution"), getTranslations("common")]);
  const uiLocale = locale as Locale;
  const tz = isValidTimeZone(profile?.timezone) ? profile.timezone : "UTC";
  const today = localDateIn(tz);
  const supabase = await createClient();

  const [streakRes, eventsRes, completionsCountRes, completionsRes, enrollmentsRes, favoritesRes, achievementsRes, earnedRes, certificatesRes, recentCompletionsRes, recentProgressRes] =
    await Promise.all([
      supabase.rpc("compute_streak", { p_user: user.id, p_timezone: tz }),
      supabase.from("streak_events").select("local_date").eq("user_id", user.id).order("local_date", { ascending: false }).limit(2000),
      supabase.from("completions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("completions").select("content_id").eq("user_id", user.id).limit(2000),
      supabase
        .from("enrollments")
        .select("id, status, program_id, version_id, enrolled_at, completed_at, program:programs(slug, pillar, cover_url), version:program_versions(title, version_no)")
        .eq("user_id", user.id)
        .order("enrolled_at", { ascending: false }),
      supabase.from("favorites").select("content_id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("achievements").select("id, code, name, description, icon, rule").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("user_achievements").select("achievement_id, earned_at").eq("user_id", user.id),
      supabase.from("certificates").select("code, enrollment_id, revoked_at").eq("user_id", user.id),
      supabase.from("completions").select("content_id, completed_at, content:content(slug, title, type, pillar)").eq("user_id", user.id).order("completed_at", { ascending: false }).limit(10),
      supabase.from("content_progress").select("content_id, progress_pct, updated_at, content:content(slug, title, type, pillar)").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(10),
    ]);

  const firstError = [streakRes, eventsRes, completionsCountRes, completionsRes, enrollmentsRes, favoritesRes, achievementsRes, earnedRes, certificatesRes, recentCompletionsRes, recentProgressRes].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  // Sequência atual (servidor) e melhor sequência (maior corrida de datas locais consecutivas).
  const currentStreak = Number(streakRes.data ?? 0);
  const eventDates = (eventsRes.data ?? []).map((e) => e.local_date);
  const bestStreak = Math.max(currentStreak, longestRun(eventDates));
  const countsByDate = new Map<string, number>();
  for (const date of eventDates) countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1);

  const completionsCount = completionsCountRes.count ?? 0;
  const completedIds = new Set((completionsRes.data ?? []).map((c) => c.content_id));
  const enrollments = (enrollmentsRes.data ?? []) as unknown as EnrollmentRow[];
  const favoritesCount = favoritesRes.count ?? 0;
  const achievements = (achievementsRes.data ?? []) as AchievementRow[];
  const earned = new Map((earnedRes.data ?? []).map((row) => [row.achievement_id, row.earned_at]));
  const certificates = new Map((certificatesRes.data ?? []).filter((c) => !c.revoked_at).map((c) => [c.enrollment_id, c.code]));

  // Progresso por programa: itens obrigatórios efetivos (com substituições) × conclusões.
  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const requiredByVersion = new Map<string, RequiredItem[]>();
  await Promise.all(
    Array.from(new Set(activeEnrollments.map((e) => e.version_id))).map(async (versionId) => {
      const { data } = await supabase.rpc("program_required_items", { p_version: versionId });
      requiredByVersion.set(versionId, ((data ?? []) as RequiredItem[]).filter((i) => i.is_required));
    }),
  );
  const progressOf = (enrollment: EnrollmentRow) => {
    if (enrollment.status === "completed") return { done: 1, total: 1, pct: 100 };
    const required = requiredByVersion.get(enrollment.version_id) ?? [];
    const done = required.filter((i) => completedIds.has(i.content_id) || completedIds.has(i.original_content_id)).length;
    return { done, total: required.length, pct: required.length > 0 ? Math.round((done / required.length) * 100) : 0 };
  };

  // Atividade recente: conclusões + progressos (sem duplicar conteúdo já concluído), 10 mais recentes.
  const completedRecent = (recentCompletionsRes.data ?? []) as unknown as RecentCompletion[];
  const progressRecent = (recentProgressRes.data ?? []) as unknown as RecentProgress[];
  const activities: Activity[] = [
    ...completedRecent.map((c) => ({ key: `c-${c.content_id}`, kind: "completed" as const, at: c.completed_at, pct: null, content: c.content })),
    ...progressRecent.filter((p) => !completedIds.has(p.content_id)).map((p) => ({ key: `p-${p.content_id}`, kind: "progress" as const, at: p.updated_at, pct: p.progress_pct, content: p.content })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  const isNew = eventDates.length === 0 && completionsCount === 0 && enrollments.length === 0;

  const stats = [
    { key: "completions", value: completionsCount, icon: CheckCircle2 },
    { key: "programsActive", value: activeEnrollments.length, icon: Layers },
    { key: "programsCompleted", value: enrollments.filter((e) => e.status === "completed").length, icon: Award },
    { key: "favorites", value: favoritesCount, icon: Heart },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} />

      {isNew ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60">
          <EmptyState
            icon={<Compass />}
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <Button asChild variant="primary">
                <Link href="/explore">{t("empty.cta")}</Link>
              </Button>
            }
          />
        </div>
      ) : null}

      {/* Sequência */}
      <section aria-labelledby="streak-title" className="grid gap-4 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/60 to-surface p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-sm">
            <Flame className="size-8" />
          </span>
          <div className="flex flex-col">
            <h2 id="streak-title" className="type-overline text-accent-text">
              {t("streak.current")}
            </h2>
            <p className="type-h1 type-numeric text-fg">{t("streak.days", { n: currentStreak })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end sm:text-right">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Trophy className="size-4 text-accent-text" aria-hidden="true" />
            {t("streak.best")}: <span className="type-numeric">{t("streak.days", { n: bestStreak })}</span>
          </p>
          <p className="type-caption max-w-prose text-fg-muted">{t("streak.hint")}</p>
          <p className="type-caption text-fg-subtle">{t("streak.timezone", { tz })}</p>
        </div>
      </section>

      <ActivityStrip today={today} countsByDate={countsByDate} days={STRIP_DAYS} />

      {/* Estatísticas */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t("title")}>
        {stats.map(({ key, value, icon: Icon }) => (
          <li key={key} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="type-h2 type-numeric text-fg">{value}</span>
              <span className="type-caption text-fg-muted">{t(`stats.${key}`)}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* Meus programas */}
      <section aria-labelledby="programs-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="programs-title" className="type-h2 text-fg">
            {t("programs.title")}
          </h2>
          <p className="type-body-sm text-fg-muted">{t("programs.description")}</p>
        </div>
        {enrollments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface/60 px-4 py-6 text-center type-body-sm text-fg-muted">{t("programs.empty")}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {enrollments.map((enrollment) => {
              const progress = progressOf(enrollment);
              const pillar = enrollment.program?.pillar ?? "routine";
              const cover = enrollment.program?.cover_url ?? `/placeholders/cover-${pillar}-1.svg`;
              const title = enrollment.version?.title ?? t("recent.unavailable");
              const certificate = enrollment.status === "completed" ? certificates.get(enrollment.id) : undefined;
              return (
                <li key={enrollment.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <span className="relative hidden h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-elevated sm:block">
                      <Image src={cover} alt="" fill unoptimized sizes="80px" className="object-cover" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PillarBadge pillar={pillar} size="sm" />
                        <Badge variant={enrollment.status === "completed" ? "success" : enrollment.status === "active" ? "info" : "neutral"} size="sm">
                          {t(`programs.status.${enrollment.status}`)}
                        </Badge>
                        {enrollment.version ? (
                          <Badge variant="neutral" size="sm">
                            {t("programs.version", { n: enrollment.version.version_no })}
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="line-clamp-2 text-sm font-semibold text-fg">{title}</h3>
                      <p className="type-caption text-fg-muted">{t("programs.enrolledOn", { date: formatDate(enrollment.enrolled_at, uiLocale, undefined, tz) })}</p>
                    </div>
                  </div>
                  {enrollment.status !== "abandoned" ? (
                    <div className="flex flex-col gap-1">
                      <ProgressBar value={progress.pct} label={t("programs.progressLabel", { title })} size="sm" />
                      {enrollment.status === "active" ? <p className="type-caption text-fg-muted">{t("programs.progress", { done: progress.done, total: progress.total })}</p> : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {enrollment.program ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/programs/${enrollment.program.slug}`}>{t("programs.open")}</Link>
                      </Button>
                    ) : null}
                    {certificate ? (
                      <Button asChild variant="ghost" size="sm" leadingIcon={<Download />}>
                        <a href={`/api/certificates/${certificate}`} target="_blank" rel="noopener">
                          {t("programs.certificate")}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Conquistas */}
      <section aria-labelledby="achievements-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="achievements-title" className="type-h2 text-fg">
            {t("achievements.title")}
          </h2>
          <p className="type-body-sm text-fg-muted">{t("achievements.description")}</p>
        </div>
        <AchievementsGrid achievements={achievements} earned={earned} timeZone={tz} />
      </section>

      {/* Atividade recente */}
      <section aria-labelledby="recent-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="recent-title" className="type-h2 text-fg">
            {t("recent.title")}
          </h2>
          <p className="type-body-sm text-fg-muted">{t("recent.description")}</p>
        </div>
        {activities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface/60 px-4 py-6 text-center type-body-sm text-fg-muted">{t("recent.empty")}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {activities.map((activity) => {
              const Icon = activity.content ? TYPE_ICON[activity.content.type] : FileText;
              const label = activity.kind === "completed" ? t("recent.completed") : t("recent.progress", { pct: activity.pct ?? 0 });
              const inner = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", activity.kind === "completed" ? "bg-success-soft text-success" : "bg-surface-elevated text-fg-muted")}
                  >
                    {activity.kind === "completed" ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("line-clamp-1 text-sm font-semibold", activity.content ? "text-fg" : "text-fg-muted")}>{activity.content?.title ?? t("recent.unavailable")}</span>
                    <span className="type-caption text-fg-muted">
                      {label} · {formatRelativeTime(activity.at, uiLocale)}
                    </span>
                  </span>
                  {activity.content ? <PillarBadge pillar={activity.content.pillar} size="sm" className="hidden sm:inline-flex" /> : null}
                </>
              );
              return (
                <li key={activity.key}>
                  {activity.content ? (
                    <Link href={`/content/${activity.content.slug}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-h-14 items-center gap-3 px-4 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <p className="type-caption text-fg-muted">{t("disclaimer")}</p>
    </div>
  );
}
